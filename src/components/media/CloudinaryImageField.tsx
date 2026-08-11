import { ChevronRight, Image as ImageIcon, Images, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  fetchCloudinaryImageResources,
  getCloudinaryPublicId,
  uploadProductImageAsset,
} from "../../lib/cloudinary";
import {
  fetchCloudinaryImageRecords,
  saveCloudinaryImageAsset,
} from "../../services/cloudinaryImages";
import { MediaPickerModal } from "./MediaPickerModal";

export type CloudinaryImageValue = {
  imageUrl: string;
  publicId: string | null;
};

type Props = {
  appearance?: "default" | "row";
  compact?: boolean;
  imageUrl: string | null | undefined;
  label?: string;
  onChange: (value: CloudinaryImageValue) => void;
  publicId?: string | null;
};

export function CloudinaryImageField({
  appearance = "default",
  compact = false,
  imageUrl,
  label = "Ảnh",
  onChange,
  publicId,
}: Props) {
  const { canAccess } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [libraryImages, setLibraryImages] = useState<string[]>([]);
  const canUpload = canAccess("cloudinary-images.upload");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      fetchCloudinaryImageResources("products").catch(() => []),
      fetchCloudinaryImageRecords().catch(() => []),
    ])
      .then(([resources, records]) => {
        if (!active) return;
        setLibraryImages(
          Array.from(
            new Set([
              ...resources.map((resource) => resource.secure_url),
              ...records.map((record) => record.url),
            ]),
          ).filter(Boolean),
        );
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Không tải được thư viện Cloudinary.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  const resolvedPublicId = useMemo(
    () => publicId || (imageUrl ? getCloudinaryPublicId(imageUrl) : null),
    [imageUrl, publicId],
  );

  async function save(value: { imageUrl: string; imageFile: File | null }) {
    setSaving(true);
    setError("");
    try {
      if (value.imageFile) {
        const uploaded = await uploadProductImageAsset(value.imageFile);
        await saveCloudinaryImageAsset(uploaded);
        onChange({ imageUrl: uploaded.url, publicId: uploaded.publicId });
      } else {
        onChange({
          imageUrl: value.imageUrl,
          publicId: value.imageUrl
            ? getCloudinaryPublicId(value.imageUrl)
            : null,
        });
      }
      setOpen(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không thể lưu ảnh Cloudinary.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {appearance === "row" ? (
        <div className="space-y-2">
          <span className="block text-sm font-bold text-slate-800">
            {label}
          </span>
          <button
            className="flex min-h-[62px] w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-moss-300 hover:bg-moss-50"
            onClick={() => setOpen(true)}
            type="button"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-50 text-slate-800">
              {imageUrl ? (
                <img
                  alt={label}
                  className="h-full w-full object-cover"
                  src={imageUrl}
                />
              ) : (
                <ImageIcon className="h-5 w-5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm font-extrabold text-slate-950">
                Thêm ảnh
              </strong>
              {imageUrl ? (
                <small className="block truncate text-xs font-semibold text-slate-500">
                  Đã chọn hình ảnh
                </small>
              ) : null}
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-800" />
          </button>
          {error ? (
            <p className="text-xs font-semibold text-red-600">{error}</p>
          ) : null}
        </div>
      ) : (
        <div className={compact ? "space-y-1" : "space-y-2"}>
          {!compact ? (
            <span className="block text-sm font-bold text-slate-700">
              {label}
            </span>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              className={`group flex min-w-0 items-center overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:border-moss-400 hover:bg-moss-50 ${compact ? "h-10 w-28 px-2" : "min-h-16 flex-1 p-2"}`}
              onClick={() => setOpen(true)}
              type="button"
            >
              <span
                className={`grid shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-400 ${compact ? "h-8 w-8" : "h-12 w-12"}`}
              >
                {imageUrl ? (
                  <img
                    alt={label}
                    className="h-full w-full object-cover"
                    src={imageUrl}
                  />
                ) : (
                  <ImageIcon className="h-5 w-5" />
                )}
              </span>
              <span className="min-w-0 flex-1 px-2">
                <strong className="block truncate text-xs">
                  {imageUrl ? "Đổi ảnh" : "Chọn ảnh"}
                </strong>
                {!compact ? (
                  <small className="block truncate text-[11px] text-slate-500">
                    {resolvedPublicId || "Từ thư viện Cloudinary"}
                  </small>
                ) : null}
              </span>
              <Images className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-moss-700" />
            </button>
            {imageUrl ? (
              <button
                aria-label={`Bỏ ${label}`}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-red-100 bg-red-50 text-red-600"
                onClick={() => onChange({ imageUrl: "", publicId: null })}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          {error ? (
            <p className="text-xs font-semibold text-red-600">{error}</p>
          ) : null}
        </div>
      )}
      <MediaPickerModal
        canUploadImage={canUpload}
        currentImageUrl={imageUrl ?? ""}
        libraryImages={libraryImages}
        loading={loading}
        onClose={() => setOpen(false)}
        onSave={(value) => void save(value)}
        open={open}
        saving={saving}
      />
    </>
  );
}
