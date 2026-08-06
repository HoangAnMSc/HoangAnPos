import { type ChangeEvent, useEffect, useState } from "react";
import { Check, ImagePlus, Upload } from "lucide-react";
import { Modal } from "../ui/Modal";

type MediaPickerModalProps = {
  canUploadImage: boolean;
  currentImageUrl: string;
  libraryImages: string[];
  multipleUpload?: boolean;
  open: boolean;
  onClose: () => void;
  onSave: (value: {
    imageUrl: string;
    imageFile: File | null;
    imageFiles: File[];
    previewUrl: string;
  }) => void;
};

export function MediaPickerModal({
  canUploadImage,
  currentImageUrl,
  libraryImages,
  multipleUpload = false,
  onClose,
  onSave,
  open,
}: MediaPickerModalProps) {
  const [activeTab, setActiveTab] = useState<"library" | "upload">("library");
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [draftPreviews, setDraftPreviews] = useState<string[]>([]);
  const [selectedUrl, setSelectedUrl] = useState(currentImageUrl);

  useEffect(() => {
    setActiveTab("library");
    setDraftFiles([]);
    setDraftPreviews([]);
    setSelectedUrl(currentImageUrl);
  }, [currentImageUrl, open]);

  useEffect(
    () => () => {
      draftPreviews.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    },
    [draftPreviews],
  );

  const selectedCount =
    activeTab === "upload" && draftFiles.length
      ? draftFiles.length
      : selectedUrl
        ? 1
        : 0;
  const canSave =
    draftFiles.length > 0 ||
    selectedUrl !== currentImageUrl ||
    Boolean(selectedUrl);

  function clearDraftFiles() {
    setDraftFiles([]);
    setDraftPreviews([]);
  }

  function handleUploadChange(event: ChangeEvent<HTMLInputElement>) {
    if (!canUploadImage) return;

    const nextFiles = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    const acceptedFiles = multipleUpload ? nextFiles : nextFiles.slice(0, 1);

    setDraftFiles(acceptedFiles);
    setDraftPreviews(
      acceptedFiles.map((file) => URL.createObjectURL(file)),
    );
    event.currentTarget.value = "";
  }

  function handleSave() {
    if (activeTab === "upload" && draftFiles.length) {
      onSave({
        imageFile: draftFiles[0] ?? null,
        imageFiles: draftFiles,
        imageUrl: currentImageUrl,
        previewUrl: draftPreviews[0] ?? "",
      });
      return;
    }

    onSave({
      imageFile: null,
      imageFiles: [],
      imageUrl: selectedUrl,
      previewUrl: "",
    });
  }

  return (
    <Modal
      contentClassName="!h-[min(88dvh,720px)]"
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <button
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-950"
            onClick={onClose}
            type="button"
          >
            Hủy
          </button>
          <button
            className="rounded-2xl bg-coal px-5 py-3 text-sm font-extrabold text-white shadow-lg disabled:opacity-50"
            disabled={!canSave}
            onClick={handleSave}
            type="button"
          >
            Lưu
          </button>
        </div>
      }
      onClose={onClose}
      open={open}
      size="md"
      title="Thêm ảnh"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            className={`rounded-xl border px-4 py-2 text-sm font-extrabold ${activeTab === "library" ? "border-coal bg-coal text-white" : "border-slate-200 bg-white text-slate-950"}`}
            onClick={() => setActiveTab("library")}
            type="button"
          >
            Content Library
          </button>
          {canUploadImage ? (
            <button
              className={`rounded-xl border px-4 py-2 text-sm font-extrabold ${activeTab === "upload" ? "border-coal bg-coal text-white" : "border-slate-200 bg-white text-slate-950"}`}
              onClick={() => setActiveTab("upload")}
              type="button"
            >
              Tải ảnh mới
            </button>
          ) : null}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Đã chọn <b className="text-slate-950">{selectedCount}</b>
          </span>
          <button
            className="font-extrabold text-slate-950 underline"
            onClick={() => {
              setSelectedUrl("");
              clearDraftFiles();
            }}
            type="button"
          >
            {selectedUrl || draftFiles.length ? "Bỏ ảnh" : "Chưa chọn ảnh"}
          </button>
        </div>

        {activeTab === "library" ? (
          libraryImages.length ? (
            <div className="grid max-h-[52dvh] grid-cols-3 gap-3 overflow-y-auto pr-1">
              {libraryImages.map((imageUrl) => {
                const selected = selectedUrl === imageUrl;
                return (
                  <button
                    className={`relative aspect-square overflow-hidden rounded-xl border-2 bg-slate-100 ${selected ? "border-moss-500" : "border-transparent hover:border-slate-300"}`}
                    key={imageUrl}
                    onClick={() => setSelectedUrl(imageUrl)}
                    type="button"
                  >
                    <img
                      alt="Ảnh Cloudinary"
                      className="h-full w-full object-cover"
                      src={imageUrl}
                    />
                    <span
                      className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded border ${selected ? "border-moss-500 bg-coal text-white" : "border-slate-300 bg-white text-transparent"}`}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl bg-slate-50 p-5 text-center">
              <ImagePlus className="h-8 w-8 text-slate-400" />
              <p className="mt-3 text-sm font-extrabold">Chưa có ảnh</p>
            </div>
          )
        ) : (
          <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
            {draftPreviews.length ? (
              <div className="mb-4 grid max-h-52 w-full grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                {draftPreviews.map((previewUrl, index) => (
                  <img
                    alt={`Ảnh xem trước ${index + 1}`}
                    className="aspect-square w-full rounded-xl object-cover"
                    key={previewUrl}
                    src={previewUrl}
                  />
                ))}
              </div>
            ) : (
              <span className="mb-4 rounded-2xl bg-white p-4 text-moss-600 shadow-sm">
                <Upload className="h-7 w-7" />
              </span>
            )}
            <span className="text-sm font-extrabold">
              {draftFiles.length
                ? `Đã chọn ${draftFiles.length} ảnh`
                : multipleUpload
                  ? "Chọn nhiều ảnh từ thiết bị"
                  : "Chọn ảnh từ thiết bị"}
            </span>
            {multipleUpload ? (
              <span className="mt-1 text-xs font-semibold text-slate-500">
                Ảnh đầu tiên sẽ làm ảnh đại diện sản phẩm.
              </span>
            ) : null}
            <input
              accept="image/*"
              className="hidden"
              multiple={multipleUpload}
              onChange={handleUploadChange}
              type="file"
            />
          </label>
        )}
      </div>
    </Modal>
  );
}
