import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  Barcode,
  Boxes,
  ChevronRight,
  Eye,
  EyeOff,
  Image as ImageIcon,
  PackagePlus,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { MediaPickerModal } from "../components/media/MediaPickerModal";
import { Ean13LabelsModal } from "../components/products/Ean13LabelsModal";
import { Ean13ScannerModal } from "../components/products/Ean13ScannerModal";
import { ProductCard } from "../components/products/ProductCard";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { useErrorNotice } from "../hooks/useErrorNotice";
import { getErrorMessage } from "../lib/errors";
import { formatCurrency, formatIntegerInput, normalizeIntegerInput } from "../lib/format";
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
import { fetchCloudinaryImageResources, uploadProductImageAsset } from "../lib/cloudinary";
import { normalizeNullableText } from "../lib/text";
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

type ProductFormState = {
  name: string;
  ean13: string;
  category: string;
  description: string;
  price: string;
  cost_price: string;
  import_date: string;
  expiry_date: string;
  stock: string;
  image_url: string;
  is_active: boolean;
  is_reward: boolean;
  reward_points_cost: string;
};

const emptyForm: ProductFormState = {
  category: "",
  cost_price: "0",
  description: "",
  ean13: "",
  expiry_date: "",
  image_url: "",
  import_date: "",
  is_active: true,
  is_reward: false,
  name: "",
  price: "0",
  reward_points_cost: "0",
  stock: "0",
};

const fieldClassName =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-moss-400 focus:ring-4 focus:ring-moss-100";
const labelClassName = "mb-1.5 block text-xs font-extrabold text-slate-700";

function productToForm(product?: Product | null, initialEan13 = ""): ProductFormState {
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
    firstCategory.localeCompare(secondCategory)
  );
}

