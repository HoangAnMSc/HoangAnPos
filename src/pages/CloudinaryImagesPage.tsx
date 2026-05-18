import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Image as ImageIcon, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { formatDateTime } from "../lib/format";
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

function getRequestErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

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

function formatBytes(value: number | null) {
  if (!value) {
    return "Khong ro";
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 102.4) / 10} KB`;
  }

  return `${Math.round(value / 1024 / 102.4) / 10} MB`;
}

function formatDimensions(item: ImageLibraryItem) {
  if (!item.width || !item.height) {
    return "Khong ro";
  }

  return `${item.width} x ${item.height}px`;
}

export function CloudinaryImagesPage() {
  const { canAccess } = useAuth();
  const [deletingUrls, setDeletingUrls] = useState<string[]>([]);
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [images, setImages] = useState<ImageLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedImage, setSelectedImage] = useState<ImageLibraryItem | null>(null);
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

      const nextImages = createImageLibraryItems(
        nextProducts,
        nextRecords,
        nextCloudinaryResources
      );
      const availableUrls = new Set(nextImages.map((item) => item.url));

      setImages(nextImages);
      setSelectedImage((current) =>
        current && availableUrls.has(current.url)
          ? nextImages.find((item) => item.url === current.url) ?? null
          : null
      );
      setSelectedUrls((current) => {
        const nextSelected = new Set([...current].filter((url) => availableUrls.has(url)));
        return nextSelected;
      });
    } catch (requestError) {
      const message = getRequestErrorMessage(requestError, "Khong tai duoc danh sach anh.");
      setErrorNotice({
        detail:
          "Trang nay can Cloudinary Admin API qua /api/cloudinary-images de hien thi toan bo Media Library.",
        message,
        title: "Khong tai duoc anh Cloudinary",
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
        message: getRequestErrorMessage(requestError, "Tai anh len Cloudinary that bai."),
        title: "Tai anh that bai",
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
          "Can cau hinh CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY va CLOUDINARY_API_SECRET cho Vercel API route /api/cloudinary-images hoac Supabase Edge Function delete-cloudinary-image.",
        message: getRequestErrorMessage(requestError, "Xoa anh Cloudinary that bai."),
        title: "Xoa anh that bai",
      });
    } finally {
      setDeletingUrls([]);
    }
  }

  async function handleDeleteCloudinary(item: ImageLibraryItem) {
    await deleteCloudinaryItems([item], "Xoa anh nay tren Cloudinary?");
  }

  async function handleDeleteSelected() {
    await deleteCloudinaryItems(
      selectedItems,
      `Xoa ${selectedItems.length} anh da chon tren Cloudinary?`
    );
  }

  const usedCount = images.filter((item) => item.products.length > 0).length;
  const unusedCount = images.length - usedCount;
  const cloudinaryCount = images.filter((item) => item.cloudinary).length;

  return (
    <div className="px-4 pb-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <ConfigNotice />

        <section className="rounded-3xl bg-white p-5 shadow-soft ring-1 ring-coal/5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral">{images.length} anh</Badge>
                <Badge tone="neutral">{cloudinaryCount} Cloudinary</Badge>
                <Badge tone="green">{usedCount} dang dung</Badge>
                {unusedCount > 0 ? <Badge tone="amber">{unusedCount} chua gan</Badge> : null}
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
                    {allFilteredSelected ? "Bo chon" : "Chon tat ca"}
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    disabled={selectedItems.length === 0 || deleting}
                    isLoading={deleting}
                    onClick={() => void handleDeleteSelected()}
                    variant="danger"
                  >
                    <Trash2 className="h-4 w-4" />
                    Xoa da chon ({selectedItems.length})
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
                Tai lai
              </Button>
              {canUploadImage ? (
                <label
                  className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-coal px-4 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:shadow-lift ${
                    uploading || deleting ? "pointer-events-none opacity-60" : ""
                  }`}
                >
                  <Upload className="h-4 w-4" />
                  {uploading ? "Dang tai..." : "Tai anh"}
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
              placeholder="Tim theo ten san pham, public_id..."
              value={query}
            />
          </div>
        </section>

        {loading ? (
          <div className="rounded-3xl bg-white p-8 shadow-soft">
            <Spinner label="Dang tai anh..." />
          </div>
        ) : filteredImages.length === 0 ? (
          <EmptyState
            description="Anh upload len Cloudinary se nam o day."
            icon={ImageIcon}
            title="Chua co anh phu hop"
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredImages.map((item) => {
              const busy = deletingUrls.includes(item.url);
              const selected = selectedUrls.has(item.url);
              const productNames = item.products.map((product) => product.name).join(", ");

              return (
                <article
                  className={`relative overflow-hidden rounded-3xl border bg-white shadow-soft transition ${
                    selected ? "border-red-300 ring-4 ring-red-50" : "border-slate-100"
                  }`}
                  key={item.url}
                >
                  {canDeleteImage ? (
                    <label className="absolute left-3 top-3 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl bg-white/95 shadow-sm ring-1 ring-slate-200">
                      <input
                        aria-label={`Chon anh ${item.publicId ?? item.url}`}
                        checked={selected}
                        className="h-5 w-5 accent-red-600"
                        disabled={busy || deleting}
                        onChange={() => toggleImageSelection(item.url)}
                        type="checkbox"
                      />
                    </label>
                  ) : null}

                  <div className="aspect-[1.4] bg-slate-100">
                    <img alt={item.publicId ?? "Cloudinary"} className="h-full w-full object-cover" src={item.url} />
                  </div>

                  <div className="space-y-4 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={item.products.length > 0 ? "green" : "amber"}>
                        {item.products.length > 0 ? `${item.products.length} san pham` : "Chua gan"}
                      </Badge>
                      {item.cloudinary ? <Badge tone="neutral">Cloudinary</Badge> : null}
                      {item.format ? <Badge tone="neutral">{item.format}</Badge> : null}
                    </div>

                    <div>
                      <p className="break-all text-sm font-extrabold text-coal">
                        {item.publicId ?? item.url}
                      </p>
                      <p className="mt-1 truncate text-xs font-semibold text-coal/50">
                        {productNames || "Khong gan san pham"}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-coal/45">
                        {formatDimensions(item)} - {formatBytes(item.bytes)}
                      </p>
                    </div>

                    <div className={`grid gap-2 ${canDeleteImage ? "grid-cols-2" : "grid-cols-1"}`}>
                      <Button
                        className="w-full"
                        disabled={busy}
                        onClick={() => setSelectedImage(item)}
                        variant="secondary"
                      >
                        <Eye className="h-4 w-4" />
                        Chi tiet
                      </Button>
                      {canDeleteImage ? (
                        <Button
                          className="w-full"
                          disabled={busy}
                          isLoading={busy}
                          onClick={() => void handleDeleteCloudinary(item)}
                          variant="danger"
                        >
                          <Trash2 className="h-4 w-4" />
                          Xoa
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button onClick={() => setSelectedImage(null)} type="button" variant="secondary">
              Dong
            </Button>
            {selectedImage && canDeleteImage ? (
              <Button
                disabled={deletingUrls.includes(selectedImage.url)}
                isLoading={deletingUrls.includes(selectedImage.url)}
                onClick={() => void handleDeleteCloudinary(selectedImage)}
                type="button"
                variant="danger"
              >
                <Trash2 className="h-4 w-4" />
                Xoa
              </Button>
            ) : null}
          </div>
        }
        onClose={() => setSelectedImage(null)}
        open={Boolean(selectedImage)}
        size="xl"
        title="Chi tiet anh"
      >
        {selectedImage ? (
          <div className="space-y-5">
            <div className="overflow-hidden rounded-2xl bg-slate-100">
              <img
                alt={selectedImage.publicId ?? "Cloudinary"}
                className="max-h-[58vh] w-full object-contain"
                src={selectedImage.url}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Public ID", value: selectedImage.publicId ?? "Khong ro" },
                { label: "Dinh dang", value: selectedImage.format ?? "Khong ro" },
                { label: "Kich thuoc", value: formatDimensions(selectedImage) },
                { label: "Dung luong", value: formatBytes(selectedImage.bytes) },
                {
                  label: "Ngay tao",
                  value: selectedImage.createdAt
                    ? formatDateTime(selectedImage.createdAt)
                    : "Khong ro",
                },
                {
                  label: "Dang gan san pham",
                  value:
                    selectedImage.products.length > 0
                      ? selectedImage.products.map((product) => product.name).join(", ")
                      : "Khong gan san pham",
                },
              ].map((item) => (
                <div className="rounded-2xl bg-slate-50 px-4 py-3" key={item.label}>
                  <p className="text-xs font-extrabold uppercase tracking-wide text-coal/45">
                    {item.label}
                  </p>
                  <p className="mt-1 break-words font-bold text-coal">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-extrabold uppercase tracking-wide text-coal/45">URL</p>
              <p className="mt-1 break-all text-sm font-bold text-coal">{selectedImage.url}</p>
            </div>
          </div>
        ) : null}
      </Modal>

      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </div>
  );
}
