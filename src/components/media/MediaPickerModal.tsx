import { type ChangeEvent, useEffect, useState } from "react";
import { Check, ImagePlus, Upload } from "lucide-react";
import { Modal } from "../ui/Modal";

type MediaPickerModalProps = {
  canUploadImage: boolean;
  currentImageUrl: string;
  libraryImages: string[];
  open: boolean;
  onClose: () => void;
  onSave: (value: { imageUrl: string; imageFile: File | null; previewUrl: string }) => void;
};

export function MediaPickerModal({
  canUploadImage,
  currentImageUrl,
  libraryImages,
  onClose,
  onSave,
  open,
}: MediaPickerModalProps) {
  const [activeTab, setActiveTab] = useState<"library" | "upload">("library");
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [draftPreview, setDraftPreview] = useState("");
  const [selectedUrl, setSelectedUrl] = useState(currentImageUrl);

  useEffect(() => {
    setActiveTab("library");
    setDraftFile(null);
    setDraftPreview("");
    setSelectedUrl(currentImageUrl);
  }, [currentImageUrl, open]);

  useEffect(() => () => {
    if (draftPreview.startsWith("blob:")) URL.revokeObjectURL(draftPreview);
  }, [draftPreview]);

  const selectedCount = activeTab === "upload" && draftFile ? 1 : selectedUrl ? 1 : 0;
  const canSave = Boolean(draftFile) || selectedUrl !== currentImageUrl || Boolean(selectedUrl);

  function handleUploadChange(event: ChangeEvent<HTMLInputElement>) {
    if (!canUploadImage) return;
    const nextFile = event.target.files?.[0] ?? null;
    if (draftPreview.startsWith("blob:")) URL.revokeObjectURL(draftPreview);
    setDraftFile(nextFile);
    setDraftPreview(nextFile ? URL.createObjectURL(nextFile) : "");
  }

  function handleSave() {
    if (activeTab === "upload" && draftFile && draftPreview) {
      onSave({ imageFile: draftFile, imageUrl: currentImageUrl, previewUrl: draftPreview });
      return;
    }
    onSave({ imageFile: null, imageUrl: selectedUrl, previewUrl: "" });
  }

  return (
    <Modal
      contentClassName="!h-[min(88dvh,720px)]"
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <button className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-950" onClick={onClose} type="button">Hủy</button>
          <button className="rounded-2xl bg-coal px-5 py-3 text-sm font-extrabold text-white shadow-lg disabled:opacity-50" disabled={!canSave} onClick={handleSave} type="button">Lưu</button>
        </div>
      }
      onClose={onClose}
      open={open}
      size="md"
      title="Thêm ảnh"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button className={`rounded-xl border px-4 py-2 text-sm font-extrabold ${activeTab === "library" ? "border-coal bg-coal text-white" : "border-slate-200 bg-white text-slate-950"}`} onClick={() => setActiveTab("library")} type="button">Content Library</button>
          {canUploadImage ? <button className={`rounded-xl border px-4 py-2 text-sm font-extrabold ${activeTab === "upload" ? "border-coal bg-coal text-white" : "border-slate-200 bg-white text-slate-950"}`} onClick={() => setActiveTab("upload")} type="button">Tải ảnh mới</button> : null}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Đã chọn <b className="text-slate-950">{selectedCount}</b></span>
          <button className="font-extrabold text-slate-950 underline" onClick={() => { setSelectedUrl(""); setDraftFile(null); setDraftPreview(""); }} type="button">{selectedUrl || draftFile ? "Bỏ ảnh" : "Chưa chọn ảnh"}</button>
        </div>
        {activeTab === "library" ? (
          libraryImages.length ? <div className="grid max-h-[52dvh] grid-cols-3 gap-3 overflow-y-auto pr-1">{libraryImages.map((imageUrl) => {
            const selected = selectedUrl === imageUrl;
            return <button className={`relative aspect-square overflow-hidden rounded-xl border-2 bg-slate-100 ${selected ? "border-moss-500" : "border-transparent hover:border-slate-300"}`} key={imageUrl} onClick={() => setSelectedUrl(imageUrl)} type="button"><img alt="Ảnh Cloudinary" className="h-full w-full object-cover" src={imageUrl} /><span className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded border ${selected ? "border-moss-500 bg-coal text-white" : "border-slate-300 bg-white text-transparent"}`}><Check className="h-3.5 w-3.5" /></span></button>;
          })}</div> : <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl bg-slate-50 p-5 text-center"><ImagePlus className="h-8 w-8 text-slate-400" /><p className="mt-3 text-sm font-extrabold">Chưa có ảnh</p></div>
        ) : (
          <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
            {draftPreview ? <img alt="Ảnh xem trước" className="mb-4 h-32 w-32 rounded-2xl object-cover" src={draftPreview} /> : <span className="mb-4 rounded-2xl bg-white p-4 text-moss-600 shadow-sm"><Upload className="h-7 w-7" /></span>}
            <span className="text-sm font-extrabold">{draftFile ? draftFile.name : "Chọn ảnh từ thiết bị"}</span>
            <input accept="image/*" className="hidden" onChange={handleUploadChange} type="file" />
          </label>
        )}
      </div>
    </Modal>
  );
}
