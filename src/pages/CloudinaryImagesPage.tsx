import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { Input } from "../components/ui/Input";
import { PageContainer } from "../components/ui/Page";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
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
      return;
    }

    items.set(record.url, {
      bytes: null,
      cloudinary: null,
      createdAt: record.created_at,
      format: null,
      height: null,
      products: [],
      publicId: record.public_id || getCloudinaryPublicId(record.url),
      record,
      url: record.url,
      width: null,
    });
  });

  products.forEach((product) => {
    const imageUrl = product.image_url?.trim();

    if (!imageUrl) {
      return;
    }

    const existing = items.get(imageUrl);

    if (existing) {
      existing.products.push(product);
      return;
    }

    items.set(imageUrl, {
      bytes: null,
      cloudinary: null,
      createdAt: product.created_at,
      format: null,
      height: null,
      products: [product],
      publicId: getCloudinaryPublicId(imageUrl),
      record: null,
      url: imageUrl,
      width: null,
    });
  });

  return Array.from(items.values()).sort((firstItem, secondItem) =>
    secondItem.createdAt.localeCompare(firstItem.createdAt)
  );
}

export function CloudinaryImagesPage() {
  const { canAccess } = useAuth();
  const [deletingUrls, setDeletingUrls] = useState<string[]>([]);
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [images, setImages] = useState<ImageLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
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
        // The Admin API is optional. Unsigned uploads only need the cloud name
        // and upload preset; uploaded images are also tracked in Supabase.
        fetchCloudinaryImageResources().catch(() => []),
      ]);

      const nextImages = createImageLibraryItems(
        nextProducts,
        nextRecords,
        nextCloudinaryResources
      );
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

  const filteredImages = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return images;
    }

    return images.filter((item) =>
      [item.url, item.publicId, item.format, ...item.products.map((product) => product.name)]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery))
    );
  }, [images, query]);

  const selectedItems = useMemo(
    () => filteredImages.filter((item) => selectedUrls.has(item.url)),
    [filteredImages, selectedUrls]
  );
  const allFilteredSelected =
    filteredImages.length > 0 && filteredImages.every((item) => selectedUrls.has(item.url));
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

  function toggleFilteredSelection() {
    if (!canDeleteImage) {
      return;
    }

    setSelectedUrls((current) => {
      const nextSelected = new Set(current);

      if (allFilteredSelected) {
        filteredImages.forEach((item) => nextSelected.delete(item.url));
      } else {
        filteredImages.forEach((item) => nextSelected.add(item.url));
      }

      return nextSelected;
    });
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    if (!canUploadImage) {
      return;
    }

    setUploading(true);

    try {
      const imageUpload = await uploadProductImageAsset(file);
      await saveCloudinaryImageAsset(imageUpload);
      await loadImages();
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

    const confirmed = window.confirm(confirmMessage);

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
      await loadImages();
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
    <PageContainer>
        <ConfigNotice />

        <section className="rounded-3xl bg-white p-5 shadow-soft ring-1 ring-coal/5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral">{images.length} ảnh</Badge>
                <Badge tone="neutral">{cloudinaryCount} Cloudinary</Badge>
                <Badge tone="green">{usedCount} đang dùng</Badge>
                {unusedCount > 0 ? <Badge tone="amber">{unusedCount} chưa gắn</Badge> : null}
              </div>
            </div>

            <div className="grid gap-2 sm:flex sm:w-auto">
              {canDeleteImage ? (
                <>
                  <Button
                    className="w-full sm:w-auto"
                    disabled={filteredImages.length === 0 || deleting}
                    onClick={toggleFilteredSelection}
                    variant="secondary"
                  >
                    {allFilteredSelected ? "Bỏ chọn" : "Chọn tất cả"}
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    disabled={selectedItems.length === 0 || deleting}
                    isLoading={deleting}
                    onClick={() => void handleDeleteSelected()}
                    variant="danger"
                  >
                    <Trash2 className="h-4 w-4" />
                    Xóa đã chọn ({selectedItems.length})
                  </Button>
                </>
              ) : null}
              <Button
                className="w-full sm:w-auto"
                disabled={loading || deleting}
                onClick={() => void loadImages()}
                variant="secondary"
              >
                <RefreshCw className="h-4 w-4" />
                Tải lại
              </Button>
              {canUploadImage ? (
                <label
                  className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-coal px-4 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:shadow-lift ${
                    uploading || deleting ? "pointer-events-none opacity-60" : ""
                  }`}
                >
                  <Upload className="h-4 w-4" />
                  {uploading ? "Đang tải..." : "Tải ảnh"}
                  <input accept="image/*" className="hidden" onChange={handleUpload} type="file" />
                </label>
              ) : null}
            </div>
          </div>

          <div className="relative mt-4 w-full xl:max-w-[42vw]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-coal/35" />
            <Input
              className="pl-11"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tên sản phẩm, public_id..."
              value={query}
            />
          </div>
        </section>

        {loading ? (
          <div className="rounded-3xl bg-white p-8 shadow-soft">
            <Spinner label="Đang tải ảnh..." />
          </div>
        ) : filteredImages.length === 0 ? (
          <EmptyState
            description="Ảnh tải lên Cloudinary sẽ hiển thị tại đây."
            icon={ImageIcon}
            title="Chưa có ảnh phù hợp"
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
            {filteredImages.map((item) => {
              const busy = deletingUrls.includes(item.url);
              const selected = selectedUrls.has(item.url);

              return (
                <article
                  className={`relative overflow-hidden rounded-2xl border bg-white shadow-soft transition ${
                    selected ? "border-red-300 ring-4 ring-red-50" : "border-slate-100"
                  }`}
                  key={item.url}
                >
                  {canDeleteImage ? (
                    <label className="absolute left-3 top-3 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl bg-white/95 shadow-sm ring-1 ring-slate-200">
                      <input
                        aria-label={`Chọn ảnh ${item.publicId ?? item.url}`}
                        checked={selected}
                        className="h-5 w-5 accent-red-600"
                        disabled={busy || deleting}
                        onChange={() => toggleImageSelection(item.url)}
                        type="checkbox"
                      />
                    </label>
                  ) : null}

                  <div className="aspect-square bg-slate-100">
                    <img alt={item.publicId ?? "Cloudinary"} className="h-full w-full object-cover" src={item.url} />
                  </div>
                </article>
              );
            })}
          </div>
        )}

      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </PageContainer>
  );
}
