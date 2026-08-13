import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { Modal } from "../components/ui/Modal";
import { PageContainer } from "../components/ui/Page";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { useActionNotice } from "../contexts/ActionNoticeContext";
import { getErrorMessage } from "../lib/errors";
import {
  deleteCloudinaryProductImage,
  fetchCloudinaryImageResources,
  getCloudinaryPublicId,
  type CloudinaryImageResource,
  uploadProductImageAsset,
} from "../lib/cloudinary";
import {
  clearProductsImageUrl,
  deleteCloudinaryImageRecord,
  fetchCloudinaryImageRecords,
  saveCloudinaryImageAsset,
} from "../services/cloudinaryImages";
import { fetchProducts } from "../services/products";
import type { CloudinaryImage, Product } from "../types";

type ImageLibraryItem = {
  bytes: number | null;
  cloudinary: CloudinaryImageResource | null;
  createdAt: string;
  format: string | null;
  height: number | null;
  publicId: string | null;
  record: CloudinaryImage | null;
  products: Product[];
  url: string;
  width: number | null;
};

function createImageLibraryItems(
  products: Product[],
  records: CloudinaryImage[],
  cloudinaryResources: CloudinaryImageResource[]
) {
  const items = new Map<string, ImageLibraryItem>();

  cloudinaryResources.forEach((resource) => {
    const url = resource.secure_url || resource.url;

    if (!url) {
      return;
    }

    items.set(url, {
      bytes: resource.bytes ?? null,
      cloudinary: resource,
      createdAt: resource.created_at ?? "",
      format: resource.format ?? null,
      height: resource.height ?? null,
      products: [],
      publicId: resource.public_id || getCloudinaryPublicId(url),
      record: null,
      url,
      width: resource.width ?? null,
    });
  });

  records.forEach((record) => {
    const existing = items.get(record.url);

    if (existing) {
      existing.record = record;
      existing.publicId = existing.publicId || record.public_id || getCloudinaryPublicId(record.url);
    }
  });

  products.forEach((product) => {
    const imageUrl = product.image_url?.trim();

    if (!imageUrl) {
      return;
    }

    const existing = items.get(imageUrl);

    if (existing) {
      existing.products.push(product);
    }
  });

  return Array.from(items.values()).sort((firstItem, secondItem) =>
    secondItem.createdAt.localeCompare(firstItem.createdAt)
  );
}

