import {
  getCloudinaryPublicId,
  productImageFolder,
  type CloudinaryImageUpload,
} from "../lib/cloudinary";
import { requireSupabaseConfig, supabase } from "../lib/supabase";
import type { CloudinaryImage, Product } from "../types";

function isMissingCloudinaryImagesTable(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.includes("cloudinary_images")
  );
}

export async function fetchCloudinaryImageRecords() {
  requireSupabaseConfig();

  const { data, error } = await supabase
    .from("cloudinary_images")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingCloudinaryImagesTable(error)) {
      return [] as CloudinaryImage[];
    }

    throw error;
  }

  return data ?? [];
}

export async function saveCloudinaryImageRecord(imageUrl: string) {
  return saveCloudinaryImageAsset({
    deleteToken: null,
    deleteTokenExpiresAt: null,
    publicId: getCloudinaryPublicId(imageUrl),
    url: imageUrl,
  });
}

export async function saveCloudinaryImageAsset(image: CloudinaryImageUpload) {
  requireSupabaseConfig();

  const url = image.url.trim();

  if (!url) {
    return null;
  }

  const publicId = image.publicId ?? getCloudinaryPublicId(url);
  const folder = publicId?.includes("/")
    ? publicId.split("/").slice(0, -1).join("/")
    : productImageFolder;

  const { data, error } = await supabase
    .from("cloudinary_images")
    .upsert(
      {
        delete_token: image.deleteToken,
        delete_token_expires_at: image.deleteTokenExpiresAt,
        folder,
        public_id: publicId,
        url,
      },
      { onConflict: "url" }
    )
    .select("*")
    .single();

  if (error) {
    if (isMissingCloudinaryImagesTable(error)) {
      return null;
    }

    if (isMissingCloudinaryImageTokenColumn(error)) {
      return saveCloudinaryImageWithoutDeleteToken(url, publicId, folder);
    }

    throw error;
  }

  return data;
}

function isMissingCloudinaryImageTokenColumn(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    (error.message.includes("'delete_token' column") ||
      error.message.includes("'delete_token_expires_at' column") ||
      error.message.includes("delete_token"))
  );
}

async function saveCloudinaryImageWithoutDeleteToken(
  url: string,
  publicId: string | null,
  folder: string | null
) {
  const { data, error } = await supabase
    .from("cloudinary_images")
    .upsert(
      {
        folder,
        public_id: publicId,
        url,
      },
      { onConflict: "url" }
    )
    .select("*")
    .single();

  if (error) {
    if (isMissingCloudinaryImagesTable(error)) {
      return null;
    }

    throw error;
  }

  return data;
}

export async function deleteCloudinaryImageRecord(imageUrl: string) {
  requireSupabaseConfig();

  const { error } = await supabase.from("cloudinary_images").delete().eq("url", imageUrl);

  if (error && !isMissingCloudinaryImagesTable(error)) {
    throw error;
  }
}

export async function clearProductsImageUrl(imageUrl: string) {
  requireSupabaseConfig();

  const { data, error } = await supabase
    .from("products")
    .update({ image_url: null })
    .eq("image_url", imageUrl)
    .select("*");

  if (error) {
    throw error;
  }

  return (data ?? []) as Product[];
}
