import { createAuthHeaders } from "./apiClient";
import { requireSupabaseConfig, supabase } from "./supabase";

const cloudName =
  import.meta.env.CLOUDINARY_CLOUD_NAME || import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const uploadPreset =
  import.meta.env.CLOUDINARY_UPLOAD_PRESET || import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export const productImageFolder = "hoang-an-pos/products";
export const isCloudinaryConfigured = Boolean(cloudName && uploadPreset);

type CloudinaryUploadResponse = {
  delete_token?: string;
  error?: {
    message?: string;
  };
  public_id?: string;
  secure_url?: string;
};

export type CloudinaryImageUpload = {
  deleteToken: string | null;
  deleteTokenExpiresAt: string | null;
  publicId: string | null;
  url: string;
};

type CloudinaryDeleteResponse = {
  ok?: boolean;
  result?: string;
  message?: string;
};

export type CloudinaryImageResource = {
  bytes?: number;
  created_at?: string;
  format?: string;
  height?: number;
  public_id: string;
  secure_url: string;
  url?: string;
  width?: number;
};

export async function uploadProductImage(file: File) {
  const upload = await uploadImage(file, productImageFolder);
  return upload.url;
}

export async function uploadProductImageAsset(file: File) {
  return uploadImage(file, productImageFolder);
}

export async function uploadPaymentProof(file: File) {
  const upload = await uploadImage(file, "hoang-an-pos/payment-proofs");
  return upload.url;
}

export async function uploadPaymentQr(file: File) {
  const upload = await uploadImage(file, "hoang-an-pos/payment-qr");
  return upload.url;
}

export function getCloudinaryPublicId(imageUrl: string) {
  try {
    const url = new URL(imageUrl);

    if (!url.hostname.includes("cloudinary.com")) {
      return null;
    }

    const marker = "/image/upload/";
    const markerIndex = url.pathname.indexOf(marker);

    if (markerIndex === -1) {
      return null;
    }

    const rawPath = url.pathname.slice(markerIndex + marker.length);
    const segments = rawPath.split("/").filter(Boolean).map(decodeURIComponent);
    const versionIndex = segments.findIndex((segment) => /^v\d+$/.test(segment));
    const publicIdSegments = versionIndex >= 0 ? segments.slice(versionIndex + 1) : segments;

    if (publicIdSegments.length === 0) {
      return null;
    }

    const lastSegment = publicIdSegments[publicIdSegments.length - 1].replace(
      /\.[a-z0-9]+$/i,
      ""
    );

    return [...publicIdSegments.slice(0, -1), lastSegment].join("/");
  } catch {
    return null;
  }
}

export async function deleteCloudinaryProductImage(
  imageUrl: string,
  options?: { deleteToken?: string | null; deleteTokenExpiresAt?: string | null }
) {
  const publicId = getCloudinaryPublicId(imageUrl);

  if (!publicId) {
    throw new Error("Không nhận diện được public_id của ảnh Cloudinary.");
  }

  if (options?.deleteToken && isDeleteTokenUsable(options.deleteTokenExpiresAt)) {
    try {
      return await deleteCloudinaryImageByToken(options.deleteToken);
    } catch {
      // Fall through to server-side deletion. Delete tokens only work briefly after upload.
    }
  }

  try {
    return await deleteCloudinaryImageViaAppApi(publicId);
  } catch {
    return deleteCloudinaryImageViaSupabase(publicId);
  }
}

function isDeleteTokenUsable(expiresAt?: string | null) {
  if (!expiresAt) {
    return false;
  }

  return new Date(expiresAt).getTime() > Date.now();
}

async function deleteCloudinaryImageByToken(deleteToken: string) {
  if (!cloudName) {
    throw new Error("Chưa cấu hình CLOUDINARY_CLOUD_NAME.");
  }

  const formData = new FormData();
  formData.append("token", deleteToken);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/delete_by_token`, {
    body: formData,
    method: "POST",
  });
  const data = (await response.json()) as CloudinaryDeleteResponse;

  if (!response.ok || data.result !== "ok") {
    throw new Error(data.message || "Delete token của Cloudinary không còn hiệu lực.");
  }

  return { ok: true, result: data.result };
}

async function deleteCloudinaryImageViaAppApi(publicId: string) {
  const response = await fetch("/api/cloudinary-images", {
    body: JSON.stringify({ publicId }),
    headers: await createAuthHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error("API xóa ảnh của ứng dụng chưa khả dụng.");
  }

  const data = (await response.json()) as CloudinaryDeleteResponse;

  if (!response.ok || !data.ok) {
    throw new Error(data.message || "Xóa ảnh Cloudinary thất bại.");
  }

  return data;
}

export async function fetchCloudinaryImageResources() {
  const response = await fetch("/api/cloudinary-images", {
    headers: await createAuthHeaders(),
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error("API lấy danh sách ảnh Cloudinary chưa khả dụng.");
  }

  const data = (await response.json()) as {
    message?: string;
    ok?: boolean;
    resources?: CloudinaryImageResource[];
  };

  if (!response.ok || !data.ok) {
    throw new Error(data.message || "Không tải được ảnh từ Cloudinary.");
  }

  return data.resources ?? [];
}

async function deleteCloudinaryImageViaSupabase(publicId: string) {
  requireSupabaseConfig();

  const { data, error } = await supabase.functions.invoke<CloudinaryDeleteResponse>(
    "delete-cloudinary-image",
    {
      body: { publicId },
    }
  );

  if (error) {
    throw new Error(error.message || "Xóa ảnh Cloudinary thất bại.");
  }

  if (!data?.ok) {
    throw new Error(data?.message || "Cloudinary không xác nhận đã xóa ảnh.");
  }

  return data;
}

async function uploadImage(file: File, folder: string): Promise<CloudinaryImageUpload> {
  if (!cloudName || !uploadPreset) {
    throw new Error(
      "Chưa cấu hình Cloudinary. Hãy điền CLOUDINARY_CLOUD_NAME và CLOUDINARY_UPLOAD_PRESET trong file .env."
    );
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("File đã chọn không phải là ảnh hợp lệ.");
  }

  if (file.size === 0) {
    throw new Error("File ảnh đang trống.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);
  formData.append("folder", folder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: formData,
  });
  const data = (await response.json().catch(() => null)) as CloudinaryUploadResponse | null;

  if (!response.ok) {
    const cloudinaryMessage = data?.error?.message?.trim();
    throw new Error(
      cloudinaryMessage
        ? `Cloudinary: ${cloudinaryMessage}`
        : `Tải ảnh lên Cloudinary thất bại (HTTP ${response.status}).`
    );
  }

  if (!data?.secure_url) {
    throw new Error("Cloudinary không trả về đường dẫn ảnh hợp lệ.");
  }

  return {
    deleteToken: data.delete_token ?? null,
    deleteTokenExpiresAt: data.delete_token
      ? new Date(Date.now() + 9 * 60 * 1000).toISOString()
      : null,
    publicId: data.public_id ?? getCloudinaryPublicId(data.secure_url),
    url: data.secure_url,
  };
}