export function CloudinaryImagesPage() {
  const { canAccess } = useAuth();
  const { confirmAction, showSuccess } = useActionNotice();
  const [deletingUrls, setDeletingUrls] = useState<string[]>([]);
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [images, setImages] = useState<ImageLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewImage, setPreviewImage] = useState<ImageLibraryItem | null>(null);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(() => new Set());
  const [uploading, setUploading] = useState(false);
  const canUploadImage = canAccess("cloudinary-images.upload");
  const canDeleteImage = canAccess("cloudinary-images.delete");

  const loadImages = useCallback(async () => {
    setLoading(true);

    try {
      const [nextProducts, nextRecords, nextCloudinaryResources] = await Promise.all([
        fetchProducts(),
        fetchCloudinaryImageRecords(),
        fetchCloudinaryImageResources(),
      ]);

      const nextImages = createImageLibraryItems(nextProducts, nextRecords, nextCloudinaryResources);
      const availableUrls = new Set(nextImages.map((item) => item.url));

      setImages(nextImages);
      setSelectedUrls((current) => {
        const nextSelected = new Set([...current].filter((url) => availableUrls.has(url)));
        return nextSelected;
      });
    } catch (requestError) {
      const message = getErrorMessage(requestError, "Không tải được danh sách ảnh.");
      setErrorNotice({
        message,
        title: "Không tải được ảnh Cloudinary",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  const selectedItems = useMemo(
    () => images.filter((item) => selectedUrls.has(item.url)),
    [images, selectedUrls]
  );
  const allImagesSelected = images.length > 0 && images.every((item) => selectedUrls.has(item.url));
  const deleting = deletingUrls.length > 0;

  function toggleImageSelection(imageUrl: string) {
    if (!canDeleteImage) {
      return;
    }

    setSelectedUrls((current) => {
      const nextSelected = new Set(current);

      if (nextSelected.has(imageUrl)) {
        nextSelected.delete(imageUrl);
      } else {
        nextSelected.add(imageUrl);
      }

      return nextSelected;
    });
  }

  function toggleAllSelection() {
    if (!canDeleteImage) {
      return;
    }

    setSelectedUrls((current) => {
      const nextSelected = new Set(current);

      if (allImagesSelected) {
        images.forEach((item) => nextSelected.delete(item.url));
      } else {
        images.forEach((item) => nextSelected.add(item.url));
      }

      return nextSelected;
    });
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith("image/")
    );
    event.currentTarget.value = "";

    if (!files.length) {
      return;
    }

    if (!canUploadImage) {
      return;
    }

    setUploading(true);

    try {
      const imageUploads = await Promise.all(files.map(uploadProductImageAsset));
      await Promise.all(imageUploads.map(saveCloudinaryImageAsset));
      await loadImages();
      showSuccess(`Đã thêm ${files.length} ảnh vào thư viện Cloudinary.`);
    } catch (requestError) {
      setErrorNotice({
        message: getErrorMessage(requestError, "Tải ảnh lên Cloudinary thất bại."),
        title: "Tải ảnh thất bại",
      });
    } finally {
      setUploading(false);
    }
  }

  async function deleteCloudinaryItems(items: ImageLibraryItem[], confirmMessage: string) {
    if (!canDeleteImage || items.length === 0 || deleting) {
      return;
    }

    const confirmed = await confirmAction({
      confirmLabel: "Xóa ảnh",
      message: confirmMessage,
      title: "Xác nhận xóa ảnh",
      tone: "danger",
    });

    if (!confirmed) {
      return;
    }

    const urls = items.map((item) => item.url);
    setDeletingUrls(urls);

    try {
      for (const item of items) {
        await deleteCloudinaryProductImage(item.url, {
          deleteToken: item.record?.delete_token,
          deleteTokenExpiresAt: item.record?.delete_token_expires_at,
        });
        await clearProductsImageUrl(item.url);
        await deleteCloudinaryImageRecord(item.url);
      }

      setSelectedUrls((current) => {
        const nextSelected = new Set(current);
        urls.forEach((url) => nextSelected.delete(url));
        return nextSelected;
      });
      setPreviewImage((current) => (current && urls.includes(current.url) ? null : current));
      await loadImages();
      showSuccess(`Đã xóa ${items.length} ảnh khỏi thư viện Cloudinary.`);
    } catch (requestError) {
      setErrorNotice({
        detail:
          "Cần cấu hình CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY và CLOUDINARY_API_SECRET cho API route /api/cloudinary-images trên Vercel hoặc Edge Function delete-cloudinary-image của Supabase.",
        message: getErrorMessage(requestError, "Xóa ảnh Cloudinary thất bại."),
        title: "Xóa ảnh thất bại",
      });
    } finally {
      setDeletingUrls([]);
    }
  }

  async function handleDeleteSelected() {
    await deleteCloudinaryItems(
      selectedItems,
      `Xóa ${selectedItems.length} ảnh đã chọn trên Cloudinary?`
    );
  }

  const usedCount = images.filter((item) => item.products.length > 0).length;
  const unusedCount = images.length - usedCount;
  const cloudinaryCount = images.filter((item) => item.cloudinary).length;

  return (
    <PageContainer className={selectedItems.length > 0 ? "!pb-28" : undefined}>
        <ConfigNotice />

        <section className="rounded-2xl bg-white p-3 shadow-soft ring-1 ring-coal/5 sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex flex-wrap gap-1.5">
                <Badge className="px-2.5 py-1" tone="neutral">{images.length} ảnh</Badge>
                <Badge className="px-2.5 py-1" tone="neutral">{cloudinaryCount} Cloudinary</Badge>
                <Badge className="px-2.5 py-1" tone="green">{usedCount} đang dùng</Badge>
                {unusedCount > 0 ? (
                  <Badge className="px-2.5 py-1" tone="amber">{unusedCount} chưa gắn</Badge>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
              {canDeleteImage ? (
                <Button
                  className="!min-h-9 w-full !rounded-lg !px-3 !py-1.5 !text-xs sm:w-auto"
                  disabled={images.length === 0 || deleting}
                  onClick={toggleAllSelection}
                  variant="secondary"
                >
                  {allImagesSelected ? "Bỏ chọn" : "Chọn tất cả"}
                </Button>
              ) : null}
              {canUploadImage ? (
                <label
                  className={`inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-coal px-3 py-1.5 text-xs font-bold text-white transition hover:bg-ink ${
                    uploading || deleting ? "pointer-events-none opacity-60" : ""
                  }`}
                >
                  <Upload className="h-4 w-4" />
                  {uploading ? "Đang tải ảnh..." : "Tải nhiều ảnh"}
                  <input
                    accept="image/*"
                    className="hidden"
                    multiple
                    onChange={handleUpload}
                    type="file"
                  />
                </label>
              ) : null}
            </div>
          </div>
        </section>

        {loading ? (
          <div className="rounded-3xl bg-white p-8 shadow-soft">
            <Spinner label="Đang tải ảnh..." />
          </div>
        ) : images.length === 0 ? (
          <EmptyState
            description="Ảnh sản phẩm tải lên Cloudinary sẽ hiển thị tại đây."
            icon={ImageIcon}
            title="Chưa có ảnh sản phẩm"
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-4">
            {images.map((item) => {
              const busy = deletingUrls.includes(item.url);
              const selected = selectedUrls.has(item.url);

              return (
                <article
                  className={`relative overflow-hidden rounded-2xl border bg-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift ${
                    selected ? "border-red-300 ring-4 ring-red-50" : "border-slate-100"
                  }`}
                  key={item.url}
                >
                  {canDeleteImage ? (
                    <label className="absolute left-2 top-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-white/95 shadow-sm ring-1 ring-slate-200">
                      <input
                        aria-label={`Chọn ảnh ${item.publicId ?? item.url}`}
                        checked={selected}
                        className="h-4 w-4 accent-red-600"
                        disabled={busy || deleting}
                        onChange={() => toggleImageSelection(item.url)}
                        type="checkbox"
                      />
                    </label>
                  ) : null}

                  <button
                    aria-label={`Xem ảnh ${item.publicId ?? item.url}`}
                    className="group relative block aspect-square w-full overflow-hidden bg-slate-100 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-moss-300"
                    onClick={() => setPreviewImage(item)}
                    type="button"
                  >
                    <img
                      alt={item.publicId ?? "Cloudinary"}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      src={item.url}
                    />
                  </button>
                </article>
              );
            })}
          </div>
        )}

      {canDeleteImage && selectedItems.length > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-red-100 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-14px_36px_rgba(15,23,42,0.14)] backdrop-blur-xl lg:left-72">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2 sm:justify-end">
            <p className="mr-auto min-w-0 truncate text-sm font-extrabold text-slate-700">
              Đã chọn {selectedItems.length} ảnh
            </p>
            <Button
              className="!min-h-10 !rounded-lg !px-3 !py-2 !text-xs"
              disabled={deleting}
              onClick={() => setSelectedUrls(new Set())}
              variant="secondary"
            >
              Bỏ chọn
            </Button>
            <Button
              className="!min-h-10 !rounded-lg !px-3 !py-2 !text-xs"
              isLoading={deleting}
              onClick={() => void handleDeleteSelected()}
              variant="danger"
            >
              <Trash2 className="h-4 w-4" />
              Xóa ảnh
            </Button>
          </div>
        </div>
      ) : null}

      <Modal
        bodyClassName="!p-3 sm:!p-4"
        onClose={() => setPreviewImage(null)}
        open={Boolean(previewImage)}
        size="wide"
        title="Xem ảnh sản phẩm"
      >
        {previewImage ? (
          <div>
            <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 p-2 sm:min-h-[560px]">
              <img
                alt="Ảnh xem trước"
                className="max-h-[68dvh] w-full object-contain"
                src={previewImage.url}
              />
            </div>
          </div>
        ) : null}
      </Modal>

      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </PageContainer>
  );
}
