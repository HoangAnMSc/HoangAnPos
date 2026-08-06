import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  Barcode,
  Boxes,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers3,
  LayoutTemplate,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  Settings,
} from "lucide-react";
import { MediaPickerModal } from "../components/media/MediaPickerModal";
import { Ean13LabelsModal } from "../components/products/Ean13LabelsModal";
import { Ean13ScannerModal } from "../components/products/Ean13ScannerModal";
import {
  NoImagePlaceholder,
  ProductCard,
} from "../components/products/ProductCard";
import { ProductSettingsModal } from "../components/products/ProductSettingsModal";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import {
  ErrorNoticeModal,
  type ErrorNotice,
} from "../components/ui/ErrorNoticeModal";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { useErrorNotice } from "../hooks/useErrorNotice";
import { getErrorMessage } from "../lib/errors";
import {
  formatCurrency,
  formatIntegerInput,
  normalizeIntegerInput,
} from "../lib/format";
import {
  createVietnamEan13FromSeed,
  findProductByEan13,
  formatProductDate,
  getExpiryLabel,
  getExpiryStatus,
  getExpiryTone,
  getProductEan13Value,
  isValidEan13,
  normalizeEan13Input,
} from "../lib/productDisplay";
import {
  fetchCloudinaryImageResources,
  uploadProductImageAsset,
  uploadProductVideoAsset,
} from "../lib/cloudinary";
import { normalizeNullableText } from "../lib/text";
import {
  buildVariantCombinations,
  emptyForm,
  fieldClassName,
  getEnabledProductDetailItems,
  getProductAttributes,
  getProductVariantDefinitions,
  getProductVariantLabel,
  getProductVariants,
  getVariantStock,
  labelClassName,
  linkedFieldLabels,
  type ProductFormState,
  type ProductVariant,
} from "../lib/productPageData";
import { saveCloudinaryImageAsset } from "../services/cloudinaryImages";
import {
  createProductCategory,
  createProduct,
  deleteProduct,
  fetchProductBatches,
  fetchProductCategories,
  fetchProducts,
  receiveProductStock,
  updateProduct,
  type ProductInput,
  type ReceiveStockInput,
} from "../services/products";
import type { Product, ProductBatch } from "../types";
import {
  defaultProductSettings,
  fetchProductSettings,
  saveProductSettings,
  type CustomProductAttribute,
  type ProductSettings,
} from "../services/productSettings";