function createUniqueVietnamEan13(products: Product[]) {
  const usedCodes = new Set(products.map((product) => getProductEan13Value(product)));

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = createVietnamEan13FromSeed(
      `new-product:${Date.now()}:${Math.random().toString(36).slice(2)}:${attempt}`
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
              Quét mã có sẵn trên bao bì hoặc tạo mã Việt Nam bắt đầu bằng 893 để in tem và dán
              lên sản phẩm.
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
  onAddCategory: (name: string) => Promise<string>;
  onSubmit: (input: ProductInput, imageFile: File | null) => Promise<void>;
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
  onSubmit,
  product,
  submitting,
}: ProductFormProps) {
  const [form, setForm] = useState<ProductFormState>(() => productToForm(product, initialEan13));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [ean13ScannerOpen, setEan13ScannerOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(productToForm(product, initialEan13));
    setImageFile(null);
    setImagePreviewUrl("");
    setCategoryDraft("");
    setCategoryError("");
    setCategorySubmitting(false);
    setEan13ScannerOpen(false);
    setError("");
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
      (category) => category.toLowerCase() === nextCategory.toLowerCase()
    );
    const selectedCategory = existingCategory ?? nextCategory;

    if (existingCategory) {
      updateField("category", selectedCategory);
      closeCategoryModal();
      return;
    }

    setCategorySubmitting(true);
    setCategoryError("");

    try {
      const savedCategory = await onAddCategory(nextCategory);
      updateField("category", savedCategory);
      closeCategoryModal();
    } catch (requestError) {
      setCategoryError(getErrorMessage(requestError, "Không lưu được nhóm hàng."));
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
    const stock = Number(form.stock);
    const rewardPointsCost = Number(form.reward_points_cost);
    const ean13Code = normalizeEan13Input(form.ean13);
    const importDate = normalizeNullableText(form.import_date);
    const expiryDate = normalizeNullableText(form.expiry_date);

    if (!name) {
      setError("Product title is required.");
      return;
    }

    if ([price, costPrice, stock, rewardPointsCost].some((value) => Number.isNaN(value) || value < 0)) {
      setError("Giá bán, giá vốn và số lượng phải là số không âm.");
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
        },
        imageFile
      );
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Không lưu được sản phẩm."));
    }
  }

  const previewUrl = imagePreviewUrl || form.image_url;

  return (
    <>
      <form id={formId} onSubmit={handleSubmit}>
        <section className="space-y-3">
          <h3 className="text-sm font-extrabold text-slate-950">Hình ảnh</h3>
          <button
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-moss-300 hover:bg-moss-50 sm:max-w-sm"
            onClick={() => setMediaOpen(true)}
            type="button"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-950">
              {previewUrl ? (
                <img alt="Product" className="h-full w-full rounded-xl object-cover" src={previewUrl} />
              ) : (
                <ImageIcon className="h-5 w-5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold text-slate-950">Thêm ảnh</span>
              {previewUrl ? (
                <span className="block truncate text-xs font-semibold text-slate-500">
                  Đã chọn hình ảnh
                </span>
              ) : null}
            </span>
            <ChevronRight className="h-5 w-5 text-slate-950" />
          </button>
        </section>

        <label className="block">
          <span className={labelClassName}>Tên sản phẩm</span>
          <input
            className={fieldClassName}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder="Nhập tên sản phẩm"
            required
            value={form.name}
          />
        </label>

        {canSetVisibility ? (
          <section className="space-y-3">
            <h3 className="text-sm font-extrabold text-slate-950">Hiển thị sản phẩm</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`flex h-12 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition ${
                  form.is_active
                    ? "border-moss-500 bg-moss-50 text-moss-700"
                    : "border-slate-200 bg-white text-slate-950 hover:bg-slate-50"
                }`}
                onClick={() => updateField("is_active", true)}
                type="button"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-moss-700 shadow-sm">
                  <Eye className="h-4 w-4" />
                </span>
                Hiển thị
              </button>
              <button
                className={`flex h-12 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition ${
                  !form.is_active
                    ? "border-red-500 bg-red-50 text-red-700"
                    : "border-slate-200 bg-white text-slate-950 hover:bg-slate-50"
                }`}
                onClick={() => updateField("is_active", false)}
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

        <label className="block">
          <span className={labelClassName}>Mô tả</span>
          <textarea
            className={`${fieldClassName} min-h-24 resize-none`}
            onChange={(event) => updateField("description", event.target.value)}
            placeholder="Nhập mô tả ngắn"
            value={form.description}
          />
        </label>

        <section className="space-y-3">
          <h3 className="text-sm font-extrabold text-slate-950">Loại sản phẩm</h3>
          <div className="grid grid-cols-2 gap-2">
            <button className={`h-12 rounded-xl border px-3 text-sm font-bold ${!form.is_reward ? "border-moss-500 bg-moss-50 text-moss-700" : "border-slate-200 bg-white"}`} onClick={() => updateField("is_reward", false)} type="button">Sản phẩm bán</button>
            <button className={`h-12 rounded-xl border px-3 text-sm font-bold ${form.is_reward ? "border-amber-500 bg-amber-50 text-amber-700" : "border-slate-200 bg-white"}`} onClick={() => updateField("is_reward", true)} type="button">Quà đổi điểm</button>
          </div>
          {form.is_reward ? (
            <label className="block">
              <span className={labelClassName}>Điểm cần đổi</span>
              <input className={fieldClassName} inputMode="numeric" onChange={(event) => updateField("reward_points_cost", normalizeIntegerInput(event.target.value))} placeholder="100" type="text" value={formatIntegerInput(form.reward_points_cost)} />
            </label>
          ) : null}
        </section>

        <label className="block">
          <span className={labelClassName}>Nhóm hàng</span>
          <div className="flex gap-2">
            <select
              className={`${fieldClassName} min-w-0 flex-1 appearance-none`}
              onChange={(event) => updateField("category", event.target.value)}
              value={form.category}
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

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelClassName}>Ngày nhập</span>
            <input
              className={fieldClassName}
              onChange={(event) => updateField("import_date", event.target.value)}
              type="date"
              value={form.import_date}
            />
          </label>
          <label className="block">
            <span className={labelClassName}>Ngày hết hạn</span>
            <input
              className={fieldClassName}
              onChange={(event) => updateField("expiry_date", event.target.value)}
              type="date"
              value={form.expiry_date}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelClassName}>Giá vốn</span>
            <input
              className={fieldClassName}
              inputMode="numeric"
              onChange={(event) =>
                updateField("cost_price", normalizeIntegerInput(event.target.value))
              }
              placeholder="0"
              type="text"
              value={formatIntegerInput(form.cost_price)}
            />
          </label>
          <label className="block">
            <span className={labelClassName}>Giá bán</span>
            <input
              className={fieldClassName}
              inputMode="numeric"
              onChange={(event) =>
                updateField("price", normalizeIntegerInput(event.target.value))
              }
              placeholder="0"
              type="text"
              value={formatIntegerInput(form.price)}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelClassName}>Số lượng</span>
            <input
              className={fieldClassName}
              inputMode="numeric"
              onChange={(event) =>
                updateField("stock", normalizeIntegerInput(event.target.value))
              }
              placeholder="0"
              type="text"
              value={formatIntegerInput(form.stock)}
            />
          </label>
          <label className="block">
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
                    updateField("ean13", normalizeEan13Input(event.target.value));
                  }
                }}
                placeholder="Quét hoặc nhập 13 chữ số"
                readOnly={ean13Locked}
                value={form.ean13}
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
        </div>

        {error ? (
          <div className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {submitting ? <span className="sr-only">Đang lưu sản phẩm</span> : null}
      </form>

      <MediaPickerModal
        canUploadImage={canUploadImage}
        currentImageUrl={form.image_url}
        libraryImages={libraryImages}
        onClose={() => setMediaOpen(false)}
        onSave={({ imageFile: nextFile, imageUrl, previewUrl }) => {
          if (imagePreviewUrl.startsWith("blob:")) {
            URL.revokeObjectURL(imagePreviewUrl);
          }

          setImageFile(nextFile);
          setImagePreviewUrl(previewUrl);
          updateField("image_url", imageUrl);
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
          <form className="space-y-3" id="product-category-form" onSubmit={handleAddCategory}>
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
  onAddCategory: (name: string) => Promise<string>;
  onCancel: () => void;
  onDelete: (product: Product) => Promise<void>;
  onSubmit: (input: ProductInput, imageFile: File | null) => Promise<void>;
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
  onCancel,
  onDelete,
  onSubmit,
  open,
  product,
  submitting,
}: ProductEditorModalProps) {
  const formId = product ? `product-form-${product.id}` : "product-form-create";

  return (
    <Modal
      bodyClassName="sm:px-5 sm:py-4"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {product && canDeleteProduct ? (
            <button
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-extrabold text-red-700 ring-1 ring-red-200 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-28"
              disabled={submitting}
              onClick={() => void onDelete(product)}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              Xóa
            </button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button
              className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50 sm:min-w-28"
              onClick={onCancel}
              type="button"
            >
              Hủy
            </button>
            {canSubmit ? (
              <button
                className="min-h-10 rounded-xl bg-moss-700 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-moss-800 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-40"
                disabled={submitting}
                form={formId}
                type="submit"
              >
                {submitting ? "Đang lưu..." : product ? "Lưu sản phẩm" : "Thêm sản phẩm"}
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
        onSubmit={onSubmit}
        product={product}
        submitting={submitting}
      />
    </Modal>
  );
}

type ProductDetailModalProps = {
  batches: ProductBatch[];
  canEditProduct: boolean;
  open: boolean;
  product: Product | null;
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
}: ProductDetailModalProps) {
  if (!product) {
    return null;
  }

  const activeBatches = batches.filter((batch) => batch.quantity > 0);
  const nearestBatch =
    activeBatches.find((batch) => batch.expiry_date) ?? activeBatches[0] ?? null;
  const expiryStatus = getExpiryStatus(nearestBatch?.expiry_date ?? product.expiry_date);
  const batchTotal = activeBatches.reduce((sum, batch) => sum + batch.quantity, 0);
  const detailItems = [
    { label: "EAN-13", value: getProductEan13Value(product) },
    { label: "Nhóm hàng", value: product.category || "Chưa phân nhóm" },
    { label: "Giá vốn", value: formatCurrency(product.cost_price) },
    { label: "Giá bán", value: formatCurrency(product.price) },
    { label: "Tổng tồn", value: String(product.stock) },
    { label: "Trên kệ", value: String(product.shelf_stock) },
    { label: "Trong kho", value: String(product.stock - product.shelf_stock) },
    { label: "Tồn theo lô", value: `${batchTotal} / ${activeBatches.length} lô` },
    { label: "Trạng thái", value: product.is_active ? "Đang hiện" : "Đang ẩn" },
  ];

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
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
            {product.image_url ? (
              <img alt={product.name} className="h-full w-full object-cover" src={product.image_url} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-coal/35">
                <Boxes className="h-8 w-8" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              <Badge className="items-center gap-1" tone={product.is_active ? "green" : "red"}>
                {product.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {product.is_active ? "Đang hiện" : "Đang ẩn"}
              </Badge>
              <Badge tone={getExpiryTone(expiryStatus)}>{getExpiryLabel(expiryStatus)}</Badge>
            </div>
            <h3 className="mt-2 font-display text-xl font-bold text-coal sm:text-2xl">{product.name}</h3>
            <p className="mt-1.5 text-sm leading-5 text-coal/60">
              {product.description || "Chưa có mô tả sản phẩm."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {detailItems.map((item) => (
            <div className="rounded-xl bg-slate-50 px-3 py-2.5" key={item.label}>
              <p className="text-xs font-extrabold uppercase tracking-wide text-coal/45">
                {item.label}
              </p>
              <p className="mt-1 break-words font-bold text-coal">{item.value}</p>
            </div>
          ))}
        </div>

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
                        {batch.quantity} / {batch.shelf_quantity} / {batch.quantity - batch.shelf_quantity}
                      </p>
                      <div className="sm:text-right">
                        <Badge tone={getExpiryTone(status)}>{getExpiryLabel(status)}</Badge>
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
  const [importDate, setImportDate] = useState(() => new Date().toISOString().slice(0, 10));
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
          onChange={(event) => setQuantity(normalizeIntegerInput(event.target.value))}
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
  const [cloudinaryLibraryImages, setCloudinaryLibraryImages] = useState<string[]>([]);
  const [productBatches, setProductBatches] = useState<ProductBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receivingProduct, setReceivingProduct] = useState<Product | null>(null);
  const [savedCategories, setSavedCategories] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submittingReceive, setSubmittingReceive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const {
    clearErrorNotice,
    errorNotice,
    setErrorNotice,
    showErrorNotice,
  } = useErrorNotice(setError);
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
      const [nextProducts, nextCategories, nextBatches, nextCloudinaryResources] = await Promise.all([
        fetchProducts(),
        fetchProductCategories(),
        fetchProductBatches(),
        fetchCloudinaryImageResources().catch(() => []),
      ]);

      setProducts(nextProducts);
      setProductBatches(nextBatches);
      setSavedCategories(nextCategories);
      setCloudinaryLibraryImages(
        nextCloudinaryResources
          .map((resource) => resource.secure_url || resource.url)
          .filter((url): url is string => Boolean(url))
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

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

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
    setSavedCategories((current) => mergeCategoryNames([...current, savedCategory]));
    return savedCategory;
  }

  async function handleSave(input: ProductInput, imageFile: File | null) {
    if ((editingProduct && !canEditProduct) || (!editingProduct && !canCreateProduct)) {
      return;
    }

    if (imageFile && !canUploadCloudinaryImage) {
      throw new Error("Bạn không có quyền tải ảnh lên Cloudinary.");
    }

    setSubmitting(true);
    setError("");

    try {
      const guardedInput =
        canSetProductVisibility
          ? input
          : { ...input, is_active: editingProduct?.is_active ?? true };
      const imageUpload = imageFile ? await uploadProductImageAsset(imageFile) : null;
      const imageUrl = imageUpload ? imageUpload.url : guardedInput.image_url;
      const payload = { ...guardedInput, image_url: imageUrl };

      if (imageUpload) {
        await saveCloudinaryImageAsset(imageUpload);
      }

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
        requestError instanceof Error ? requestError.message : "Lưu sản phẩm thất bại.";
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
        requestError instanceof Error ? requestError.message : "Nhập kho thất bại.";
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
      setViewingProduct((current) => (current?.id === product.id ? null : current));
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
        requestError instanceof Error ? requestError.message : "Xóa sản phẩm thất bại.",
        "Xóa sản phẩm thất bại"
      );
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filteredProducts = products.filter((product) =>
    [product.name, product.sku, product.category, getProductEan13Value(product)]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery))
  );
  const libraryImages = Array.from(
    new Set([
      ...cloudinaryLibraryImages,
      ...products.map((product) => product.image_url).filter(Boolean),
    ])
  ) as string[];
  const categories = mergeCategoryNames([
    ...savedCategories,
    ...products.map((product) => product.category),
  ]);

  function getProductActiveBatches(productId: string) {
    return productBatches.filter((batch) => batch.product_id === productId && batch.quantity > 0);
  }

  function getNearestBatch(productId: string) {
    const batches = getProductActiveBatches(productId);
    return batches.find((batch) => batch.expiry_date) ?? batches[0] ?? null;
  }

  function getProductExpiryStatus(product: Product) {
    const nearestBatch = getNearestBatch(product.id);
    return getExpiryStatus(nearestBatch?.expiry_date ?? product.expiry_date);
  }

  function getProductStockLabel(product: Product) {
    const batches = getProductActiveBatches(product.id);
    return `Tổng ${product.stock} · Kệ ${product.shelf_stock} · Kho ${product.stock - product.shelf_stock}${batches.length > 0 ? ` · ${batches.length} lô` : ""}`;
  }

  function getProductExpiryLabel(product: Product) {
    const nearestBatch = getNearestBatch(product.id);
    if (!nearestBatch) {
      return formatProductDate(product.expiry_date);
    }

    return `${formatProductDate(nearestBatch.expiry_date)} (${nearestBatch.quantity})`;
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

  const expiredCount = products.filter((product) => getProductExpiryStatus(product) === "expired")
    .length;
  const expiringSoonCount = products.filter((product) => getProductExpiryStatus(product) === "soon")
    .length;
  const hiddenCount = products.filter((product) => !product.is_active).length;

  return (
    <div className="w-full max-w-[100vw] px-0 sm:px-2">
      <ConfigNotice />

      <Card className="overflow-hidden p-0">
        <div className="border-b border-coal/10 p-2.5 sm:p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0 space-y-2.5">
              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral">{products.length} mặt hàng</Badge>
                {expiringSoonCount > 0 ? <Badge tone="amber">{expiringSoonCount} gần hết hạn</Badge> : null}
                {expiredCount > 0 ? <Badge tone="red">{expiredCount} hết hạn</Badge> : null}
                {hiddenCount > 0 ? <Badge tone="red">{hiddenCount} đang ẩn</Badge> : null}
              </div>

              <div className="relative w-full lg:max-w-2xl">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-coal/35" />
                <Input
                  className="h-10 rounded-xl py-2 pl-9"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm theo tên, EAN-13, nhóm hàng..."
                  value={query}
                />
              </div>
            </div>
            <div className="grid auto-cols-fr grid-flow-col gap-1.5 sm:flex sm:w-auto sm:gap-2 lg:justify-end">
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
          <div className="max-h-[68dvh] overflow-y-auto overscroll-contain p-1.5 sm:p-3">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {filteredProducts.map((product) => (
                <ProductCard
                  compact
                  expiryClassName={getProductExpiryClassName(product)}
                  expiryLabel={getProductExpiryLabel(product)}
                  key={product.id}
                  onSelect={() => openViewModal(product)}
                  product={product}
                  stockLabel={getProductStockLabel(product)}
                />
              ))}
            </div>
          </div>
        )}
      </Card>

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
        onCancel={closeProductEditor}
        onDelete={handleDelete}
        onSubmit={handleSave}
        open={modalOpen}
        product={editingProduct}
        submitting={submitting}
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
        batches={viewingProduct ? getProductActiveBatches(viewingProduct.id) : []}
        canEditProduct={canEditProduct}
        onClose={() => setViewingProduct(null)}
        onEdit={openEditFromDetail}
        open={Boolean(viewingProduct)}
        product={viewingProduct}
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