function MultiMediaField({
  label,
  value,
  libraryImages,
  uploading,
  onChange,
  onFiles,
}: {
  label: string;
  value: { images?: string[]; video?: string };
  libraryImages: string[];
  uploading: boolean;
  onChange: (value: { images?: string[]; video?: string }) => void;
  onFiles: (files: FileList | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"library" | "upload">("library");
  const [snapshot, setSnapshot] = useState(value);
  const images = value.images ?? [];
  const toggleImage = (url: string) =>
    onChange({
      ...value,
      images: images.includes(url)
        ? images.filter((item) => item !== url)
        : [...images, url].slice(0, 10),
    });
  return (
    <>
      <button
        className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-moss-300 hover:bg-moss-50"
        onClick={() => {
          setActiveTab("library");
          setSnapshot(value);
          setOpen(true);
        }}
        type="button"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
          {images[0] ? (
            <img
              alt={label}
              className="h-full w-full object-cover"
              src={images[0]}
            />
          ) : (
            <ImageIcon className="h-5 w-5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-sm text-slate-950">{label}</strong>
          <small className="block text-xs font-semibold text-slate-500">
            {images.length}/10 ảnh Cloudinary ·{" "}
            {value.video ? "Đã có video" : "Chưa có video"}
          </small>
        </span>
        <ChevronRight className="h-5 w-5 text-slate-500" />
      </button>
      <Modal
        contentClassName="!h-[min(88dvh,720px)]"
        footer={
          <div className="grid w-full grid-cols-2 gap-2">
            <Button
              onClick={() => {
                onChange(snapshot);
                setOpen(false);
              }}
              variant="secondary"
            >
              Hủy
            </Button>
            <Button onClick={() => setOpen(false)}>Lưu</Button>
          </div>
        }
        onClose={() => {
          onChange(snapshot);
          setOpen(false);
        }}
        open={open}
        size="md"
        title="Thêm ảnh"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            <button
              className={`rounded-lg px-3 py-2 text-sm font-extrabold ${activeTab === "library" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
              onClick={() => setActiveTab("library")}
              type="button"
            >
              Content Library
            </button>
            <button
              className={`rounded-lg px-3 py-2 text-sm font-extrabold ${activeTab === "upload" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
              onClick={() => setActiveTab("upload")}
              type="button"
            >
              Tải ảnh mới
            </button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">
              Đã chọn{" "}
              <b className="text-slate-950">
                {images.length + (value.video ? 1 : 0)}
              </b>
            </span>
            <button
              className="font-extrabold text-slate-950 underline"
              onClick={() => onChange({ images: [], video: "" })}
              type="button"
            >
              {images.length || value.video ? "Bỏ ảnh" : "Chưa chọn ảnh"}
            </button>
          </div>
          {activeTab === "library" ? (
            <>
              {libraryImages.length ? (
                <div className="grid max-h-[52dvh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
                  {libraryImages.map((url) => {
                    const selected = images.includes(url);
                    return (
                      <button
                        className={`relative aspect-square overflow-hidden rounded-xl border-2 bg-slate-100 ${selected ? "border-moss-600 ring-2 ring-moss-100" : "border-transparent hover:border-slate-300"}`}
                        key={url}
                        onClick={() => toggleImage(url)}
                        type="button"
                      >
                        <img
                          alt="Ảnh Cloudinary"
                          className="h-full w-full object-cover"
                          src={url}
                        />
                        <span
                          className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded ${selected ? "bg-coal text-white" : "bg-white text-transparent"}`}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">
                  Cloudinary chưa có hình ảnh.
                </div>
              )}
            </>
          ) : (
            <div className="pt-1">
              {value.video ? (
                <div className="relative overflow-hidden rounded-xl bg-black">
                  <video
                    className="max-h-48 w-full"
                    controls
                    src={value.video}
                  />
                  <button
                    className="absolute right-2 top-2 rounded-full bg-white p-2 text-red-600"
                    onClick={() => onChange({ ...value, video: "" })}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
              <label
                className={`mt-3 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 p-3 text-sm font-extrabold ${uploading ? "pointer-events-none opacity-50" : ""}`}
              >
                <Plus className="mr-2 h-4 w-4" />
                {uploading
                  ? "Đang tải lên Cloudinary..."
                  : "Chọn ảnh hoặc video từ thiết bị"}
                <input
                  accept="image/*,video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  multiple
                  onChange={(event) => {
                    onFiles(event.target.files);
                    event.target.value = "";
                  }}
                  type="file"
                />
              </label>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

function productToForm(
  product?: Product | null,
  initialEan13 = "",
): ProductFormState {
  if (!product) {
    return { ...emptyForm, ean13: initialEan13 };
  }

  return {
    category: product.category ?? "",
    cost_price: String(product.cost_price),
    description: product.description ?? "",
    expiry_date: product.expiry_date ?? "",
    image_url: product.image_url ?? "",
    import_date: product.import_date ?? "",
    is_active: product.is_active,
    is_reward: product.is_reward,
    name: product.name,
    price: String(product.price),
    reward_points_cost: String(product.reward_points_cost),
    ean13: normalizeEan13Input(product.sku),
    stock: String(product.stock),
    shelf_stock: String(product.shelf_stock),
  };
}

function mergeCategoryNames(values: Array<string | null | undefined>) {
  const categories = new Map<string, string>();

  values.forEach((value) => {
    const category = value?.trim();
    if (!category) {
      return;
    }

    const key = category.toLowerCase();
    if (!categories.has(key)) {
      categories.set(key, category);
    }
  });

  return Array.from(categories.values()).sort((firstCategory, secondCategory) =>
    firstCategory.localeCompare(secondCategory),
  );
}

function createUniqueVietnamEan13(products: Product[]) {
  const usedCodes = new Set(
    products.map((product) => getProductEan13Value(product)),
  );

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = createVietnamEan13FromSeed(
      `new-product:${Date.now()}:${Math.random().toString(36).slice(2)}:${attempt}`,
    );

    if (!usedCodes.has(code)) {
      return code;
    }
  }

  return createVietnamEan13FromSeed(`new-product:fallback:${Date.now()}`);
}

type ProductEan13GateModalProps = {
  open: boolean;
  products: Product[];
  onClose: () => void;
  onError: (notice: ErrorNotice) => void;
  onSelect: (ean13: string) => void;
};

function ProductEan13GateModal({
  onClose,
  onError,
  onSelect,
  open,
  products,
}: ProductEan13GateModalProps) {
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setScannerOpen(false);
    }
  }, [open]);

  function acceptEan13(value: string) {
    const ean13Code = normalizeEan13Input(value);
    const existingProduct = findProductByEan13(products, ean13Code);

    if (!isValidEan13(ean13Code)) {
      onError({
        message: "Mã EAN-13 phải có đúng 13 chữ số và đúng số kiểm tra.",
        title: "EAN-13 không hợp lệ",
      });
      return;
    }

    if (existingProduct) {
      onError({
        detail: `Mã này đang gắn với sản phẩm "${existingProduct.name}".`,
        message: `EAN-13 ${ean13Code} đã tồn tại trong cơ sở dữ liệu.`,
        title: "EAN-13 đã tồn tại",
      });
      return;
    }

    onSelect(ean13Code);
  }

  function createAutoEan13() {
    acceptEan13(createUniqueVietnamEan13(products));
  }

  return (
    <>
      <Modal
        footer={
          <Button onClick={onClose} variant="secondary">
            Hủy
          </Button>
        }
        onClose={onClose}
        open={open}
        size="md"
        title="Chọn mã EAN-13"
      >
        <div className="space-y-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-extrabold text-slate-950">
              Sản phẩm mới cần có mã EAN-13 trước khi nhập thông tin.
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              Quét mã có sẵn trên bao bì hoặc tạo mã Việt Nam bắt đầu bằng 893
              để in tem và dán lên sản phẩm.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              className="flex min-h-36 flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-moss-300 hover:bg-moss-50"
              onClick={() => setScannerOpen(true)}
              type="button"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-moss-100 text-moss-700">
                <Barcode className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-base font-extrabold text-slate-950">
                  Quét EAN-13
                </span>
                <span className="mt-1 block text-sm font-semibold leading-5 text-slate-500">
                  Dùng khi sản phẩm đã có mã vạch trên bao bì.
                </span>
              </span>
            </button>

            <button
              className="flex min-h-36 flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-moss-300 hover:bg-moss-50"
              onClick={createAutoEan13}
              type="button"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-moss-100 text-moss-700">
                <PackagePlus className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-base font-extrabold text-slate-950">
                  Tạo mã Việt Nam
                </span>
                <span className="mt-1 block text-sm font-semibold leading-5 text-slate-500">
                  Tạo EAN-13 với tiền tố 893 cho sản phẩm chưa có mã.
                </span>
              </span>
            </button>
          </div>
        </div>
      </Modal>

      <Ean13ScannerModal
        description="Quét EAN-13 có sẵn trên bao bì. Nếu mã chưa có trong cơ sở dữ liệu, hệ thống sẽ dùng mã này cho sản phẩm mới."
        onClose={() => setScannerOpen(false)}
        onDetected={acceptEan13}
        open={open && scannerOpen}
        title="Quét EAN-13 sản phẩm mới"
      />
    </>
  );
}

/* MediaPickerModal is shared with payment settings. */
/*
type MediaPickerModalProps = {
  canUploadImage: boolean;
  currentImageUrl: string;
  libraryImages: string[];
  open: boolean;
  onClose: () => void;
  onSave: (value: { imageUrl: string; imageFile: File | null; previewUrl: string }) => void;
};

function LegacyMediaPickerModal({
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

  useEffect(() => {
    return () => {
      if (draftPreview.startsWith("blob:")) {
        URL.revokeObjectURL(draftPreview);
      }
    };
  }, [draftPreview]);

  const selectedCount = activeTab === "upload" && draftFile ? 1 : selectedUrl ? 1 : 0;
  const canSave =
    Boolean(draftFile) || selectedUrl !== currentImageUrl || Boolean(selectedUrl);

  function handleUploadChange(event: ChangeEvent<HTMLInputElement>) {
    if (!canUploadImage) {
      return;
    }

    const nextFile = event.target.files?.[0] ?? null;

    if (draftPreview.startsWith("blob:")) {
      URL.revokeObjectURL(draftPreview);
    }

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
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <button
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-950 transition hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-2xl bg-coal px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-coal/15 transition hover:bg-coal/90 disabled:cursor-not-allowed disabled:opacity-50"
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
            className={`rounded-xl border px-4 py-2 text-sm font-extrabold transition ${
              activeTab === "library"
                ? "border-coal bg-coal text-white"
                : "border-slate-200 bg-white text-slate-950"
            }`}
            onClick={() => setActiveTab("library")}
            type="button"
          >
            Content Library
          </button>
          {canUploadImage ? (
            <button
              className={`rounded-xl border px-4 py-2 text-sm font-extrabold transition ${
                activeTab === "upload"
                  ? "border-coal bg-coal text-white"
                  : "border-slate-200 bg-white text-slate-950"
              }`}
              onClick={() => setActiveTab("upload")}
              type="button"
            >
              Tải ảnh mới
            </button>
          ) : null}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Đã chọn <span className="font-extrabold text-slate-950">{selectedCount}</span>
          </span>
          <button
            className="font-extrabold text-slate-950 underline"
            onClick={() => {
              setSelectedUrl("");
              setDraftFile(null);
              setDraftPreview("");
            }}
            type="button"
          >
            {selectedUrl || draftFile ? "Bo ảnh" : "Chưa chọn ảnh"}
          </button>
        </div>

        {activeTab === "library" ? (
          libraryImages.length > 0 ? (
            <div className="grid max-h-80 grid-cols-3 gap-3 overflow-y-auto pr-1">
              {libraryImages.map((imageUrl) => {
                const selected = selectedUrl === imageUrl;

                return (
                  <button
                    className={`relative aspect-square overflow-hidden rounded-xl border-2 bg-slate-100 transition ${
                      selected ? "border-moss-500" : "border-transparent hover:border-slate-300"
                    }`}
                    key={imageUrl}
                    onClick={() => setSelectedUrl(imageUrl)}
                    type="button"
                  >
                    <img alt="Product" className="h-full w-full object-cover" src={imageUrl} />
                    <span
                      className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded border text-[10px] ${
                        selected
                          ? "border-moss-500 bg-coal text-white"
                          : "border-slate-300 bg-white text-transparent"
                      }`}
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
              <p className="mt-3 text-sm font-extrabold text-slate-950">No media yet</p>
              <p className="mt-1 text-xs text-slate-500">Tải ảnh mới cho sản phẩm này.</p>
            </div>
          )
        ) : (
          <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center transition hover:border-moss-500 hover:bg-moss-50">
            {draftPreview ? (
              <img
                alt="Ảnh xem trước"
                className="mb-4 h-32 w-32 rounded-2xl object-cover"
                src={draftPreview}
              />
            ) : (
              <span className="mb-4 rounded-2xl bg-white p-4 text-moss-600 shadow-sm">
                <Upload className="h-7 w-7" />
              </span>
            )}
            <span className="text-sm font-extrabold text-slate-950">
              {draftFile ? draftFile.name : "Choose image from device"}
            </span>
            <span className="mt-1 text-xs text-slate-500">
              Image uploads to Cloudinary when thể product is saved.
            </span>
            <input accept="image/*" className="hidden" onChange={handleUploadChange} type="file" />
          </label>
        )}
      </div>
    </Modal>
  );
}
*/

type ProductFormProps = {
  canCreateCategory: boolean;
  canSetVisibility: boolean;
  canUploadImage: boolean;
  categories: string[];
  ean13Locked?: boolean;
  ean13Required?: boolean;
  formId: string;
  initialEan13?: string;
  libraryImages: string[];
  product?: Product | null;
  submitting: boolean;
  settings: ProductSettings;
  onAddCategory: (name: string) => Promise<string>;
  onCreateVariant: (input: {
    name: string;
    options: string[];
    type: "single" | "multiple";
  }) => Promise<CustomProductAttribute>;
  onSubmit: (input: ProductInput, imageFiles: File[]) => Promise<void>;
};

function ProductForm({
  canCreateCategory,
  canSetVisibility,
  canUploadImage,
  categories,
  ean13Locked = false,
  ean13Required = false,
  formId,
  initialEan13 = "",
  libraryImages,
  onAddCategory,
  onCreateVariant,
  onSubmit,
  product,
  submitting,
  settings,
}: ProductFormProps) {
  const [form, setForm] = useState<ProductFormState>(() =>
    productToForm(product, initialEan13),
  );
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [ean13ScannerOpen, setEan13ScannerOpen] = useState(false);
  const [error, setError] = useState("");
  const [uploadingAttribute, setUploadingAttribute] = useState("");
  const [variantImagePickerKey, setVariantImagePickerKey] = useState("");
  const [variantChooserOpen, setVariantChooserOpen] = useState(false);
  const [variantCreateOpen, setVariantCreateOpen] = useState(false);
  const [variantCreateName, setVariantCreateName] = useState("");
  const [variantCreateOptions, setVariantCreateOptions] = useState("");
  const [variantCreateType, setVariantCreateType] = useState<
    "single" | "multiple"
  >("single");
  const [variantCreateError, setVariantCreateError] = useState("");
  const [variantCreating, setVariantCreating] = useState(false);
  const [variantSelection, setVariantSelection] = useState<
    Record<string, string>
  >({});
  const [attributeValues, setAttributeValues] = useState<
    Record<string, unknown>
  >(() =>
    product?.attributes &&
    typeof product.attributes === "object" &&
    !Array.isArray(product.attributes)
      ? (product.attributes as Record<string, unknown>)
      : {},
  );

  useEffect(() => {
    setForm(productToForm(product, initialEan13));
    setImageFiles([]);
    setImagePreviewUrl("");
    setCategoryDraft("");
    setCategoryError("");
    setCategorySubmitting(false);
    setEan13ScannerOpen(false);
    setError("");
    setVariantSelection({});
    setVariantChooserOpen(false);
    setVariantCreateOpen(false);
    setVariantCreateName("");
    setVariantCreateOptions("");
    setVariantCreateType("single");
    setVariantCreateError("");
    setAttributeValues(
      product?.attributes &&
        typeof product.attributes === "object" &&
        !Array.isArray(product.attributes)
        ? (product.attributes as Record<string, unknown>)
        : {},
    );
  }, [initialEan13, product]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  function updateField(field: keyof ProductFormState, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  const categoryOptions = mergeCategoryNames([...categories, form.category]);
  const storedVariantIds = Array.isArray(attributeValues._variantAttributeIds)
    ? (attributeValues._variantAttributeIds as string[])
    : null;
  const inferredVariantIds = Array.isArray(attributeValues._variants)
    ? [
        ...new Set(
          (attributeValues._variants as ProductVariant[]).flatMap((variant) =>
            Object.keys(variant.values),
          ),
        ),
      ].filter((id) =>
        settings.customAttributes.some(
          (attribute) =>
            attribute.id === id &&
            (attribute.type === "single" || attribute.type === "multiple"),
        ),
      )
    : [];
  const selectedVariantIds = storedVariantIds ?? inferredVariantIds;
  const variantAttributes = settings.customAttributes.filter(
    (item) =>
      item.enabled &&
      selectedVariantIds.includes(item.id) &&
      (item.type === "single" || item.type === "multiple"),
  );
  const linkedVariantStock = settings.linkedAttributeIds.includes("stock");
  const linkedVariantShelf =
    settings.linkedAttributeIds.includes("shelf_stock");
  const variantCombinations = buildVariantCombinations(
    settings.customAttributes,
    attributeValues,
    selectedVariantIds,
  );
  const linkedVariantImage =
    settings.linkedAttributeIds.includes("image") ||
    settings.customAttributes.some(
      (item) =>
        item.type === "media" && settings.linkedAttributeIds.includes(item.id),
    );
  const linkedDetailKeys = settings.linkedAttributeIds.filter(
    (key) =>
      !variantAttributes.some((item) => item.id === key) &&
      !["stock", "shelf_stock", "image"].includes(key) &&
      !settings.customAttributes.some(
        (item) => item.id === key && item.type === "media",
      ),
  );
  const savedVariants = Array.isArray(attributeValues._variants)
    ? (attributeValues._variants as ProductVariant[])
    : [];
  const activeVariantValues = Object.fromEntries(
    variantAttributes.map((attribute) => {
      const savedValue = attributeValues[attribute.id];
      const firstSavedValue = Array.isArray(savedValue)
        ? savedValue[0]
        : savedValue;
      return [
        attribute.id,
        variantSelection[attribute.id] ??
          String(firstSavedValue ?? attribute.options[0] ?? ""),
      ];
    }),
  );
  const variantKey = (values: Record<string, string>) =>
    variantAttributes
      .map((item) => `${item.id}:${values[item.id] ?? ""}`)
      .join("|");
  const getVariant = (values: Record<string, string>) =>
    savedVariants.find(
      (item) => variantKey(item.values) === variantKey(values),
    ) ?? { values, stock: 0, shelf_stock: 0 };
  const updateVariant = (
    values: Record<string, string>,
    field: "stock" | "shelf_stock" | "image_url",
    value: string,
  ) => {
    const next = {
      ...getVariant(values),
      values,
      [field]: field === "image_url" ? value : Math.max(Number(value) || 0, 0),
    };
    setAttributeValues((current) => ({
      ...current,
      _variants: [
        ...savedVariants.filter(
          (item) => variantKey(item.values) !== variantKey(values),
        ),
        next,
      ],
    }));
  };
  const updateVariantLinkedValue = (
    values: Record<string, string>,
    key: string,
    value: string,
  ) => {
    const currentVariant = getVariant(values);
    const next = {
      ...currentVariant,
      values,
      linked_values: { ...currentVariant.linked_values, [key]: value },
    };
    setAttributeValues((current) => ({
      ...current,
      _variants: [
        ...savedVariants.filter(
          (item) => variantKey(item.values) !== variantKey(values),
        ),
        next,
      ],
    }));
  };

  function openCategoryModal() {
    setCategoryDraft("");
    setCategoryError("");
    setCategoryModalOpen(true);
  }

  function closeCategoryModal() {
    setCategoryModalOpen(false);
    setCategoryDraft("");
    setCategoryError("");
  }

  async function saveCategoryDraft() {
    if (!canCreateCategory || categorySubmitting) {
      return;
    }

    const nextCategory = categoryDraft.trim();

    if (!nextCategory) {
      setCategoryError("Nhập tên nhóm hàng.");
      return;
    }

    const existingCategory = categoryOptions.find(
      (category) => category.toLowerCase() === nextCategory.toLowerCase(),
    );
    const selectedCategory = existingCategory ?? nextCategory;

    if (existingCategory) {
      updateRelatedBuiltIn("category", selectedCategory);
      closeCategoryModal();
      return;
    }

    setCategorySubmitting(true);
    setCategoryError("");

    try {
      const savedCategory = await onAddCategory(nextCategory);
      updateRelatedBuiltIn("category", savedCategory);
      closeCategoryModal();
    } catch (requestError) {
      setCategoryError(
        getErrorMessage(requestError, "Không lưu được nhóm hàng."),
      );
    } finally {
      setCategorySubmitting(false);
    }
  }

  function handleAddCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveCategoryDraft();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const name = form.name.trim();
    const price = Number(form.price);
    const costPrice = Number(form.cost_price);
    const enteredStock = Number(form.stock);
    const stock = enteredStock;
    const shelfStock = Number(form.shelf_stock);
    const rewardPointsCost = Number(form.reward_points_cost);
    const ean13Code = normalizeEan13Input(form.ean13);
    const importDate = normalizeNullableText(form.import_date);
    const expiryDate = normalizeNullableText(form.expiry_date);

    if (
      savedVariants.some(
        (variant) =>
          linkedVariantStock &&
          linkedVariantShelf &&
          getVariantStock(variant, true) > getVariantStock(variant),
      )
    ) {
      setError(
        "Tồn trên kệ của mỗi biến thể không được lớn hơn tổng tồn của biến thể đó.",
      );
      return;
    }

    if (!name) {
      setError("Product title is required.");
      return;
    }

    if (
      [price, costPrice, stock, shelfStock, rewardPointsCost].some(
        (value) => Number.isNaN(value) || value < 0,
      )
    ) {
      setError("Giá bán, giá vốn và số lượng phải là số không âm.");
      return;
    }

    if (shelfStock > stock) {
      setError("Tồn trên kệ không được lớn hơn tổng tồn kho.");
      return;
    }

    if (form.is_reward && rewardPointsCost < 1) {
      setError("Quà đổi điểm phải có số điểm cần đổi lớn hơn 0.");
      return;
    }

    if (importDate && expiryDate && expiryDate < importDate) {
      setError("Ngày hết hạn phải sau hoặc bằng ngày nhập.");
      return;
    }

    if ((ean13Required || form.ean13.trim()) && !isValidEan13(ean13Code)) {
      setError("Mã EAN-13 phải có đúng 13 chữ số và đúng số kiểm tra.");
      return;
    }

    try {
      await onSubmit(
        {
          category: normalizeNullableText(form.category),
          cost_price: costPrice,
          description: normalizeNullableText(form.description),
          expiry_date: expiryDate,
          image_url: normalizeNullableText(form.image_url),
          import_date: importDate,
          is_active: form.is_active,
          is_reward: form.is_reward,
          name,
          price,
          reward_points_cost: form.is_reward ? Math.floor(rewardPointsCost) : 0,
          sku: ean13Code || null,
          stock: Math.floor(stock),
          shelf_stock: Math.floor(shelfStock),
          attributes: attributeValues as never,
        },
        imageFiles,
      );
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Không lưu được sản phẩm."));
    }
  }

  const basePreviewUrl = imagePreviewUrl || form.image_url;
  const fieldOrder = (key: string) =>
    settings.attributeOrder.indexOf(key) < 0
      ? 999
      : settings.attributeOrder.indexOf(key);
  const fieldEnabled = (key: string) => settings.enabledFields[key] !== false;
  const hasSelectedVariants = variantAttributes.length > 0;
  const activeSavedVariant = savedVariants.find(
    (item) => variantKey(item.values) === variantKey(activeVariantValues),
  );
  const isRelatedField = (key: string) =>
    hasSelectedVariants && settings.linkedAttributeIds.includes(key);
  const relatedFieldClassName = (key: string, force = false) =>
    hasSelectedVariants && (force || settings.linkedAttributeIds.includes(key))
      ? "border-l-4 border-l-moss-500 pl-3"
      : "";
  const relatedValue = (key: string, fallback: string) => {
    if (!isRelatedField(key) || !activeSavedVariant) return fallback;
    if (key === "image") return activeSavedVariant.image_url ?? fallback;
    if (key === "stock")
      return Object.prototype.hasOwnProperty.call(activeSavedVariant, "stock")
        ? String(activeSavedVariant.stock)
        : fallback;
    if (key === "shelf_stock")
      return Object.prototype.hasOwnProperty.call(
        activeSavedVariant,
        "shelf_stock",
      )
        ? String(activeSavedVariant.shelf_stock)
        : fallback;
    return activeSavedVariant.linked_values?.[key] ?? fallback;
  };
  const updateRelatedBuiltIn = (
    key: keyof ProductFormState,
    value: string | boolean,
  ) => {
    updateField(key, value);
    const relatedKey =
      key === "image_url" ? "image" : key === "ean13" ? "sku" : key;
    if (!isRelatedField(relatedKey)) return;
    if (key === "stock" || key === "shelf_stock") {
      updateVariant(activeVariantValues, key, String(value));
      return;
    }
    if (key === "image_url") {
      updateVariant(activeVariantValues, "image_url", String(value));
      return;
    }
    updateVariantLinkedValue(activeVariantValues, relatedKey, String(value));
  };
  const updateRelatedAttribute = (key: string, value: string) => {
    setAttributeValues((current) => ({ ...current, [key]: value }));
    if (isRelatedField(key))
      updateVariantLinkedValue(activeVariantValues, key, value);
  };
  const previewUrl = imagePreviewUrl || relatedValue("image", basePreviewUrl);
  const displayedIsActive =
    relatedValue("is_active", String(form.is_active)) === "true";
  const displayedIsReward =
    relatedValue("is_reward", String(form.is_reward)) === "true";

  async function addAttributeFiles(key: string, files: FileList | null) {
    if (!files?.length || uploadingAttribute) return;
    const current = (
      attributeValues[key] && typeof attributeValues[key] === "object"
        ? attributeValues[key]
        : {}
    ) as { images?: string[]; video?: string };
    const imageFiles = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, Math.max(0, 10 - (current.images?.length ?? 0)));
    const videoFile = Array.from(files).find((file) =>
      file.type.startsWith("video/"),
    );
    setUploadingAttribute(key);
    setError("");
    try {
      const imageUploads = await Promise.all(
        imageFiles.map(uploadProductImageAsset),
      );
      await Promise.all(imageUploads.map(saveCloudinaryImageAsset));
      const videoUpload =
        videoFile && !current.video
          ? await uploadProductVideoAsset(videoFile)
          : null;
      const nextImages = [
        ...(current.images ?? []),
        ...imageUploads.map((item) => item.url),
      ].slice(0, 10);
      setAttributeValues((values) => ({
        ...values,
        [key]: {
          images: nextImages,
          video: videoUpload?.url ?? current.video ?? "",
        },
      }));
      if (isRelatedField(key))
        updateVariant(
          activeVariantValues,
          "image_url",
          nextImages[0] ?? "",
        );
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, "Không tải được media lên Cloudinary."),
      );
    } finally {
      setUploadingAttribute("");
    }
  }

  async function createVariantFromForm() {
    const name = variantCreateName.trim();
    const options = [
      ...new Set(
        variantCreateOptions
          .split(/[\n,]/)
          .map((option) => option.trim())
          .filter(Boolean),
      ),
    ];
    if (!name) {
      setVariantCreateError("Nhập tên biến thể.");
      return;
    }
    if (!options.length) {
      setVariantCreateError("Thêm ít nhất một giá trị cho biến thể.");
      return;
    }
    setVariantCreating(true);
    setVariantCreateError("");
    try {
      const attribute = await onCreateVariant({
        name,
        options,
        type: variantCreateType,
      });
      setAttributeValues((current) => ({
        ...current,
        _variantAttributeIds: [
          ...new Set([...selectedVariantIds, attribute.id]),
        ],
        [attribute.id]:
          attribute.type === "multiple"
            ? [attribute.options[0]].filter(Boolean)
            : attribute.options[0] ?? "",
      }));
      setVariantSelection((current) => ({
        ...current,
        [attribute.id]: attribute.options[0] ?? "",
      }));
      setVariantCreateName("");
      setVariantCreateOptions("");
      setVariantCreateType("single");
      setVariantCreateOpen(false);
      setVariantChooserOpen(true);
    } catch (requestError) {
      setVariantCreateError(
        getErrorMessage(requestError, "Không tạo được biến thể mới."),
      );
    } finally {
      setVariantCreating(false);
    }
  }

  function removeVariantFromProduct(attributeId: string) {
    setAttributeValues((current) => {
      const currentVariantIds = Array.isArray(current._variantAttributeIds)
        ? (current._variantAttributeIds as string[])
        : [];
      const remainingVariantIds = currentVariantIds.filter(
        (id) => id !== attributeId,
      );
      const variants = Array.isArray(current._variants)
        ? (current._variants as ProductVariant[])
        : [];
      const mergedVariants = new Map<string, ProductVariant>();

      if (remainingVariantIds.length) {
        variants.forEach((variant) => {
          const values = Object.fromEntries(
            remainingVariantIds
              .filter((id) => variant.values[id] !== undefined)
              .map((id) => [id, variant.values[id]]),
          );
          const key = variantKey(values);
          const existing = mergedVariants.get(key);
          if (existing) {
            mergedVariants.set(key, {
              ...existing,
              stock: getVariantStock(existing) + getVariantStock(variant),
              shelf_stock:
                getVariantStock(existing, true) + getVariantStock(variant, true),
            });
          } else {
            mergedVariants.set(key, { ...variant, values });
          }
        });
      }

      return {
        ...current,
        _variantAttributeIds: remainingVariantIds,
        _variants: [...mergedVariants.values()],
      };
    });
    setVariantSelection((current) => {
      const next = { ...current };
      delete next[attributeId];
      return next;
    });
  }

  return (
    <>
      <form
        className="grid grid-cols-1 gap-3 lg:grid-cols-2"
        id={formId}
        onSubmit={handleSubmit}
      >
        <section
          className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-moss-300 bg-moss-50/50 p-2 lg:col-span-2"
          style={{ order: 998 }}
        >
          <div className="flex w-full flex-wrap items-center gap-2">
            <button
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-moss-700 px-3 text-sm font-extrabold text-white transition hover:bg-moss-800"
              id={`${formId}-add-variant`}
              onClick={() => setVariantChooserOpen(true)}
              type="button"
            >
              <Plus className="h-4 w-4" />
              Thêm biến thể
            </button>
            {variantAttributes.length ? (
              variantAttributes.map((attribute) => (
                <span
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-moss-300 bg-white pl-2.5 pr-1 text-sm font-extrabold text-moss-900"
                  key={attribute.id}
                >
                  {attribute.name}
                  <button
                    aria-label={`Gỡ biến thể ${attribute.name} khỏi sản phẩm`}
                    className="inline-flex h-7 items-center gap-1 rounded-md bg-red-50 px-2 text-xs font-extrabold text-red-700 transition hover:bg-red-100"
                    onClick={() => removeVariantFromProduct(attribute.id)}
                    title="Gỡ biến thể khỏi sản phẩm"
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Gỡ
                  </button>
                </span>
              ))
            ) : (
              <span className="text-xs font-bold text-moss-800">
                Chưa thêm biến thể cho sản phẩm
              </span>
            )}
          </div>
        </section>
        {fieldEnabled("image") ? (
          <section className={`space-y-3 ${relatedFieldClassName("image")}`} style={{ order: fieldOrder("image") }}>
            <h3 className="text-sm font-extrabold text-slate-950">Hình ảnh</h3>
            <button
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-moss-300 hover:bg-moss-50 sm:max-w-sm"
              onClick={() => setMediaOpen(true)}
              type="button"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-950">
                {previewUrl ? (
                  <img
                    alt="Product"
                    className="h-full w-full rounded-xl object-cover"
                    src={previewUrl}
                  />
                ) : (
                  <ImageIcon className="h-5 w-5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-slate-950">
                  Thêm ảnh
                </span>
                {previewUrl ? (
                  <span className="block truncate text-xs font-semibold text-slate-500">
                    {imageFiles.length > 1
                      ? `Đã chọn ${imageFiles.length} ảnh mới`
                      : "Đã chọn hình ảnh"}
                  </span>
                ) : null}
              </span>
              <ChevronRight className="h-5 w-5 text-slate-950" />
            </button>
          </section>
        ) : null}

        {fieldEnabled("name") ? (
          <label className={`block ${relatedFieldClassName("name")}`} style={{ order: fieldOrder("name") }}>
            <span className={labelClassName}>Tên sản phẩm</span>
            <input
              className={fieldClassName}
              onChange={(event) =>
                updateRelatedBuiltIn("name", event.target.value)
              }
              placeholder="Nhập tên sản phẩm"
              required
              value={relatedValue("name", form.name)}
            />
          </label>
        ) : null}

        {canSetVisibility && fieldEnabled("is_active") ? (
          <section
            className={`space-y-3 ${relatedFieldClassName("is_active")}`}
            style={{ order: fieldOrder("is_active") }}
          >
            <h3 className="text-sm font-extrabold text-slate-950">
              Hiển thị sản phẩm
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`flex h-12 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition ${
                  displayedIsActive
                    ? "border-moss-500 bg-moss-50 text-moss-700"
                    : "border-slate-200 bg-white text-slate-950 hover:bg-slate-50"
                }`}
                onClick={() => updateRelatedBuiltIn("is_active", true)}
                type="button"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-moss-700 shadow-sm">
                  <Eye className="h-4 w-4" />
                </span>
                Hiển thị
              </button>
              <button
                className={`flex h-12 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition ${
                  !displayedIsActive
                    ? "border-red-500 bg-red-50 text-red-700"
                    : "border-slate-200 bg-white text-slate-950 hover:bg-slate-50"
                }`}
                onClick={() => updateRelatedBuiltIn("is_active", false)}
                type="button"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-red-700 shadow-sm">
                  <EyeOff className="h-4 w-4" />
                </span>
                Ẩn
              </button>
            </div>
          </section>
        ) : null}

        {settings.customAttributes.some((attribute) => attribute.enabled) ? (
          <section className="contents">
            {settings.customAttributes
              .filter(
                (attribute) => {
                  const isVariantAttribute =
                    attribute.type === "single" ||
                    attribute.type === "multiple";
                  return (
                    attribute.enabled &&
                    (!isVariantAttribute ||
                      selectedVariantIds.includes(attribute.id))
                  );
                },
              )
              .map((attribute) => {
              const isSelectedVariant = selectedVariantIds.includes(
                attribute.id,
              );
              const value = attributeValues[attribute.id];
              if (attribute.type === "media") {
                const baseMedia =
                  value && typeof value === "object" && !Array.isArray(value)
                    ? (value as { images?: string[]; video?: string })
                    : {};
                const media =
                  isRelatedField(attribute.id) && activeSavedVariant?.image_url
                    ? { images: [activeSavedVariant.image_url], video: "" }
                    : baseMedia;
                return (
                  <div
                    className={relatedFieldClassName(attribute.id)}
                    key={attribute.id}
                    style={{ order: fieldOrder(attribute.id) }}
                  >
                    <MultiMediaField
                      label={attribute.name}
                      libraryImages={libraryImages}
                      onChange={(next) => {
                        setAttributeValues((current) => ({
                          ...current,
                          [attribute.id]: next,
                        }));
                        if (isRelatedField(attribute.id))
                          updateVariant(
                            activeVariantValues,
                            "image_url",
                            next.images?.[0] ?? "",
                          );
                      }}
                      onFiles={(files) =>
                        void addAttributeFiles(attribute.id, files)
                      }
                      uploading={uploadingAttribute === attribute.id}
                      value={media}
                    />
                  </div>
                );
              }
              if (
                attribute.type === "single" ||
                attribute.type === "multiple"
              ) {
                const multiple = attribute.type === "multiple";
                const selected =
                  multiple && Array.isArray(value)
                    ? (value as string[])
                    : String(value ?? "");
                const selectedValues = multiple
                  ? (selected as string[])
                  : [selected as string];
                const colorOnly = attribute.optionDisplay === "color";
                return (
                  <fieldset
                    className={`relative rounded-r-xl border border-slate-200 bg-white p-2.5 shadow-sm ${relatedFieldClassName(attribute.id, isSelectedVariant)}`}
                    key={attribute.id}
                    style={{ order: fieldOrder(attribute.id) }}
                  >
                    <span className="mb-2 flex items-center justify-between gap-2">
                      <b className="text-sm text-slate-950">{attribute.name}</b>
                      <span className="flex items-center gap-2">
                        <small className="rounded-full bg-slate-100 px-2 py-1 font-bold text-slate-500">
                          {multiple ? "Chọn nhiều" : "Chọn một"}
                        </small>
                        {isSelectedVariant ? (
                          <button
                            aria-label={`Gỡ biến thể ${attribute.name} khỏi sản phẩm`}
                            className="flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg bg-red-50 px-2 text-xs font-extrabold text-red-700 transition hover:bg-red-100"
                            onClick={() =>
                              removeVariantFromProduct(attribute.id)
                            }
                            title="Gỡ biến thể khỏi sản phẩm"
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                            Gỡ
                          </button>
                        ) : null}
                      </span>
                    </span>
                    <div
                      className={
                        colorOnly ? "flex flex-wrap gap-2" : "space-y-2"
                      }
                    >
                      {attribute.options.map((option) => (
                        <label
                          className={
                            colorOnly
                              ? "cursor-pointer"
                              : `flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm font-bold transition ${(isSelectedVariant ? activeVariantValues[attribute.id] === option : selectedValues.includes(option)) ? "border-moss-500 bg-moss-50 text-moss-900 ring-1 ring-moss-400" : "border-slate-200 bg-white text-slate-700"}`
                          }
                          key={option}
                        >
                          <input
                            checked={
                              isSelectedVariant
                                ? activeVariantValues[attribute.id] === option
                                : selectedValues.includes(option)
                            }
                            className="sr-only"
                            name={multiple ? undefined : attribute.id}
                            onChange={(event) => {
                              const nextSelected = isSelectedVariant
                                ? multiple
                                  ? [
                                      ...new Set([
                                        ...(Array.isArray(selected)
                                          ? selected
                                          : []),
                                        option,
                                      ]),
                                    ]
                                  : option
                                : multiple
                                  ? event.target.checked
                                    ? [...(selected as string[]), option]
                                    : (selected as string[]).filter(
                                        (item) => item !== option,
                                      )
                                  : option;
                              setAttributeValues((current) => ({
                                ...current,
                                [attribute.id]: nextSelected,
                              }));
                              if (isSelectedVariant)
                                setVariantSelection((current) => ({
                                  ...current,
                                  [attribute.id]: option,
                                }));
                            }}
                            type={
                              isSelectedVariant
                                ? "radio"
                                : multiple
                                  ? "checkbox"
                                  : "radio"
                            }
                          />
                          {attribute.optionDisplay !== "text" ? (
                            <span
                              className={`block h-8 w-8 shrink-0 rounded-full border-2 shadow-sm transition ${(isSelectedVariant ? activeVariantValues[attribute.id] === option : selectedValues.includes(option)) ? "border-white ring-2 ring-moss-700" : "border-white ring-1 ring-slate-300"}`}
                              style={{
                                backgroundColor:
                                  attribute.optionColors?.[option] ?? option,
                              }}
                              title={option}
                            />
                          ) : null}
                          {!colorOnly ? (
                            <span className="min-w-0 flex-1 truncate">
                              {option}
                            </span>
                          ) : null}
                          {!colorOnly ? (
                            <span
                              className={`h-4 w-4 shrink-0 ${multiple && !isSelectedVariant ? "rounded" : "rounded-full"} border-2 ${(isSelectedVariant ? activeVariantValues[attribute.id] === option : selectedValues.includes(option)) ? "border-moss-700 bg-moss-700 ring-2 ring-moss-100" : "border-slate-300"}`}
                            />
                          ) : null}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              }
              return (
                <label
                  className={`block rounded-r-2xl border border-slate-200 bg-white p-3 shadow-sm ${relatedFieldClassName(attribute.id)}`}
                  key={attribute.id}
                  style={{ order: fieldOrder(attribute.id) }}
                >
                  <span className="mb-2 flex items-center justify-between gap-2">
                    <b className="text-sm text-slate-950">{attribute.name}</b>
                    <small className="rounded-full bg-slate-100 px-2 py-1 font-bold text-slate-500">
                      {attribute.type === "date"
                        ? "Ngày"
                        : attribute.type === "number"
                          ? "Số"
                          : "Văn bản"}
                    </small>
                  </span>
                  <input
                    className={fieldClassName}
                    onChange={(event) =>
                      updateRelatedAttribute(attribute.id, event.target.value)
                    }
                    type={
                      attribute.type === "date"
                        ? "date"
                        : attribute.type === "number"
                          ? "number"
                          : "text"
                    }
                    value={relatedValue(attribute.id, String(value ?? ""))}
                  />
                </label>
              );
            })}
          </section>
        ) : null}

        {fieldEnabled("description") ? (
          <label
            className={`block lg:col-span-2 ${relatedFieldClassName("description")}`}
            style={{ order: fieldOrder("description") }}
          >
            <span className={labelClassName}>Mô tả</span>
            <textarea
              className={`${fieldClassName} min-h-20 resize-none`}
              onChange={(event) =>
                updateRelatedBuiltIn("description", event.target.value)
              }
              placeholder="Nhập mô tả ngắn"
              value={relatedValue("description", form.description)}
            />
          </label>
        ) : null}

        {settings.enableColor ||
        settings.enableSize ||
        settings.customAttributes.some((item) => item.enabled) ? (
          <section className="contents">
            {settings.card.order.map((key) => {
              if (key === "color" && settings.enableColor)
                return (
                  <label
                    className="block"
                    key={key}
                    style={{ order: fieldOrder(key) }}
                  >
                    <span className={labelClassName}>Màu sắc</span>
                    <input
                      className={fieldClassName}
                      value={String(attributeValues.color ?? "")}
                      onChange={(event) =>
                        setAttributeValues((current) => ({
                          ...current,
                          color: event.target.value,
                        }))
                      }
                    />
                  </label>
                );
              if (key === "size" && settings.enableSize)
                return (
                  <label
                    className="block"
                    key={key}
                    style={{ order: fieldOrder(key) }}
                  >
                    <span className={labelClassName}>Kích thước</span>
                    <input
                      className={fieldClassName}
                      value={String(attributeValues.size ?? "")}
                      onChange={(event) =>
                        setAttributeValues((current) => ({
                          ...current,
                          size: event.target.value,
                        }))
                      }
                    />
                  </label>
                );
              const attribute = settings.customAttributes.find(
                (item) => item.id === key && item.enabled,
              );
              if (!attribute || settings.customAttributes.includes(attribute))
                return null;
              if (attribute.type === "single") {
                const selected = String(attributeValues[key] ?? "");
                return (
                  <label
                    className="block"
                    key={key}
                    style={{ order: fieldOrder(key) }}
                  >
                    <span className={labelClassName}>{attribute.name}</span>
                    <select
                      className={fieldClassName}
                      onChange={(event) =>
                        setAttributeValues((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                      value={selected}
                    >
                      <option value="">
                        Chọn {attribute.name.toLowerCase()}
                      </option>
                      {attribute.options.map((option) => (
                        <option key={option} value={option}>
                          {attribute.optionDisplay === "color"
                            ? `● ${attribute.optionColors?.[option] ?? option}`
                            : attribute.optionDisplay === "both" &&
                                attribute.optionColors?.[option]
                              ? `● ${option}`
                              : option}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }
              if (attribute.type === "multiple") {
                const selected = Array.isArray(attributeValues[key])
                  ? (attributeValues[key] as string[])
                  : [];
                return (
                  <label
                    className="block"
                    key={key}
                    style={{ order: fieldOrder(key) }}
                  >
                    <span className={labelClassName}>{attribute.name}</span>
                    <select
                      className={`${fieldClassName} min-h-28`}
                      multiple
                      onChange={(event) =>
                        setAttributeValues((current) => ({
                          ...current,
                          [key]: Array.from(
                            event.target.selectedOptions,
                            (option) => option.value,
                          ),
                        }))
                      }
                      value={selected}
                    >
                      {attribute.options.map((option) => (
                        <option key={option} value={option}>
                          {attribute.optionDisplay === "color"
                            ? `● ${attribute.optionColors?.[option] ?? option}`
                            : attribute.optionDisplay === "both" &&
                                attribute.optionColors?.[option]
                              ? `● ${option}`
                              : option}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-xs font-semibold text-slate-500">
                      Giữ Ctrl (Windows) hoặc Command (Mac) để chọn nhiều mục.
                    </span>
                  </label>
                );
              }
              if (attribute.type === "media") {
                const media = (
                  attributeValues[key] &&
                  typeof attributeValues[key] === "object"
                    ? attributeValues[key]
                    : {}
                ) as { images?: string[]; video?: string };
                return (
                  <div key={key} style={{ order: fieldOrder(key) }}>
                    <MultiMediaField
                      label={attribute.name}
                      libraryImages={libraryImages}
                      onChange={(value) =>
                        setAttributeValues((current) => ({
                          ...current,
                          [key]: value,
                        }))
                      }
                      onFiles={(files) => void addAttributeFiles(key, files)}
                      uploading={uploadingAttribute === key}
                      value={media}
                    />
                  </div>
                );
              }
              return (
                <label
                  className="block"
                  key={key}
                  style={{ order: fieldOrder(key) }}
                >
                  <span className={labelClassName}>{attribute.name}</span>
                  <input
                    className={fieldClassName}
                    inputMode={
                      attribute.type === "number" ? "decimal" : undefined
                    }
                    type={
                      attribute.type === "date"
                        ? "date"
                        : attribute.type === "number"
                          ? "number"
                          : "text"
                    }
                    value={String(attributeValues[key] ?? "")}
                    onChange={(event) =>
                      setAttributeValues((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                  />
                </label>
              );
            })}
          </section>
        ) : null}

        {variantCombinations.length > 1000 ? (
          <section
            className="space-y-3 border-l-4 border-moss-500 pl-3 lg:col-span-2"
            style={{
              order:
                Math.max(
                  ...variantAttributes.map((item) => fieldOrder(item.id)),
                  0,
                ) + 0.5,
            }}
          >
            <div>
              <h3 className="text-sm font-extrabold text-slate-950">
                Thêm biến thể
              </h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Chọn từng thuộc tính rồi nhập dữ liệu riêng cho đúng tổ hợp.
              </p>
            </div>
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              {variantAttributes.map((attribute) => {
                const selected = activeVariantValues[attribute.id];
                return (
                  <div key={attribute.id}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <strong className="text-sm text-slate-950">
                        {attribute.name}
                      </strong>
                      <span className="text-xs font-semibold text-slate-500">
                        {selected}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {attribute.options.map((option) => {
                        const optionImage = savedVariants.find(
                          (item) =>
                            item.values?.[attribute.id] === option &&
                            item.image_url,
                        )?.image_url;
                        return (
                          <button
                            className={`relative flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-extrabold transition ${selected === option ? "border-red-500 bg-white text-slate-950 ring-1 ring-red-500" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}
                            key={option}
                            onClick={() => {
                              setVariantSelection((current) => ({
                                ...current,
                                [attribute.id]: option,
                              }));
                            }}
                            type="button"
                          >
                            {optionImage ? (
                              <img
                                alt={option}
                                className="h-8 w-8 rounded-md object-cover"
                                src={optionImage}
                              />
                            ) : attribute.optionDisplay !== "text" &&
                              attribute.optionColors?.[option] ? (
                              <span
                                className="h-6 w-6 rounded-full border border-slate-300"
                                style={{
                                  backgroundColor:
                                    attribute.optionColors[option],
                                }}
                              />
                            ) : null}
                            {attribute.optionDisplay !== "color" ? (
                              <span className="truncate">{option}</span>
                            ) : null}
                            {selected === option ? (
                              <Check className="absolute right-1 top-1 h-3.5 w-3.5 rounded-full bg-red-500 p-0.5 text-white" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="space-y-2">
              {variantCombinations.map((values) => {
                const variant = getVariant(values);
                if (variantKey(values) !== variantKey(activeVariantValues))
                  return null;
                return (
                  <div
                    className="border-b border-slate-200 py-3 last:border-0"
                    key={variantKey(values)}
                  >
                    <div className="flex flex-wrap items-end gap-2.5">
                      {linkedVariantImage ? (
                        <button
                          aria-label="Chọn ảnh biến thể"
                          className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                          onClick={() =>
                            setVariantImagePickerKey((current) =>
                              current === variantKey(values)
                                ? ""
                                : variantKey(values),
                            )
                          }
                          type="button"
                        >
                          {variant.image_url ? (
                            <img
                              alt="Ảnh biến thể"
                              className="h-full w-full object-cover"
                              src={variant.image_url}
                            />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-slate-400" />
                          )}
                        </button>
                      ) : null}
                      <div className="min-w-[130px] flex-1 self-center">
                        <p className="truncate text-sm font-extrabold text-slate-950">
                          {variantAttributes
                            .map((attribute) => values[attribute.id])
                            .join(" / ")}
                        </p>
                        <p className="truncate text-[11px] font-semibold text-slate-500">
                          {variantAttributes
                            .map((attribute) => attribute.name)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="grid min-w-[210px] flex-1 grid-cols-2 gap-2">
                        {linkedVariantStock ? (
                          <label className="text-xs font-bold text-slate-600">
                            Tổng tồn
                            <input
                              className={fieldClassName}
                              min="0"
                              onChange={(event) =>
                                updateVariant(
                                  values,
                                  "stock",
                                  event.target.value,
                                )
                              }
                              type="number"
                              value={variant.stock}
                            />
                          </label>
                        ) : null}
                        {linkedVariantShelf ? (
                          <label className="text-xs font-bold text-slate-600">
                            Tồn trên kệ
                            <input
                              className={fieldClassName}
                              min="0"
                              onChange={(event) =>
                                updateVariant(
                                  values,
                                  "shelf_stock",
                                  event.target.value,
                                )
                              }
                              type="number"
                              value={variant.shelf_stock}
                            />
                          </label>
                        ) : null}
                      </div>
                      {linkedDetailKeys.map((key) => {
                        const definition = settings.customAttributes.find(
                          (item) => item.id === key,
                        );
                        const dateField =
                          key === "import_date" ||
                          key === "expiry_date" ||
                          definition?.type === "date";
                        const numberField =
                          [
                            "price",
                            "cost_price",
                            "reward_points_cost",
                          ].includes(key) || definition?.type === "number";
                        return (
                          <label
                            className="min-w-[150px] flex-1 text-xs font-bold text-slate-600"
                            key={key}
                          >
                            {definition?.name ?? linkedFieldLabels[key] ?? key}
                            <input
                              className={fieldClassName}
                              onChange={(event) =>
                                updateVariantLinkedValue(
                                  values,
                                  key,
                                  event.target.value,
                                )
                              }
                              type={
                                dateField
                                  ? "date"
                                  : numberField
                                    ? "number"
                                    : "text"
                              }
                              value={variant.linked_values?.[key] ?? ""}
                            />
                          </label>
                        );
                      })}
                    </div>
                    {linkedVariantImage &&
                    variantImagePickerKey === variantKey(values) ? (
                      <div className="mt-2 rounded-xl bg-slate-50 p-2">
                        <div className="flex gap-2 overflow-x-auto">
                          <button
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-2 ${!variant.image_url ? "border-moss-500" : "border-slate-200"}`}
                            onClick={() => {
                              updateVariant(values, "image_url", "");
                              setVariantImagePickerKey("");
                            }}
                            type="button"
                          >
                            <ImageIcon className="h-4 w-4 text-slate-400" />
                          </button>
                          {[form.image_url, ...libraryImages]
                            .filter(
                              (url, index, list) =>
                                url && list.indexOf(url) === index,
                            )
                            .slice(0, 16)
                            .map((url) => (
                              <button
                                className={`h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 ${variant.image_url === url ? "border-moss-500" : "border-transparent"}`}
                                key={url}
                                onClick={() => {
                                  updateVariant(values, "image_url", url);
                                  setVariantImagePickerKey("");
                                }}
                                type="button"
                              >
                                <img
                                  alt="Cloudinary"
                                  className="h-full w-full object-cover"
                                  src={url}
                                />
                              </button>
                            ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {variantAttributes.length > 1 ? (
              <div className="space-y-2 border-t border-slate-200 pt-3">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">
                    Dữ liệu riêng từng thuộc tính
                  </h4>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Được dùng sau dữ liệu của tổ hợp khi tổ hợp chưa có thông
                    tin tương ứng.
                  </p>
                </div>
                {variantAttributes.map((attribute) => {
                  const option = activeVariantValues[attribute.id];
                  const values = { [attribute.id]: option };
                  const variant = getVariant(values);
                  return (
                    <div
                      className="rounded-xl border border-slate-200 bg-white p-3"
                      key={`single-${attribute.id}-${option}`}
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <strong className="text-sm text-slate-900">
                          {attribute.name}: {option}
                        </strong>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-500">
                          Ưu tiên sau
                        </span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {linkedVariantImage ? (
                          <label className="text-xs font-bold text-slate-600">
                            Ảnh biến thể (URL)
                            <input
                              className={fieldClassName}
                              onChange={(event) =>
                                updateVariant(
                                  values,
                                  "image_url",
                                  event.target.value,
                                )
                              }
                              placeholder="https://..."
                              type="url"
                              value={variant.image_url ?? ""}
                            />
                          </label>
                        ) : null}
                        {linkedVariantStock ? (
                          <label className="text-xs font-bold text-slate-600">
                            Tổng tồn
                            <input
                              className={fieldClassName}
                              min="0"
                              onChange={(event) =>
                                updateVariant(
                                  values,
                                  "stock",
                                  event.target.value,
                                )
                              }
                              type="number"
                              value={variant.stock}
                            />
                          </label>
                        ) : null}
                        {linkedVariantShelf ? (
                          <label className="text-xs font-bold text-slate-600">
                            Tồn trên kệ
                            <input
                              className={fieldClassName}
                              min="0"
                              onChange={(event) =>
                                updateVariant(
                                  values,
                                  "shelf_stock",
                                  event.target.value,
                                )
                              }
                              type="number"
                              value={variant.shelf_stock}
                            />
                          </label>
                        ) : null}
                        {linkedDetailKeys.map((key) => {
                          const definition = settings.customAttributes.find(
                            (item) => item.id === key,
                          );
                          return (
                            <label
                              className="text-xs font-bold text-slate-600"
                              key={key}
                            >
                              {definition?.name ?? linkedFieldLabels[key] ?? key}
                              <input
                                className={fieldClassName}
                                onChange={(event) =>
                                  updateVariantLinkedValue(
                                    values,
                                    key,
                                    event.target.value,
                                  )
                                }
                                type={
                                  key === "import_date" ||
                                  key === "expiry_date" ||
                                  definition?.type === "date"
                                    ? "date"
                                    : [
                                          "price",
                                          "cost_price",
                                          "reward_points_cost",
                                        ].includes(key) ||
                                        definition?.type === "number"
                                      ? "number"
                                      : "text"
                                }
                                value={variant.linked_values?.[key] ?? ""}
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {variantCombinations.length >= 100 ? (
              <p className="text-xs font-bold text-amber-700">
                Chỉ hiển thị 100 tổ hợp đầu tiên. Hãy giảm số lựa chọn để quản
                lý dễ hơn.
              </p>
            ) : null}
          </section>
        ) : null}

        {fieldEnabled("is_reward") ? (
          <section
            className={`space-y-3 ${relatedFieldClassName("is_reward")}`}
            style={{ order: fieldOrder("is_reward") }}
          >
            <h3 className="text-sm font-extrabold text-slate-950">
              Loại sản phẩm
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`h-12 rounded-xl border px-3 text-sm font-bold ${!displayedIsReward ? "border-moss-500 bg-moss-50 text-moss-700" : "border-slate-200 bg-white"}`}
                onClick={() => updateRelatedBuiltIn("is_reward", false)}
                type="button"
              >
                Sản phẩm bán
              </button>
              <button
                className={`h-12 rounded-xl border px-3 text-sm font-bold ${displayedIsReward ? "border-amber-500 bg-amber-50 text-amber-700" : "border-slate-200 bg-white"}`}
                onClick={() => updateRelatedBuiltIn("is_reward", true)}
                type="button"
              >
                Quà đổi điểm
              </button>
            </div>
            {displayedIsReward && fieldEnabled("reward_points_cost") ? (
              <label className={`block ${relatedFieldClassName("reward_points_cost")}`}>
                <span className={labelClassName}>Điểm cần đổi</span>
                <input
                  className={fieldClassName}
                  inputMode="numeric"
                  onChange={(event) =>
                    updateRelatedBuiltIn(
                      "reward_points_cost",
                      normalizeIntegerInput(event.target.value),
                    )
                  }
                  placeholder="100"
                  type="text"
                  value={formatIntegerInput(
                    relatedValue(
                      "reward_points_cost",
                      form.reward_points_cost,
                    ),
                  )}
                />
              </label>
            ) : null}
          </section>
        ) : null}

        {fieldEnabled("category") ? (
          <label className={`block ${relatedFieldClassName("category")}`} style={{ order: fieldOrder("category") }}>
            <span className={labelClassName}>Nhóm hàng</span>
            <div className="flex gap-2">
              <select
                className={`${fieldClassName} min-w-0 flex-1 appearance-none`}
                onChange={(event) =>
                  updateRelatedBuiltIn("category", event.target.value)
                }
                value={relatedValue("category", form.category)}
              >
                <option value="">Chọn nhóm hàng</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              {canCreateCategory ? (
                <button
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-moss-200 bg-moss-50 px-3 text-sm font-extrabold text-moss-700 transition hover:bg-moss-100"
                  onClick={openCategoryModal}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  Thêm
                </button>
              ) : null}
            </div>
          </label>
        ) : null}

        {fieldEnabled("import_date") ? (
          <label className={`block ${relatedFieldClassName("import_date")}`} style={{ order: fieldOrder("import_date") }}>
            <span className={labelClassName}>Ngày nhập</span>
            <input
              className={fieldClassName}
              onChange={(event) =>
                updateRelatedBuiltIn("import_date", event.target.value)
              }
              type="date"
              value={relatedValue("import_date", form.import_date)}
            />
          </label>
        ) : null}
        {fieldEnabled("expiry_date") ? (
          <label className={`block ${relatedFieldClassName("expiry_date")}`} style={{ order: fieldOrder("expiry_date") }}>
            <span className={labelClassName}>Ngày hết hạn</span>
            <input
              className={fieldClassName}
              onChange={(event) =>
                updateRelatedBuiltIn("expiry_date", event.target.value)
              }
              type="date"
              value={relatedValue("expiry_date", form.expiry_date)}
            />
          </label>
        ) : null}

        {fieldEnabled("cost_price") ? (
          <label className={`block ${relatedFieldClassName("cost_price")}`} style={{ order: fieldOrder("cost_price") }}>
            <span className={labelClassName}>Giá vốn</span>
            <input
              className={fieldClassName}
              inputMode="numeric"
              onChange={(event) =>
                updateRelatedBuiltIn(
                  "cost_price",
                  normalizeIntegerInput(event.target.value),
                )
              }
              placeholder="0"
              type="text"
              value={formatIntegerInput(
                relatedValue("cost_price", form.cost_price),
              )}
            />
          </label>
        ) : null}
        {fieldEnabled("price") ? (
          <label className={`block ${relatedFieldClassName("price")}`} style={{ order: fieldOrder("price") }}>
            <span className={labelClassName}>Giá bán</span>
            <input
              className={fieldClassName}
              inputMode="numeric"
              onChange={(event) =>
                updateRelatedBuiltIn(
                  "price",
                  normalizeIntegerInput(event.target.value),
                )
              }
              placeholder="0"
              type="text"
              value={formatIntegerInput(relatedValue("price", form.price))}
            />
          </label>
        ) : null}

        {fieldEnabled("stock") ? (
          <label className={`block ${relatedFieldClassName("stock")}`} style={{ order: fieldOrder("stock") }}>
            <span className={labelClassName}>Số lượng</span>
              <input
                className={fieldClassName}
                inputMode="numeric"
              onChange={(event) =>
                updateRelatedBuiltIn(
                  "stock",
                  normalizeIntegerInput(event.target.value),
                )
              }
              placeholder="0"
              type="text"
                value={formatIntegerInput(relatedValue("stock", form.stock))}
              />
            </label>
        ) : null}
        {fieldEnabled("shelf_stock") ? (
          <label className={`block ${relatedFieldClassName("shelf_stock")}`} style={{ order: fieldOrder("shelf_stock") }}>
            <span className={labelClassName}>Tồn trên kệ</span>
              <input
                className={fieldClassName}
                inputMode="numeric"
              onChange={(event) =>
                updateRelatedBuiltIn(
                  "shelf_stock",
                  normalizeIntegerInput(event.target.value),
                )
              }
              placeholder="0"
              type="text"
                value={formatIntegerInput(
                  relatedValue("shelf_stock", form.shelf_stock),
                )}
              />
          </label>
        ) : null}
        {fieldEnabled("sku") ? (
          <label className={`block ${relatedFieldClassName("sku")}`} style={{ order: fieldOrder("sku") }}>
            <span className={labelClassName}>EAN-13</span>
            <div className="flex gap-2">
              <input
                className={`${fieldClassName} min-w-0 flex-1 ${
                  ean13Locked ? "bg-slate-50 font-extrabold" : ""
                }`}
                inputMode="numeric"
                maxLength={13}
                onChange={(event) => {
                  if (!ean13Locked) {
                    updateRelatedBuiltIn(
                      "ean13",
                      normalizeEan13Input(event.target.value),
                    );
                  }
                }}
                placeholder="Quét hoặc nhập 13 chữ số"
                readOnly={ean13Locked}
                value={relatedValue("sku", form.ean13)}
              />
              {ean13Locked ? (
                <span className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-moss-50 px-3 text-xs font-extrabold text-moss-700">
                  Đã chọn
                </span>
              ) : (
                <Button
                  aria-label="Quét EAN-13"
                  className="h-10 min-h-10 shrink-0 bg-blue-50 px-3 text-blue-700 ring-blue-200 hover:bg-blue-100"
                  onClick={() => setEan13ScannerOpen(true)}
                  variant="secondary"
                >
                  <Barcode className="h-4 w-4" />
                  Quét
                </Button>
              )}
            </div>
          </label>
        ) : null}

        {error ? (
          <div className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {submitting ? <span className="sr-only">Đang lưu sản phẩm</span> : null}
      </form>

      <Modal
        footer={
          <Button onClick={() => setVariantChooserOpen(false)}>Hoàn tất</Button>
        }
        onClose={() => setVariantChooserOpen(false)}
        open={variantChooserOpen}
        size="sm"
        title="Thêm biến thể"
      >
        <div className="space-y-2">
          <p className="mb-3 text-xs font-semibold text-slate-500">
            Chọn các biến thể đã tạo. Thuộc tính vẫn nằm đúng vị trí trong cài
            đặt; các trường thông tin liên quan sẽ có vạch xanh và thay đổi
            theo lựa chọn đang chỉnh sửa.
          </p>
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-moss-400 bg-moss-50 px-3 py-3 text-sm font-extrabold text-moss-800 transition hover:bg-moss-100"
            onClick={() => {
              setVariantChooserOpen(false);
              setVariantCreateOpen(true);
              setVariantCreateError("");
            }}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Tạo biến thể mới
          </button>
          {settings.customAttributes.some(
            (attribute) =>
              attribute.type === "single" || attribute.type === "multiple",
          ) ? (
            settings.customAttributes
              .filter(
                (attribute) =>
                  attribute.type === "single" || attribute.type === "multiple",
              )
              .map((attribute) => {
              const checked = selectedVariantIds.includes(attribute.id);
              return (
                <div
                  className={`flex items-center gap-2 rounded-xl border p-2 ${checked ? "border-moss-400 bg-moss-50" : "border-slate-200 bg-white"}`}
                  key={attribute.id}
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 p-1">
                    <input
                      checked={checked}
                      className="h-4 w-4 accent-moss-700"
                      onChange={(event) =>
                        event.target.checked
                          ? setAttributeValues((current) => ({
                              ...current,
                              _variantAttributeIds: [
                                ...new Set([
                                  ...selectedVariantIds,
                                  attribute.id,
                                ]),
                              ],
                            }))
                          : removeVariantFromProduct(attribute.id)
                      }
                      type="checkbox"
                    />
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm text-slate-950">
                        {attribute.name}
                      </strong>
                      <small className="font-semibold text-slate-500">
                        {attribute.type === "single" ? "Chọn một" : "Chọn nhiều"}
                      </small>
                    </span>
                    {checked ? (
                      <Check className="h-4 w-4 text-moss-700" />
                    ) : null}
                  </label>
                  {checked ? (
                    <button
                      aria-label={`Gỡ ${attribute.name} khỏi sản phẩm`}
                      className="flex h-9 shrink-0 items-center justify-center gap-1 rounded-lg bg-red-50 px-2 text-xs font-extrabold text-red-700 transition hover:bg-red-100"
                      onClick={() => removeVariantFromProduct(attribute.id)}
                      title="Gỡ biến thể khỏi sản phẩm"
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                      Gỡ
                    </button>
                  ) : null}
                </div>
              );
              })
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm font-semibold text-slate-500">
              Chưa có biến thể. Hãy tạo trong trang Các biến thể trước.
            </div>
          )}
        </div>
      </Modal>

      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2">
            <Button
              disabled={variantCreating}
              onClick={() => {
                setVariantCreateOpen(false);
                setVariantChooserOpen(true);
              }}
              variant="secondary"
            >
              Quay lại
            </Button>
            <Button
              disabled={variantCreating}
              onClick={() => void createVariantFromForm()}
            >
              {variantCreating ? "Đang tạo..." : "Tạo và thêm"}
            </Button>
          </div>
        }
        onClose={() => {
          setVariantCreateOpen(false);
          setVariantChooserOpen(true);
        }}
        open={variantCreateOpen}
        size="sm"
        title="Tạo biến thể mới"
      >
        <div className="space-y-3">
          <Input
            autoFocus
            label="Tên biến thể"
            onChange={(event) => {
              setVariantCreateName(event.target.value);
              setVariantCreateError("");
            }}
            placeholder="Ví dụ: Màu, Kích thước"
            value={variantCreateName}
          />
          <label className="block">
            <span className={labelClassName}>Loại lựa chọn</span>
            <select
              className={fieldClassName}
              onChange={(event) =>
                setVariantCreateType(
                  event.target.value as "single" | "multiple",
                )
              }
              value={variantCreateType}
            >
              <option value="single">Chọn 1</option>
              <option value="multiple">Chọn nhiều</option>
            </select>
          </label>
          <label className="block">
            <span className={labelClassName}>Các giá trị</span>
            <textarea
              className={`${fieldClassName} min-h-28 resize-y`}
              onChange={(event) => {
                setVariantCreateOptions(event.target.value);
                setVariantCreateError("");
              }}
              placeholder={"Mỗi giá trị một dòng hoặc phân cách bằng dấu phẩy\nVí dụ: Đỏ, Xanh, Trắng"}
              value={variantCreateOptions}
            />
          </label>
          {variantCreateError ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              {variantCreateError}
            </p>
          ) : null}
        </div>
      </Modal>

      <MediaPickerModal
        canUploadImage={canUploadImage}
        currentImageUrl={previewUrl}
        libraryImages={libraryImages}
        multipleUpload
        onClose={() => setMediaOpen(false)}
        onSave={({ imageFiles: nextFiles, imageUrl }) => {
          if (imagePreviewUrl.startsWith("blob:")) {
            URL.revokeObjectURL(imagePreviewUrl);
          }

          setImageFiles(nextFiles);
          setImagePreviewUrl(
            nextFiles[0] ? URL.createObjectURL(nextFiles[0]) : "",
          );
          updateRelatedBuiltIn("image_url", imageUrl);
          setMediaOpen(false);
        }}
        open={mediaOpen}
      />

      {canCreateCategory ? (
        <Modal
          footer={
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <button
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-950 transition hover:bg-slate-50 sm:min-w-28"
                onClick={closeCategoryModal}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-2xl bg-coal px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-coal/15 transition hover:bg-coal/90 sm:min-w-32"
                disabled={categorySubmitting}
                onClick={() => void saveCategoryDraft()}
                type="button"
              >
                {categorySubmitting ? "Đang lưu..." : "Thêm"}
              </button>
            </div>
          }
          onClose={closeCategoryModal}
          open={categoryModalOpen}
          size="sm"
          title="Thêm nhóm hàng"
        >
          <form
            className="space-y-3"
            id="product-category-form"
            onSubmit={handleAddCategory}
          >
            <label className="block">
              <span className={labelClassName}>Tên nhóm hàng</span>
              <input
                autoFocus
                className={fieldClassName}
                onChange={(event) => {
                  setCategoryDraft(event.target.value);
                  setCategoryError("");
                }}
                placeholder="Ví dụ: Sữa bột, Sữa tươi..."
                value={categoryDraft}
              />
            </label>
            {categoryError ? (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {categoryError}
              </div>
            ) : null}
          </form>
        </Modal>
      ) : null}
      <Ean13ScannerModal
        description="Quét EAN-13 có sẵn trên bao bì sản phẩm. Mã quét được sẽ lưu vào trường EAN-13 của sản phẩm."
        onClose={() => setEan13ScannerOpen(false)}
        onDetected={(value) => {
          updateField("ean13", value);
          setError("");
        }}
        open={ean13ScannerOpen}
        title="Quét EAN-13 sản phẩm"
      />
    </>
  );
}

type ProductEditorModalProps = {
  canCreateCategory: boolean;
  canDeleteProduct: boolean;
  canSetVisibility: boolean;
  canSubmit: boolean;
  canUploadImage: boolean;
  categories: string[];
  initialEan13?: string;
  libraryImages: string[];
  open: boolean;
  product?: Product | null;
  submitting: boolean;
  settings: ProductSettings;
  onAddCategory: (name: string) => Promise<string>;
  onCreateVariant: (input: {
    name: string;
    options: string[];
    type: "single" | "multiple";
  }) => Promise<CustomProductAttribute>;
  onCancel: () => void;
  onDelete: (product: Product) => Promise<void>;
  onSubmit: (input: ProductInput, imageFiles: File[]) => Promise<void>;
};

function ProductEditorModal({
  canCreateCategory,
  canDeleteProduct,
  canSetVisibility,
  canSubmit,
  canUploadImage,
  categories,
  initialEan13 = "",
  libraryImages,
  onAddCategory,
  onCreateVariant,
  onCancel,
  onDelete,
  onSubmit,
  open,
  product,
  submitting,
  settings,
}: ProductEditorModalProps) {
  const formId = product ? `product-form-${product.id}` : "product-form-create";

  return (
    <Modal
      bodyClassName="sm:px-5 sm:py-4"
      footer={
        <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
          <div className="flex gap-1.5">
            {product && canDeleteProduct ? (
              <button
                aria-label="Xóa sản phẩm"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-700 ring-1 ring-red-200 transition hover:bg-red-100 disabled:opacity-60"
                disabled={submitting}
                onClick={() => void onDelete(product)}
                title="Xóa sản phẩm"
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 justify-self-end sm:w-auto">
            <button
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50 sm:min-w-24"
              onClick={onCancel}
              type="button"
            >
              Hủy
            </button>
            {canSubmit ? (
              <button
                className="h-10 rounded-xl bg-moss-700 px-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-moss-800 disabled:opacity-60 sm:min-w-32"
                disabled={submitting}
                form={formId}
                type="submit"
              >
                {submitting ? "Đang lưu..." : product ? "Lưu" : "Thêm"}
              </button>
            ) : null}
          </div>
        </div>
      }
      onClose={onCancel}
      open={open}
      size="wide"
      title={product ? "Sửa sản phẩm" : "Thêm sản phẩm"}
    >
      <ProductForm
        canCreateCategory={canCreateCategory}
        canSetVisibility={canSetVisibility}
        canUploadImage={canUploadImage}
        categories={categories}
        ean13Locked={!product}
        ean13Required={!product}
        formId={formId}
        initialEan13={initialEan13}
        libraryImages={libraryImages}
        onAddCategory={onAddCategory}
        onCreateVariant={onCreateVariant}
        onSubmit={onSubmit}
        product={product}
        submitting={submitting}
        settings={settings}
      />
    </Modal>
  );
}

type ProductDetailModalProps = {
  batches: ProductBatch[];
  canEditProduct: boolean;
  open: boolean;
  product: Product | null;
  settings: ProductSettings;
  onClose: () => void;
  onEdit: (product: Product) => void;
};

function ProductDetailModal({
  batches,
  canEditProduct,
  onClose,
  onEdit,
  open,
  product,
  settings,
}: ProductDetailModalProps) {
  if (!product) {
    return null;
  }

  const activeBatches = batches.filter((batch) => batch.quantity > 0);
  const nearestBatch =
    activeBatches.find((batch) => batch.expiry_date) ??
    activeBatches[0] ??
    null;
  const expiryStatus = getExpiryStatus(
    nearestBatch?.expiry_date ?? product.expiry_date,
  );
  const detailItems = getEnabledProductDetailItems(product, settings).map((item) => ({
    ...item,
    value:
      item.label === "Ngày nhập"
        ? formatProductDate(product.import_date)
        : item.label === "Hạn sử dụng"
          ? formatProductDate(product.expiry_date)
          : item.value,
  }));
  const attributes = getProductAttributes(product);
  const variantDefinitions = getProductVariantDefinitions(product, settings);
  const variants = getProductVariants(product);
  const variantAttributeIds = new Set(
    variantDefinitions.map((definition) => definition.id),
  );
  const customDetailItems = settings.customAttributes
    .filter(
      (attribute) =>
        attribute.enabled &&
        attribute.type !== "media" &&
        attributes[attribute.id] !== undefined &&
        attributes[attribute.id] !== null &&
        attributes[attribute.id] !== "",
    )
    .map((attribute) => {
      const value = attributes[attribute.id];
      const displayValue = Array.isArray(value)
        ? value.join(", ")
        : value && typeof value === "object"
          ? `${Array.isArray((value as { images?: unknown }).images) ? (value as { images: unknown[] }).images.length : 0} ảnh${(value as { video?: unknown }).video ? " + video" : ""}`
          : String(value);
      return { label: attribute.name, value: displayValue };
    });
  const customMediaItems = settings.customAttributes
    .filter(
      (attribute) =>
        attribute.enabled &&
        attribute.type === "media" &&
        attributes[attribute.id] &&
        typeof attributes[attribute.id] === "object",
    )
    .map((attribute) => ({
      definition: attribute,
      value: attributes[attribute.id] as {
        images?: string[];
        video?: string;
      },
    }))
    .filter(
      (item) =>
        (item.value.images?.filter(Boolean).length ?? 0) > 0 ||
        Boolean(item.value.video),
    );
  const maxVariantSpecificity = Math.max(
    0,
    ...variants.map(
      (variant) =>
        Object.keys(variant.values).filter((key) => variantAttributeIds.has(key))
          .length,
    ),
  );
  const inventoryVariants = variants.filter(
    (variant) =>
      Object.keys(variant.values).filter((key) => variantAttributeIds.has(key))
        .length === maxVariantSpecificity,
  );
  const variantStockTotal = inventoryVariants.reduce(
    (sum, variant) => sum + getVariantStock(variant),
    0,
  );
  const variantShelfTotal = inventoryVariants.reduce(
    (sum, variant) => sum + getVariantStock(variant, true),
    0,
  );
  const orderedVariants = [...variants].sort((left, right) => {
    const specificity =
      Object.keys(right.values).filter((key) => variantAttributeIds.has(key))
        .length -
      Object.keys(left.values).filter((key) => variantAttributeIds.has(key))
        .length;
    return specificity;
  });

  return (
    <Modal
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <button
            className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50 sm:min-w-24"
            onClick={onClose}
            type="button"
          >
            Đóng
          </button>
          {canEditProduct ? (
            <button
              className="min-h-10 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-700 sm:min-w-28"
              onClick={() => onEdit(product)}
              type="button"
            >
              Sửa
            </button>
          ) : null}
        </div>
      }
      onClose={onClose}
      open={open}
      size="lg"
      title="Chi tiết sản phẩm"
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          {settings.enabledFields.image !== false ? (
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
            {product.image_url ? (
              <img
                alt={product.name}
                className="h-full w-full object-cover"
                src={product.image_url}
              />
            ) : (
              <NoImagePlaceholder />
            )}
          </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              {settings.enabledFields.is_active !== false ? (
              <Badge
                className="items-center gap-1"
                tone={product.is_active ? "green" : "red"}
              >
                {product.is_active ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
                {product.is_active ? "Đang hiện" : "Đang ẩn"}
              </Badge>
              ) : null}
              {settings.enabledFields.expiry_date !== false ? (
              <Badge tone={getExpiryTone(expiryStatus)}>
                {getExpiryLabel(expiryStatus)}
              </Badge>
              ) : null}
            </div>
            <h3 className="mt-2 font-display text-xl font-bold text-coal sm:text-2xl">
              {product.name}
            </h3>
            {settings.enabledFields.description !== false ? (
              <p className="mt-1.5 text-sm leading-5 text-coal/60">
                {product.description || "Chưa có mô tả sản phẩm."}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[...detailItems, ...customDetailItems].map((item) => (
            <div
              className="rounded-xl bg-slate-50 px-3 py-2.5"
              key={item.label}
            >
              <p className="text-xs font-extrabold uppercase tracking-wide text-coal/45">
                {item.label}
              </p>
              <p className="mt-1 break-words font-bold text-coal">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {customMediaItems.map((item) => (
          <section className="space-y-2" key={item.definition.id}>
            <h4 className="text-sm font-extrabold uppercase tracking-wide text-coal/55">
              {item.definition.name}
            </h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(item.value.images ?? []).filter(Boolean).map((url) => (
                <a
                  className="block aspect-video overflow-hidden rounded-xl bg-slate-100"
                  href={url}
                  key={url}
                  rel="noreferrer"
                  target="_blank"
                >
                  <img
                    alt={item.definition.name}
                    className="h-full w-full object-cover"
                    src={url}
                  />
                </a>
              ))}
              {item.value.video ? (
                <video
                  className="aspect-video w-full rounded-xl bg-slate-950 object-contain"
                  controls
                  src={item.value.video}
                />
              ) : null}
            </div>
          </section>
        ))}

        {variantDefinitions.length > 1000 ? (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-extrabold uppercase tracking-wide text-coal/55">
                  Biến thể và số lượng
                </h4>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Tổng {variantStockTotal} · trên kệ {variantShelfTotal} · trong kho {Math.max(variantStockTotal - variantShelfTotal, 0)}
                </p>
              </div>
              <Badge tone="blue">{inventoryVariants.length} biến thể</Badge>
            </div>

            {variants.length ? (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="hidden grid-cols-[minmax(0,1fr)_90px_90px_90px] gap-3 bg-slate-50 px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-slate-500 sm:grid">
                  <span>Biến thể</span>
                  <span className="text-right">Tổng tồn</span>
                  <span className="text-right">Trên kệ</span>
                  <span className="text-right">Trong kho</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {orderedVariants.map((variant, index) => {
                    const specificity = Object.keys(variant.values).filter(
                      (key) => variantAttributeIds.has(key),
                    ).length;
                    const stock = getVariantStock(variant);
                    const shelfStock = getVariantStock(variant, true);
                    const relatedItems = Object.entries(
                      variant.linked_values ?? {},
                    )
                      .filter(
                        ([key, value]) =>
                          settings.enabledFields[key] !== false && value !== "",
                      )
                      .map(([key, value]) => ({
                        label:
                          settings.customAttributes.find(
                            (attribute) => attribute.id === key,
                          )?.name ?? linkedFieldLabels[key] ?? key,
                        value:
                          ["price", "cost_price"].includes(key) &&
                          Number.isFinite(Number(value))
                            ? formatCurrency(Number(value))
                            : ["import_date", "expiry_date"].includes(key)
                              ? formatProductDate(value)
                              : value,
                      }));
                    const label =
                      getProductVariantLabel(variant, variantDefinitions) ||
                      Object.values(variant.values).join(" / ") ||
                      `Biến thể ${index + 1}`;
                    return (
                      <div
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_90px_90px_90px] sm:px-4"
                        key={`${label}-${index}`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                            {variant.image_url || product.image_url ? (
                              <img
                                alt={label}
                                className="h-full w-full object-cover"
                                src={variant.image_url || product.image_url || ""}
                              />
                            ) : (
                              <NoImagePlaceholder compact />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-extrabold text-slate-900">{label}</p>
                            <p className="truncate text-xs font-semibold text-slate-500">
                              {specificity > 1
                                ? "Tổ hợp ưu tiên"
                                : "Dữ liệu riêng theo thuộc tính"}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-right sm:contents">
                          <p className="font-black tabular-nums text-slate-900" title="Tổng tồn">{stock}</p>
                          <p className="font-black tabular-nums text-moss-700" title="Trên kệ">{shelfStock}</p>
                          <p className="font-black tabular-nums text-slate-600" title="Trong kho">{Math.max(stock - shelfStock, 0)}</p>
                        </div>
                        {relatedItems.length ? (
                          <div className="col-span-full grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 sm:grid-cols-3">
                            {relatedItems.map((item) => (
                              <div
                                className="rounded-lg bg-slate-50 px-2.5 py-2"
                                key={item.label}
                              >
                                <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                                  {item.label}
                                </p>
                                <p className="mt-0.5 break-words text-xs font-bold text-slate-800">
                                  {item.value}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-4 text-center text-sm font-bold text-amber-700">
                Sản phẩm đã chọn thuộc tính biến thể nhưng chưa khai báo số lượng cho từng biến thể.
              </div>
            )}
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-extrabold uppercase tracking-wide text-coal/55">
              Tồn kho theo lô
            </h4>
            <Badge tone="neutral">{activeBatches.length} lô</Badge>
          </div>

          {activeBatches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">
              Chưa có lô nhập kho nào còn hàng.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <div className="hidden grid-cols-[1fr_1fr_110px_120px] gap-3 bg-slate-50 px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-slate-500 sm:grid">
                <span>Ngày nhập</span>
                <span>Hạn sử dụng</span>
                <span className="text-right">Tổng / Kệ / Kho</span>
                <span className="text-right">Trạng thái</span>
              </div>
              <div className="divide-y divide-slate-100">
                {activeBatches.map((batch) => {
                  const status = getExpiryStatus(batch.expiry_date);

                  return (
                    <div
                      className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_1fr_110px_120px] sm:items-center"
                      key={batch.id}
                    >
                      <div>
                        <p className="text-xs font-extrabold uppercase text-slate-400 sm:hidden">
                          Ngày nhập
                        </p>
                        <p className="font-bold text-slate-900">
                          {formatProductDate(batch.import_date)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-extrabold uppercase text-slate-400 sm:hidden">
                          Hạn sử dụng
                        </p>
                        <p className="font-bold text-slate-900">
                          {formatProductDate(batch.expiry_date)}
                        </p>
                      </div>
                      <p className="text-left font-extrabold tabular-nums text-slate-900 sm:text-right">
                        {batch.quantity} / {batch.shelf_quantity} /{" "}
                        {batch.quantity - batch.shelf_quantity}
                      </p>
                      <div className="sm:text-right">
                        <Badge tone={getExpiryTone(status)}>
                          {getExpiryLabel(status)}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

type ReceiveStockModalProps = {
  onClose: () => void;
  onSubmit: (input: ReceiveStockInput) => Promise<void>;
  open: boolean;
  product?: Product | null;
  products: Product[];
  submitting: boolean;
};

function ReceiveStockModal({
  onClose,
  onSubmit,
  open,
  product,
  products,
  submitting,
}: ReceiveStockModalProps) {
  const [productId, setProductId] = useState(product?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [importDate, setImportDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [expiryDate, setExpiryDate] = useState("");
  const [error, setError] = useState("");
  const formId = "receive-stock-form";

  useEffect(() => {
    setProductId(product?.id ?? "");
    setQuantity("1");
    setImportDate(new Date().toISOString().slice(0, 10));
    setExpiryDate("");
    setError("");
  }, [open, product]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const nextQuantity = Number(quantity);
    const nextImportDate = normalizeNullableText(importDate);
    const nextExpiryDate = normalizeNullableText(expiryDate);

    if (!productId) {
      setError("Chọn sản phẩm cần nhập kho.");
      return;
    }

    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
      setError("Số lượng nhập phải lon hon 0.");
      return;
    }

    if (nextImportDate && nextExpiryDate && nextExpiryDate < nextImportDate) {
      setError("Ngày hết hạn phải sau hoặc bằng ngày nhập.");
      return;
    }

    try {
      await onSubmit({
        expiry_date: nextExpiryDate,
        import_date: nextImportDate,
        product_id: productId,
        quantity: Math.floor(nextQuantity),
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Nhập kho thất bại."));
    }
  }

  return (
    <Modal
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button onClick={onClose} type="button" variant="secondary">
            Hủy
          </Button>
          <Button form={formId} isLoading={submitting} type="submit">
            Nhập kho
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      size="md"
      title="Nhập kho"
    >
      <form className="space-y-5" id={formId} onSubmit={handleSubmit}>
        <label className="block">
          <span className={labelClassName}>Sản phẩm</span>
          <select
            className={`${fieldClassName} appearance-none`}
            disabled={Boolean(product)}
            onChange={(event) => setProductId(event.target.value)}
            value={productId}
          >
            <option value="">Chọn sản phẩm</option>
            {products.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <Input
          inputMode="numeric"
          label="Số lượng nhập"
          onChange={(event) =>
            setQuantity(normalizeIntegerInput(event.target.value))
          }
          type="text"
          value={formatIntegerInput(quantity)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Ngày nhập"
            onChange={(event) => setImportDate(event.target.value)}
            type="date"
            value={importDate}
          />
          <Input
            label="Ngày hết hạn"
            onChange={(event) => setExpiryDate(event.target.value)}
            type="date"
            value={expiryDate}
          />
        </div>

        {error ? (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

export function ProductsPage() {
  const { canAccess } = useAuth();
  const [createEan13Open, setCreateEan13Open] = useState(false);
  const [ean13LabelsOpen, setEan13LabelsOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [initialCreateEan13, setInitialCreateEan13] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [cloudinaryLibraryImages, setCloudinaryLibraryImages] = useState<
    string[]
  >([]);
  const [productBatches, setProductBatches] = useState<ProductBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [expiryFilter, setExpiryFilter] = useState<"all" | "soon" | "expired">(
    "all",
  );
  const [visibilityFilter, setVisibilityFilter] = useState<
    "all" | "visible" | "hidden"
  >("all");
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receivingProduct, setReceivingProduct] = useState<Product | null>(
    null,
  );
  const [savedCategories, setSavedCategories] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submittingReceive, setSubmittingReceive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPreview, setSettingsPreview] = useState<"card" | "pos" | null>(
    null,
  );
  const [settingsLinks, setSettingsLinks] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [productSettings, setProductSettings] = useState<ProductSettings>(
    defaultProductSettings,
  );
  const { clearErrorNotice, errorNotice, setErrorNotice, showErrorNotice } =
    useErrorNotice(setError);
  const canCreateProduct = canAccess("products.create");
  const canEditProduct = canAccess("products.update");
  const canDeleteProduct = canAccess("products.delete");
  const canSetProductVisibility = canAccess("products.toggle-active");
  // Nhập kho đã được chuyển vào tab riêng của trang Kho hợp nhất.
  const canReceiveStock = false;
  const canCreateCategory = canAccess("products.categories.create");
  const canPrintEan13 = canAccess("products.ean13.print");
  const canUploadCloudinaryImage = canAccess("cloudinary-images.upload");

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [
        nextProducts,
        nextCategories,
        nextBatches,
        nextCloudinaryResources,
        nextSettings,
      ] = await Promise.all([
        fetchProducts(),
        fetchProductCategories(),
        fetchProductBatches(),
        fetchCloudinaryImageResources().catch(() => []),
        fetchProductSettings(),
      ]);

      setProducts(nextProducts);
      setProductSettings(nextSettings);
      setProductBatches(nextBatches);
      setSavedCategories(nextCategories);
      setCloudinaryLibraryImages(
        nextCloudinaryResources
          .map((resource) => resource.secure_url || resource.url)
          .filter((url): url is string => Boolean(url)),
      );
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Không tải được danh sách sản phẩm.";
      showErrorNotice(message, "Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [showErrorNotice]);

  async function handleSaveSettings(value: ProductSettings) {
    setSavingSettings(true);
    try {
      setProductSettings(await saveProductSettings(value));
      setSettingsOpen(false);
      setSettingsLinks(false);
      setSettingsPreview(null);
    } catch (requestError) {
      showErrorNotice(
        getErrorMessage(requestError, "Không lưu được cài đặt sản phẩm."),
        "Lưu cài đặt thất bại",
      );
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleCreateVariantFromForm(input: {
    name: string;
    options: string[];
    type: "single" | "multiple";
  }) {
    const name = input.name.trim();
    if (
      productSettings.customAttributes.some(
        (attribute) => attribute.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      throw new Error("Tên biến thể đã tồn tại.");
    }

    const id = crypto.randomUUID();
    const attribute: CustomProductAttribute = {
      id,
      name,
      type: input.type,
      options: [...new Set(input.options.map((option) => option.trim()).filter(Boolean))],
      enabled: true,
      useForVariants: true,
      optionDisplay: "text",
      optionColors: {},
    };
    const nextSettings: ProductSettings = {
      ...productSettings,
      customAttributes: [...productSettings.customAttributes, attribute],
      attributeOrder: [...productSettings.attributeOrder, id],
      enabledFields: { ...productSettings.enabledFields, [id]: true },
      card: {
        ...productSettings.card,
        order: [...productSettings.card.order, id],
        visibleFields: [...new Set([...productSettings.card.visibleFields, id])],
      },
      posCard: {
        ...productSettings.posCard,
        order: [...productSettings.posCard.order, id],
        visibleFields: [...new Set([...productSettings.posCard.visibleFields, id])],
      },
    };

    setSavingSettings(true);
    try {
      const savedSettings = await saveProductSettings(nextSettings);
      setProductSettings(savedSettings);
      return (
        savedSettings.customAttributes.find((item) => item.id === id) ?? attribute
      );
    } finally {
      setSavingSettings(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    function focusProductSearch(event: KeyboardEvent) {
      if (event.key === "F3") {
        event.preventDefault();
        setSearchModalOpen(true);
      }
    }
    window.addEventListener("keydown", focusProductSearch);
    return () => window.removeEventListener("keydown", focusProductSearch);
  }, []);

  function openCreateModal() {
    if (!canCreateProduct) {
      return;
    }

    setEditingProduct(null);
    setInitialCreateEan13("");
    setCreateEan13Open(true);
    setModalOpen(false);
  }

  function openEditModal(product: Product) {
    if (!canEditProduct) {
      return;
    }

    setEditingProduct(product);
    setInitialCreateEan13("");
    setCreateEan13Open(false);
    setModalOpen(true);
  }

  function openCreateForm(ean13: string) {
    if (!canCreateProduct) {
      return;
    }

    setEditingProduct(null);
    setInitialCreateEan13(ean13);
    setCreateEan13Open(false);
    setModalOpen(true);
  }

  function closeProductEditor() {
    setModalOpen(false);

    if (!editingProduct) {
      setInitialCreateEan13("");
    }
  }

  function openViewModal(product: Product) {
    setViewingProduct(product);
  }

  function openEditFromDetail(product: Product) {
    if (!canEditProduct) {
      return;
    }

    setViewingProduct(null);
    openEditModal(product);
  }

  function openReceiveModal(product?: Product | null) {
    if (!canReceiveStock) {
      return;
    }

    setReceivingProduct(product ?? null);
    setReceiveModalOpen(true);
  }

  function closeReceiveModal() {
    setReceiveModalOpen(false);
    setReceivingProduct(null);
  }

  async function handleAddCategory(name: string) {
    if (!canCreateCategory) {
      throw new Error("Bạn không có quyền thêm nhóm hàng.");
    }

    const savedCategory = await createProductCategory(name);
    setSavedCategories((current) =>
      mergeCategoryNames([...current, savedCategory]),
    );
    return savedCategory;
  }

  async function handleSave(input: ProductInput, imageFiles: File[]) {
    if (
      (editingProduct && !canEditProduct) ||
      (!editingProduct && !canCreateProduct)
    ) {
      return;
    }

    if (imageFiles.length && !canUploadCloudinaryImage) {
      throw new Error("Bạn không có quyền tải ảnh lên Cloudinary.");
    }

    setSubmitting(true);
    setError("");

    try {
      const guardedInput = canSetProductVisibility
        ? input
        : { ...input, is_active: editingProduct?.is_active ?? true };
      const imageUploads = await Promise.all(
        imageFiles.map(uploadProductImageAsset),
      );
      const imageUrl = imageUploads[0]?.url ?? guardedInput.image_url;
      const payload = { ...guardedInput, image_url: imageUrl };

      await Promise.all(imageUploads.map(saveCloudinaryImageAsset));

      if (editingProduct) {
        await updateProduct(editingProduct.id, payload);
      } else {
        await createProduct(payload);
      }

      setModalOpen(false);
      setEditingProduct(null);
      setInitialCreateEan13("");
      await loadProducts();
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Lưu sản phẩm thất bại.";
      setError(message);
      setErrorNotice({ message, title: "Lưu sản phẩm thất bại" });
      throw new Error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReceiveStock(input: ReceiveStockInput) {
    if (!canReceiveStock) {
      return;
    }

    setSubmittingReceive(true);
    setError("");

    try {
      await receiveProductStock(input);
      closeReceiveModal();
      await loadProducts();
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Nhập kho thất bại.";
      setError(message);
      setErrorNotice({ message, title: "Nhập kho thất bại" });
      throw new Error(message);
    } finally {
      setSubmittingReceive(false);
    }
  }

  async function handleDelete(product: Product) {
    if (!canDeleteProduct) {
      return;
    }

    const confirmed = window.confirm(`Xóa sản phẩm "${product.name}"?`);
    if (!confirmed) {
      return;
    }

    setError("");

    try {
      const deletingEditingProduct = editingProduct?.id === product.id;
      const result = await deleteProduct(product.id);
      setViewingProduct((current) =>
        current?.id === product.id ? null : current,
      );
      if (deletingEditingProduct) {
        setModalOpen(false);
        setEditingProduct(null);
        setInitialCreateEan13("");
      }
      await loadProducts();

      if (result.mode === "soft-deleted") {
        setErrorNotice({
          message:
            "Sản phẩm có lịch sử hóa đơn nên hệ thống đã ẩn khỏi danh sách thay vì xóa vĩnh viễn.",
          title: "Đã ẩn sản phẩm",
        });
      } else if (result.mode === "hidden") {
        setErrorNotice({
          message:
            "Cơ sở dữ liệu chưa có cột deleted_at; sản phẩm đã được chuyển sang trạng thái ẩn.",
          title: "Đã ẩn sản phẩm",
        });
      }
    } catch (requestError) {
      showErrorNotice(
        requestError instanceof Error
          ? requestError.message
          : "Xóa sản phẩm thất bại.",
        "Xóa sản phẩm thất bại",
      );
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filteredProducts = products.filter(
    (product) =>
      [
        product.name,
        product.sku,
        product.category,
        getProductEan13Value(product),
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery)) &&
      (expiryFilter === "all" ||
        getProductExpiryStatus(product) === expiryFilter) &&
      (visibilityFilter === "all" ||
        (visibilityFilter === "visible"
          ? product.is_active
          : !product.is_active)),
  );
  const effectiveProductCardSettings = {
    ...productSettings.card,
    visibleFields: productSettings.card.visibleFields.filter(
      (key) => productSettings.enabledFields[key] !== false,
    ),
  };
  const libraryImages = Array.from(
    new Set([
      ...cloudinaryLibraryImages,
      ...products
        .map((product) => product.image_url)
        .filter((url): url is string => Boolean(url?.includes("cloudinary"))),
    ]),
  ) as string[];
  const categories = mergeCategoryNames([
    ...savedCategories,
    ...products.map((product) => product.category),
  ]);

  function getProductActiveBatches(productId: string) {
    return productBatches.filter(
      (batch) => batch.product_id === productId && batch.quantity > 0,
    );
  }

  function getProductExpiryStatus(product: Product) {
    return getExpiryStatus(product.expiry_date);
  }

  function getProductExpiryClassName(product: Product) {
    const status = getProductExpiryStatus(product);
    if (status === "expired") {
      return "text-red-600";
    }

    if (status === "soon") {
      return "text-amber-600";
    }

    return "text-slate-950";
  }

  const expiredCount = products.filter(
    (product) => getProductExpiryStatus(product) === "expired",
  ).length;
  const expiringSoonCount = products.filter(
    (product) => getProductExpiryStatus(product) === "soon",
  ).length;
  const hiddenCount = products.filter((product) => !product.is_active).length;
  const visibleCount = products.length - hiddenCount;

  return (
    <div className="w-full max-w-[100vw] px-0 pb-24 sm:px-2 sm:pb-0">
      <ConfigNotice />

      <section className="mb-2 flex items-center gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-soft sm:mb-3 sm:p-3">
        <button
          className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${expiryFilter === "all" && visibilityFilter === "all" ? "bg-slate-900 text-white ring-2 ring-slate-300" : "bg-slate-100 text-slate-600"}`}
          onClick={() => {
            setExpiryFilter("all");
            setVisibilityFilter("all");
          }}
          type="button"
        >
          <strong className="text-base font-black">{products.length}</strong>Mặt
          hàng
        </button>
        <button
          className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-amber-700 ${expiryFilter === "soon" ? "bg-amber-100 ring-2 ring-amber-400" : "bg-amber-50"}`}
          onClick={() =>
            setExpiryFilter((value) => (value === "soon" ? "all" : "soon"))
          }
          type="button"
        >
          <strong className="text-base font-black text-amber-900">
            {expiringSoonCount}
          </strong>
          Gần hết hạn
        </button>
        <button
          className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-red-700 ${expiryFilter === "expired" ? "bg-red-100 ring-2 ring-red-400" : "bg-red-50"}`}
          onClick={() =>
            setExpiryFilter((value) =>
              value === "expired" ? "all" : "expired",
            )
          }
          type="button"
        >
          <strong className="text-base font-black text-red-900">
            {expiredCount}
          </strong>
          Hết hạn
        </button>
        <button
          className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-moss-800 ${visibilityFilter === "visible" ? "bg-moss-100 ring-2 ring-moss-400" : "bg-moss-50"}`}
          onClick={() =>
            setVisibilityFilter((value) =>
              value === "visible" ? "all" : "visible",
            )
          }
          type="button"
        >
          <Eye className="h-4 w-4" />
          <strong className="text-base font-black">{visibleCount}</strong>
          Đang hiện
        </button>
        <button
          className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 ${visibilityFilter === "hidden" ? "bg-slate-200 ring-2 ring-slate-500" : "bg-slate-100"}`}
          onClick={() =>
            setVisibilityFilter((value) =>
              value === "hidden" ? "all" : "hidden",
            )
          }
          type="button"
        >
          <EyeOff className="h-4 w-4" />
          <strong className="text-base font-black">{hiddenCount}</strong>
          Đang ẩn
        </button>
      </section>

      <Card className="overflow-hidden rounded-none border-0 bg-transparent p-0 shadow-none sm:rounded-2xl sm:border sm:bg-white sm:shadow-soft">
        <div className="hidden border-b border-coal/10 px-2 py-2.5 sm:block sm:p-4">
          <div className="flex justify-end">
            <div className="hidden auto-cols-fr grid-flow-col gap-1.5 sm:flex sm:w-auto sm:gap-2">
              {canEditProduct ? (
                <>
                  <Button
                    onClick={() => {
                      setSettingsPreview(null);
                      setSettingsOpen(true);
                    }}
                    variant="secondary"
                  >
                    <Settings className="h-4 w-4" />
                    <span className="hidden sm:inline">Cài đặt sản phẩm</span>
                  </Button>
                </>
              ) : null}
              {canCreateProduct ? (
                <Button
                  className="w-full !bg-moss-700 px-2 !text-white hover:!bg-moss-800 sm:w-auto sm:px-4"
                  onClick={openCreateModal}
                >
                  <PackagePlus className="h-4 w-4" />
                  <span className="sm:hidden">Thêm</span>
                  <span className="hidden sm:inline">Thêm sản phẩm</span>
                </Button>
              ) : null}
              {canReceiveStock ? (
                <Button
                  className="w-full !bg-blue-50 px-2 !text-blue-700 !ring-blue-200 hover:!bg-blue-100 sm:w-auto sm:px-4"
                  disabled={products.length === 0}
                  onClick={() => openReceiveModal()}
                  variant="secondary"
                >
                  <PackagePlus className="h-4 w-4" />
                  <span className="sm:hidden">Nhập</span>
                  <span className="hidden sm:inline">Nhập kho</span>
                </Button>
              ) : null}
              {canPrintEan13 ? (
                <Button
                  className="w-full !bg-amber-50 px-2 !text-amber-700 !ring-amber-200 hover:!bg-amber-100 sm:w-auto sm:px-4"
                  disabled={products.length === 0}
                  onClick={() => setEan13LabelsOpen(true)}
                  variant="secondary"
                >
                  <Barcode className="h-4 w-4" />
                  <span className="sm:hidden">EAN-13</span>
                  <span className="hidden sm:inline">Tạo EAN-13</span>
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {error && !modalOpen ? (
          <div className="m-2.5 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700 sm:m-4">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="p-4">
            <Spinner />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-3">
            <EmptyState
              description="Thêm sản phẩm đầu tiên để POS có dữ liệu bán hàng."
              icon={Boxes}
              title="Chưa có sản phẩm phù hợp"
            />
          </div>
        ) : (
          <div className="max-h-[calc(100dvh-12.5rem)] overflow-y-auto overscroll-contain pb-2 sm:max-h-[68dvh] sm:p-3">
            <div className="grid auto-rows-fr grid-cols-2 items-stretch gap-1.5 sm:grid-cols-3 sm:gap-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {filteredProducts.map((product) => (
                <ProductCard
                  compact
                  expiryClassName={getProductExpiryClassName(product)}
                  key={product.id}
                  onSelect={() => openViewModal(product)}
                  product={product}
                  settings={effectiveProductCardSettings}
                  customAttributes={productSettings.customAttributes}
                  relatedProducts={products}
                />
              ))}
            </div>
          </div>
        )}
      </Card>

      {canEditProduct ? (
        <div className="fixed bottom-5 right-5 z-40 hidden items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-[0_12px_36px_rgba(15,23,42,0.18)] backdrop-blur sm:flex">
          <Button
            aria-label="Cài đặt sản phẩm"
            className="h-10 w-10 rounded-xl p-0"
            onClick={() => {
              setSettingsLinks(false);
              setSettingsPreview(null);
              setSettingsOpen(true);
            }}
            title="Cài đặt sản phẩm"
            variant="secondary"
          >
            <Settings className="h-4.5 w-4.5" />
          </Button>
          <Button
            aria-label="Các biến thể"
            className="h-10 w-10 rounded-xl p-0"
            onClick={() => {
              setSettingsLinks(true);
              setSettingsPreview(null);
              setSettingsOpen(true);
            }}
            title="Các biến thể"
            variant="secondary"
          >
            <Layers3 className="h-4.5 w-4.5" />
          </Button>
          <Button
            aria-label="Thiết kế card"
            className="h-10 w-10 rounded-xl p-0"
            onClick={() => {
              setSettingsLinks(false);
              setSettingsPreview("card");
              setSettingsOpen(true);
            }}
            title="Thiết kế card"
            variant="secondary"
          >
            <LayoutTemplate className="h-4.5 w-4.5" />
          </Button>
          <span className="mx-0.5 h-6 w-px bg-slate-200" />
          <Button
            aria-label="Tìm sản phẩm"
            className="h-10 w-10 rounded-xl p-0"
            onClick={() => setSearchModalOpen(true)}
            title="Tìm sản phẩm"
            variant="secondary"
          >
            <Search className="h-4.5 w-4.5" />
          </Button>
          {canCreateProduct ? (
            <Button
              aria-label="Thêm sản phẩm"
              className="h-10 w-10 rounded-xl p-0"
              onClick={openCreateModal}
              title="Thêm sản phẩm"
            >
              <PackagePlus className="h-4.5 w-4.5" />
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 py-2.5 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-sm grid-cols-5 gap-1.5">
          {canEditProduct ? (
            <Button
              aria-label="Các biến thể"
              className="h-11 w-full rounded-xl p-0"
              onClick={() => {
                setSettingsLinks(true);
                setSettingsPreview(null);
                setSettingsOpen(true);
              }}
              title="Các biến thể"
              variant="secondary"
            >
              <Layers3 className="h-5 w-5" />
            </Button>
          ) : null}
          {canEditProduct ? (
            <Button
              aria-label="Cài đặt sản phẩm"
              className="h-11 w-full rounded-xl p-0"
              onClick={() => {
                setSettingsLinks(false);
                setSettingsPreview(null);
                setSettingsOpen(true);
              }}
              title="Cài đặt sản phẩm"
              variant="secondary"
            >
              <Settings className="h-5 w-5" />
            </Button>
          ) : null}
          {canEditProduct ? (
            <Button
              aria-label="Thiết kế card"
              className="h-11 w-full rounded-xl p-0"
              onClick={() => {
                setSettingsLinks(false);
                setSettingsPreview("card");
                setSettingsOpen(true);
              }}
              title="Thiết kế card"
              variant="secondary"
            >
              <LayoutTemplate className="h-5 w-5" />
            </Button>
          ) : null}
          <Button
            aria-label="Tìm kiếm"
            className="h-11 w-full rounded-xl p-0"
            onClick={() => setSearchModalOpen(true)}
            title="Tìm kiếm"
            variant="secondary"
          >
            <Search className="h-5 w-5" />
          </Button>
          {canCreateProduct ? (
            <Button
              aria-label="Thêm sản phẩm"
              className="h-11 w-full rounded-xl p-0"
              onClick={openCreateModal}
              title="Thêm sản phẩm"
            >
              <PackagePlus className="h-5 w-5" />
            </Button>
          ) : null}
          {canPrintEan13 ? (
            <Button
              className="hidden h-12 shrink-0 rounded-xl px-4"
              disabled={products.length === 0}
              onClick={() => setEan13LabelsOpen(true)}
              variant="secondary"
            >
              <Barcode className="h-4 w-4" />
              In EAN-13
            </Button>
          ) : null}
        </div>
      </div>

      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2">
            <Button
              disabled={!query}
              onClick={() => setQuery("")}
              variant="secondary"
            >
              Xóa tìm kiếm
            </Button>
            <Button onClick={() => setSearchModalOpen(false)}>
              Xem danh sách
            </Button>
          </div>
        }
        onClose={() => setSearchModalOpen(false)}
        open={searchModalOpen}
        size="sm"
        title="Tìm sản phẩm"
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <Input
              autoFocus
              className="h-12 rounded-xl pl-11"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tên sản phẩm hoặc EAN-13"
              value={query}
            />
          </div>
          <p className="text-xs font-bold text-slate-500">
            {query
              ? `Tìm thấy ${filteredProducts.length} sản phẩm`
              : "Nhập tên, EAN-13 hoặc nhóm hàng để tìm kiếm."}
          </p>
          {query ? (
            <div className="max-h-[52dvh] space-y-1 overflow-y-auto pr-1">
              {filteredProducts.slice(0, 8).map((product) => (
                <button
                  className="grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-transparent p-2 text-left transition hover:border-moss-200 hover:bg-moss-50"
                  key={product.id}
                  onClick={() => {
                    setSearchModalOpen(false);
                    openViewModal(product);
                  }}
                  type="button"
                >
                  <span className="h-12 w-12 overflow-hidden rounded-lg bg-slate-100">
                    {product.image_url ? (
                      <img
                        alt={product.name}
                        className="h-full w-full object-cover"
                        src={product.image_url}
                      />
                    ) : (
                      <NoImagePlaceholder compact />
                    )}
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-sm text-slate-950">
                      {product.name}
                    </strong>
                    <small className="block truncate font-semibold text-slate-500">
                      {getProductEan13Value(product) || "Chưa có EAN-13"}
                    </small>
                  </span>
                  <strong className="text-xs text-moss-800">
                    {formatCurrency(product.price)}
                  </strong>
                </button>
              ))}
              {filteredProducts.length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-4 text-center text-sm font-semibold text-slate-500">
                  Không tìm thấy sản phẩm phù hợp.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>

      <ProductEditorModal
        canCreateCategory={canCreateCategory}
        canDeleteProduct={canDeleteProduct}
        canSetVisibility={canSetProductVisibility}
        canSubmit={editingProduct ? canEditProduct : canCreateProduct}
        canUploadImage={canUploadCloudinaryImage}
        categories={categories}
        initialEan13={initialCreateEan13}
        libraryImages={libraryImages}
        onAddCategory={handleAddCategory}
        onCreateVariant={handleCreateVariantFromForm}
        onCancel={closeProductEditor}
        onDelete={handleDelete}
        onSubmit={handleSave}
        open={modalOpen}
        product={editingProduct}
        submitting={submitting}
        settings={productSettings}
      />
      <ProductSettingsModal
        initialLinks={settingsLinks}
        initialPreview={settingsPreview}
        open={settingsOpen}
        settings={productSettings}
        sample={products[0] ?? null}
        saving={savingSettings}
        onClose={() => {
          setSettingsOpen(false);
          setSettingsLinks(false);
          setSettingsPreview(null);
        }}
        onSave={handleSaveSettings}
      />
      {canCreateProduct ? (
        <ProductEan13GateModal
          onClose={() => setCreateEan13Open(false)}
          onError={(notice) => setErrorNotice(notice)}
          onSelect={openCreateForm}
          open={createEan13Open}
          products={products}
        />
      ) : null}
      <ProductDetailModal
        batches={
          viewingProduct ? getProductActiveBatches(viewingProduct.id) : []
        }
        canEditProduct={canEditProduct}
        onClose={() => setViewingProduct(null)}
        onEdit={openEditFromDetail}
        open={Boolean(viewingProduct)}
        product={viewingProduct}
        settings={productSettings}
      />
      {canReceiveStock ? (
        <ReceiveStockModal
          onClose={closeReceiveModal}
          onSubmit={handleReceiveStock}
          open={receiveModalOpen}
          product={receivingProduct}
          products={products}
          submitting={submittingReceive}
        />
      ) : null}
      {canPrintEan13 ? (
        <Ean13LabelsModal
          onClose={() => setEan13LabelsOpen(false)}
          open={ean13LabelsOpen}
          products={products}
        />
      ) : null}
      <ErrorNoticeModal notice={errorNotice} onClose={clearErrorNotice} />
    </div>
  );
}
