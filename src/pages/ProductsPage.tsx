import { type ChangeEvent, type FormEvent, useCallback, useEffect, useState } from "react";
import {
  Barcode,
  Boxes,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Image as ImageIcon,
  ImagePlus,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
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
import { formatCurrency } from "../lib/format";
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
  name: "",
  price: "0",
  stock: "0",
};

const fieldClassName =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:px-5 sm:py-4 sm:text-base";
const labelClassName = "mb-2 block text-sm font-extrabold text-slate-950";

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

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
    name: product.name,
    price: String(product.price),
    ean13: normalizeEan13Input(product.sku),
    stock: String(product.stock),
  };
}

function getSubmitErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Khong luu duoc san pham.";
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
        message: "Ma EAN-13 phai co dung 13 chu so va dung so kiem tra.",
        title: "EAN-13 khong hop le",
      });
      return;
    }

    if (existingProduct) {
      onError({
        detail: `Ma nay dang gan voi san pham "${existingProduct.name}".`,
        message: `EAN-13 ${ean13Code} da ton tai trong database.`,
        title: "EAN-13 da ton tai",
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
            Huy
          </Button>
        }
        onClose={onClose}
        open={open}
        size="md"
        title="Chon ma EAN-13"
      >
        <div className="space-y-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-extrabold text-slate-950">
              Them san pham moi can co EAN-13 truoc.
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              Quet ma co san tren bao bi, hoac tao ma Viet Nam bat dau bang 893 de in tem va dan
              len san pham.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              className="flex min-h-36 flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
              onClick={() => setScannerOpen(true)}
              type="button"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <Barcode className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-base font-extrabold text-slate-950">
                  Quet EAN-13
                </span>
                <span className="mt-1 block text-sm font-semibold leading-5 text-slate-500">
                  Dung khi san pham da co ma vach tren bao bi.
                </span>
              </span>
            </button>

            <button
              className="flex min-h-36 flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-green-300 hover:bg-green-50"
              onClick={createAutoEan13}
              type="button"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-100 text-green-700">
                <PackagePlus className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-base font-extrabold text-slate-950">
                  Tao ma Viet Nam
                </span>
                <span className="mt-1 block text-sm font-semibold leading-5 text-slate-500">
                  Tao EAN-13 prefix 893 cho san pham chua co ma.
                </span>
              </span>
            </button>
          </div>
        </div>
      </Modal>

      <Ean13ScannerModal
        description="Quet EAN-13 co san tren bao bi. Neu ma chua co trong database, he thong se dung ma nay cho san pham moi."
        onClose={() => setScannerOpen(false)}
        onDetected={acceptEan13}
        open={open && scannerOpen}
        title="Quet EAN-13 san pham moi"
      />
    </>
  );
}

type MediaPickerModalProps = {
  currentImageUrl: string;
  libraryImages: string[];
  open: boolean;
  onClose: () => void;
  onSave: (value: { imageUrl: string; imageFile: File | null; previewUrl: string }) => void;
};

function MediaPickerModal({
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
            className="rounded-2xl bg-green-600 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-green-600/20 transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSave}
            onClick={handleSave}
            type="button"
          >
            Save
          </button>
        </div>
      }
      onClose={onClose}
      open={open}
      size="md"
      title="Add Media"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            className={`rounded-xl border px-4 py-2 text-sm font-extrabold transition ${
              activeTab === "library"
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-950"
            }`}
            onClick={() => setActiveTab("library")}
            type="button"
          >
            Content Library
          </button>
          <button
            className={`rounded-xl border px-4 py-2 text-sm font-extrabold transition ${
              activeTab === "upload"
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-950"
            }`}
            onClick={() => setActiveTab("upload")}
            type="button"
          >
            Upload New
          </button>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Selected <span className="font-extrabold text-slate-950">{selectedCount}</span>
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
            {selectedUrl || draftFile ? "Bo anh" : "Chua chon anh"}
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
                      selected ? "border-blue-500" : "border-transparent hover:border-slate-300"
                    }`}
                    key={imageUrl}
                    onClick={() => setSelectedUrl(imageUrl)}
                    type="button"
                  >
                    <img alt="Product" className="h-full w-full object-cover" src={imageUrl} />
                    <span
                      className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded border text-[10px] ${
                        selected
                          ? "border-blue-500 bg-blue-500 text-white"
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
              <p className="mt-1 text-xs text-slate-500">Upload a new image for this product.</p>
            </div>
          )
        ) : (
          <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center transition hover:border-green-500 hover:bg-green-50">
            {draftPreview ? (
              <img
                alt="Upload preview"
                className="mb-4 h-32 w-32 rounded-2xl object-cover"
                src={draftPreview}
              />
            ) : (
              <span className="mb-4 rounded-2xl bg-white p-4 text-green-600 shadow-sm">
                <Upload className="h-7 w-7" />
              </span>
            )}
            <span className="text-sm font-extrabold text-slate-950">
              {draftFile ? draftFile.name : "Choose image from device"}
            </span>
            <span className="mt-1 text-xs text-slate-500">
              Image uploads to Cloudinary when the product is saved.
            </span>
            <input accept="image/*" className="hidden" onChange={handleUploadChange} type="file" />
          </label>
        )}
      </div>
    </Modal>
  );
}

type ProductFormProps = {
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
    if (categorySubmitting) {
      return;
    }

    const nextCategory = categoryDraft.trim();

    if (!nextCategory) {
      setCategoryError("Nhap ten category.");
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
      setCategoryError(getSubmitErrorMessage(requestError));
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
    const ean13Code = normalizeEan13Input(form.ean13);
    const importDate = normalizeText(form.import_date);
    const expiryDate = normalizeText(form.expiry_date);

    if (!name) {
      setError("Product title is required.");
      return;
    }

    if ([price, costPrice, stock].some((value) => Number.isNaN(value) || value < 0)) {
      setError("Gia ban, gia von va so luong phai la so khong am.");
      return;
    }

    if (importDate && expiryDate && expiryDate < importDate) {
      setError("Ngay het han phai sau hoac bang ngay nhap.");
      return;
    }

    if ((ean13Required || form.ean13.trim()) && !isValidEan13(ean13Code)) {
      setError("Ma EAN-13 phai co dung 13 chu so va dung so kiem tra.");
      return;
    }

    try {
      await onSubmit(
        {
          category: normalizeText(form.category),
          cost_price: costPrice,
          description: normalizeText(form.description),
          expiry_date: expiryDate,
          image_url: normalizeText(form.image_url),
          import_date: importDate,
          is_active: form.is_active,
          name,
          price,
          sku: ean13Code || null,
          stock: Math.floor(stock),
        },
        imageFile
      );
    } catch (requestError) {
      setError(getSubmitErrorMessage(requestError));
    }
  }

  const previewUrl = imagePreviewUrl || form.image_url;

  return (
    <>
      <form id={formId} onSubmit={handleSubmit}>
        <section className="space-y-3">
          <h3 className="text-sm font-extrabold text-slate-950">Media</h3>
          <button
            className="flex w-full items-center gap-4 rounded-2xl bg-white px-4 py-3 text-left transition hover:bg-slate-50 sm:max-w-sm"
            onClick={() => setMediaOpen(true)}
            type="button"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-slate-950">
              {previewUrl ? (
                <img alt="Product" className="h-full w-full rounded-xl object-cover" src={previewUrl} />
              ) : (
                <ImageIcon className="h-5 w-5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-extrabold text-slate-950">Add Media</span>
              {previewUrl ? (
                <span className="block truncate text-xs font-semibold text-slate-500">
                  Media selected
                </span>
              ) : null}
            </span>
            <ChevronRight className="h-5 w-5 text-slate-950" />
          </button>
        </section>

        <label className="block">
          <span className={labelClassName}>Product Title</span>
          <input
            className={fieldClassName}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder="Enter product title"
            required
            value={form.name}
          />
        </label>

        <section className="space-y-3">
          <h3 className="text-sm font-extrabold text-slate-950">Status</h3>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-40">
            <button
              className={`flex h-16 items-center gap-3 rounded-2xl border px-5 text-base font-bold transition ${
                form.is_active
                  ? "border-green-500 bg-green-50 text-green-700"
                  : "border-slate-200 bg-white text-slate-950 hover:bg-slate-50"
              }`}
              onClick={() => updateField("is_active", true)}
              type="button"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-green-700 shadow-sm">
                <Eye className="h-5 w-5" />
              </span>
              Hien thi
            </button>
            <button
              className={`flex h-16 items-center gap-3 rounded-2xl border px-5 text-base font-bold transition ${
                !form.is_active
                  ? "border-red-500 bg-red-50 text-red-700"
                  : "border-slate-200 bg-white text-slate-950 hover:bg-slate-50"
              }`}
              onClick={() => updateField("is_active", false)}
              type="button"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-red-700 shadow-sm">
                <EyeOff className="h-5 w-5" />
              </span>
              An
            </button>
          </div>
        </section>

        <label className="block">
          <span className={labelClassName}>Descriptions</span>
          <textarea
            className={`${fieldClassName} min-h-32 resize-none sm:min-h-36`}
            onChange={(event) => updateField("description", event.target.value)}
            placeholder="Product description"
            value={form.description}
          />
        </label>

        <label className="block">
          <span className={labelClassName}>Category</span>
          <div className="flex gap-2">
            <select
              className={`${fieldClassName} min-w-0 flex-1 appearance-none`}
              onChange={(event) => updateField("category", event.target.value)}
              value={form.category}
            >
              <option value="">Select category</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <button
              className="inline-flex h-[46px] shrink-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-950 transition hover:bg-slate-50 sm:h-[58px] sm:px-5"
              onClick={openCategoryModal}
              type="button"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClassName}>Ngay nhap</span>
            <input
              className={fieldClassName}
              onChange={(event) => updateField("import_date", event.target.value)}
              type="date"
              value={form.import_date}
            />
          </label>
          <label className="block">
            <span className={labelClassName}>Ngay het han</span>
            <input
              className={fieldClassName}
              onChange={(event) => updateField("expiry_date", event.target.value)}
              type="date"
              value={form.expiry_date}
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClassName}>Gia von</span>
            <input
              className={fieldClassName}
              min="0"
              onChange={(event) => updateField("cost_price", event.target.value)}
              placeholder="0"
              type="number"
              value={form.cost_price}
            />
          </label>
          <label className="block">
            <span className={labelClassName}>Gia ban</span>
            <input
              className={fieldClassName}
              min="0"
              onChange={(event) => updateField("price", event.target.value)}
              placeholder="0"
              type="number"
              value={form.price}
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClassName}>Quantity</span>
            <input
              className={fieldClassName}
              min="0"
              onChange={(event) => updateField("stock", event.target.value)}
              placeholder="0"
              type="number"
              value={form.stock}
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
                placeholder="Quet hoac nhap 13 chu so"
                readOnly={ean13Locked}
                value={form.ean13}
              />
              {ean13Locked ? (
                <span className="inline-flex h-[46px] shrink-0 items-center justify-center rounded-2xl bg-green-50 px-4 text-sm font-extrabold text-green-700 sm:h-[58px]">
                  Da chon
                </span>
              ) : (
                <Button
                  aria-label="Quet EAN-13"
                  className="h-[46px] shrink-0 px-4 sm:h-[58px]"
                  onClick={() => setEan13ScannerOpen(true)}
                  variant="secondary"
                >
                  <Barcode className="h-4 w-4" />
                  Quet
                </Button>
              )}
            </div>
          </label>
        </div>

        {error ? (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {submitting ? <span className="sr-only">Saving product</span> : null}
      </form>

      <MediaPickerModal
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
              className="rounded-2xl bg-green-600 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-green-600/20 transition hover:bg-green-700 sm:min-w-32"
              disabled={categorySubmitting}
              onClick={() => void saveCategoryDraft()}
              type="button"
            >
              {categorySubmitting ? "Saving..." : "Add"}
            </button>
          </div>
        }
        onClose={closeCategoryModal}
        open={categoryModalOpen}
        size="sm"
        title="Add Category"
      >
        <form className="space-y-3" id="product-category-form" onSubmit={handleAddCategory}>
          <label className="block">
            <span className={labelClassName}>Category name</span>
            <input
              autoFocus
              className={fieldClassName}
              onChange={(event) => {
                setCategoryDraft(event.target.value);
                setCategoryError("");
              }}
              placeholder="Vi du: Sua bot, Sua tuoi..."
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
      <Ean13ScannerModal
        description="Quet EAN-13 co san tren bao bi san pham. Ma quet duoc se luu vao truong EAN-13 cua san pham."
        onClose={() => setEan13ScannerOpen(false)}
        onDetected={(value) => {
          updateField("ean13", value);
          setError("");
        }}
        open={ean13ScannerOpen}
        title="Quet EAN-13 san pham"
      />
    </>
  );
}

type ProductEditorModalProps = {
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
      bodyClassName="sm:px-8 sm:py-7"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {product ? (
            <button
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 py-3 text-sm font-extrabold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-32"
              disabled={submitting}
              onClick={() => void onDelete(product)}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              Xoa
            </button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button
              className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-extrabold text-slate-950 transition hover:bg-slate-50 sm:min-w-32"
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-2xl bg-green-600 px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-green-600/20 transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-44"
              disabled={submitting}
              form={formId}
              type="submit"
            >
              {submitting ? "Saving..." : product ? "Save Product" : "Add Product"}
            </button>
          </div>
        </div>
      }
      onClose={onCancel}
      open={open}
      size="wide"
      title={product ? "Edit Product" : "Nhap thong tin san pham"}
    >
      <ProductForm
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
  open: boolean;
  product: Product | null;
  onClose: () => void;
  onEdit: (product: Product) => void;
};

function ProductDetailModal({ batches, onClose, onEdit, open, product }: ProductDetailModalProps) {
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
    { label: "Nhom hang", value: product.category || "Chua phan nhom" },
    { label: "Gia von", value: formatCurrency(product.cost_price) },
    { label: "Gia ban", value: formatCurrency(product.price) },
    { label: "Ton kho", value: String(product.stock) },
    { label: "Ton theo lo", value: `${batchTotal} / ${activeBatches.length} lo` },
    { label: "Trang thai", value: product.is_active ? "Dang hien" : "Dang an" },
  ];

  return (
    <Modal
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <button
            className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-extrabold text-slate-950 transition hover:bg-slate-50 sm:min-w-28"
            onClick={onClose}
            type="button"
          >
            Dong
          </button>
          <button
            className="rounded-2xl bg-coal px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-coal/15 transition hover:-translate-y-0.5 sm:min-w-32"
            onClick={() => onEdit(product)}
            type="button"
          >
            Sua
          </button>
        </div>
      }
      onClose={onClose}
      open={open}
      size="lg"
      title="Chi tiet san pham"
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="h-28 w-28 shrink-0 overflow-hidden rounded-3xl bg-slate-100">
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
                {product.is_active ? "Dang hien" : "Dang an"}
              </Badge>
              <Badge tone={getExpiryTone(expiryStatus)}>{getExpiryLabel(expiryStatus)}</Badge>
            </div>
            <h3 className="mt-3 font-display text-2xl font-bold text-coal">{product.name}</h3>
            <p className="mt-2 text-sm leading-6 text-coal/60">
              {product.description || "Chua co mo ta san pham."}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {detailItems.map((item) => (
            <div className="rounded-2xl bg-slate-50 px-4 py-3" key={item.label}>
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
              Ton kho theo date
            </h4>
            <Badge tone="neutral">{activeBatches.length} lo</Badge>
          </div>

          {activeBatches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-500">
              Chua co lo nhap kho nao con hang.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-100">
              <div className="hidden grid-cols-[1fr_1fr_110px_120px] gap-3 bg-slate-50 px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-slate-500 sm:grid">
                <span>Ngay nhap</span>
                <span>Han su dung</span>
                <span className="text-right">Con lai</span>
                <span className="text-right">Trang thai</span>
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
                          Ngay nhap
                        </p>
                        <p className="font-bold text-slate-900">
                          {formatProductDate(batch.import_date)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-extrabold uppercase text-slate-400 sm:hidden">
                          Han su dung
                        </p>
                        <p className="font-bold text-slate-900">
                          {formatProductDate(batch.expiry_date)}
                        </p>
                      </div>
                      <p className="text-left text-xl font-extrabold tabular-nums text-slate-900 sm:text-right">
                        {batch.quantity}
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
    const nextImportDate = normalizeText(importDate);
    const nextExpiryDate = normalizeText(expiryDate);

    if (!productId) {
      setError("Chon san pham can nhap kho.");
      return;
    }

    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
      setError("So luong nhap phai lon hon 0.");
      return;
    }

    if (nextImportDate && nextExpiryDate && nextExpiryDate < nextImportDate) {
      setError("Ngay het han phai sau hoac bang ngay nhap.");
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
      setError(getSubmitErrorMessage(requestError));
    }
  }

  return (
    <Modal
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button onClick={onClose} type="button" variant="secondary">
            Huy
          </Button>
          <Button form={formId} isLoading={submitting} type="submit">
            Nhap kho
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      size="md"
      title="Nhap kho"
    >
      <form className="space-y-5" id={formId} onSubmit={handleSubmit}>
        <label className="block">
          <span className={labelClassName}>San pham</span>
          <select
            className={`${fieldClassName} appearance-none`}
            disabled={Boolean(product)}
            onChange={(event) => setProductId(event.target.value)}
            value={productId}
          >
            <option value="">Chon san pham</option>
            {products.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <Input
          label="So luong nhap"
          min="1"
          onChange={(event) => setQuantity(event.target.value)}
          type="number"
          value={quantity}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Ngay nhap"
            onChange={(event) => setImportDate(event.target.value)}
            type="date"
            value={importDate}
          />
          <Input
            label="Ngay het han"
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
  const [createEan13Open, setCreateEan13Open] = useState(false);
  const [ean13LabelsOpen, setEan13LabelsOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
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

  const showErrorNotice = useCallback((message: string, title = "Thong bao loi", detail?: string) => {
    setError(message);
    setErrorNotice({ detail, message, title });
  }, []);

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
          : "Khong tai duoc danh sach san pham.";
      showErrorNotice(message, "Khong tai duoc du lieu");
    } finally {
      setLoading(false);
    }
  }, [showErrorNotice]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  function openCreateModal() {
    setEditingProduct(null);
    setInitialCreateEan13("");
    setCreateEan13Open(true);
    setModalOpen(false);
  }

  function openEditModal(product: Product) {
    setEditingProduct(product);
    setInitialCreateEan13("");
    setCreateEan13Open(false);
    setModalOpen(true);
  }

  function openCreateForm(ean13: string) {
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
    setViewingProduct(null);
    openEditModal(product);
  }

  function openReceiveModal(product?: Product | null) {
    setReceivingProduct(product ?? null);
    setReceiveModalOpen(true);
  }

  function closeReceiveModal() {
    setReceiveModalOpen(false);
    setReceivingProduct(null);
  }

  async function handleAddCategory(name: string) {
    const savedCategory = await createProductCategory(name);
    setSavedCategories((current) => mergeCategoryNames([...current, savedCategory]));
    return savedCategory;
  }

  async function handleSave(input: ProductInput, imageFile: File | null) {
    setSubmitting(true);
    setError("");

    try {
      const imageUpload = imageFile ? await uploadProductImageAsset(imageFile) : null;
      const imageUrl = imageUpload ? imageUpload.url : input.image_url;
      const payload = { ...input, image_url: imageUrl };

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
        requestError instanceof Error ? requestError.message : "Luu san pham that bai.";
      setError(message);
      setErrorNotice({ message, title: "Luu san pham that bai" });
      throw new Error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReceiveStock(input: ReceiveStockInput) {
    setSubmittingReceive(true);
    setError("");

    try {
      await receiveProductStock(input);
      closeReceiveModal();
      await loadProducts();
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Nhap kho that bai.";
      setError(message);
      setErrorNotice({ message, title: "Nhap kho that bai" });
      throw new Error(message);
    } finally {
      setSubmittingReceive(false);
    }
  }

  async function handleDelete(product: Product) {
    const confirmed = window.confirm(`Xoa san pham "${product.name}"?`);
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
            "San pham co lich su hoa don nen he thong da an khoi danh sach thay vi xoa cung.",
          title: "Da an san pham",
        });
      } else if (result.mode === "hidden") {
        setErrorNotice({
          message:
            "Database chua co cot deleted_at, san pham da duoc chuyen sang trang thai an.",
          title: "Da an san pham",
        });
      }
    } catch (requestError) {
      showErrorNotice(
        requestError instanceof Error ? requestError.message : "Xoa san pham that bai.",
        "Xoa san pham that bai"
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
    return batches.length > 0 ? `${product.stock}/${batches.length} lo` : String(product.stock);
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
    <div className="w-full max-w-[100vw] px-[1vw]">
      <ConfigNotice />

      <Card className="overflow-hidden p-0">
        <div className="border-b border-coal/10 p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="neutral">{products.length} mat hang</Badge>
                {expiringSoonCount > 0 ? <Badge tone="amber">{expiringSoonCount} gan het han</Badge> : null}
                {expiredCount > 0 ? <Badge tone="red">{expiredCount} het han</Badge> : null}
                {hiddenCount > 0 ? <Badge tone="red">{hiddenCount} dang an</Badge> : null}
              </div>
            </div>
            <div className="grid gap-2 sm:flex sm:w-auto">
              <Button
                className="w-full sm:w-auto"
                disabled={products.length === 0}
                onClick={() => openReceiveModal()}
                variant="secondary"
              >
                <PackagePlus className="h-4 w-4" />
                Nhap kho
              </Button>
              <Button
                className="w-full sm:w-auto"
                disabled={products.length === 0}
                onClick={() => setEan13LabelsOpen(true)}
                variant="secondary"
              >
                <Barcode className="h-4 w-4" />
                Tao EAN-13
              </Button>
              <Button className="w-full sm:w-auto" onClick={openCreateModal}>
                <PackagePlus className="h-4 w-4" />
                Them san pham
              </Button>
            </div>
          </div>

          <div className="relative mt-4 w-full xl:max-w-[42vw]">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-coal/35" />
            <Input
              className="pl-11"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tim theo ten, EAN-13, nhom hang..."
              value={query}
            />
          </div>
        </div>

        {error && !modalOpen ? (
          <div className="m-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 sm:m-5">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="p-6">
            <Spinner />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-5">
            <EmptyState
              description="Them san pham dau tien de POS co du lieu ban hang."
              icon={Boxes}
              title="Chua co san pham phu hop"
            />
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3 mt-2">
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
        )}
      </Card>

      <ProductEditorModal
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
      <ProductEan13GateModal
        onClose={() => setCreateEan13Open(false)}
        onError={(notice) => setErrorNotice(notice)}
        onSelect={openCreateForm}
        open={createEan13Open}
        products={products}
      />
      <ProductDetailModal
        batches={viewingProduct ? getProductActiveBatches(viewingProduct.id) : []}
        onClose={() => setViewingProduct(null)}
        onEdit={openEditFromDetail}
        open={Boolean(viewingProduct)}
        product={viewingProduct}
      />
      <ReceiveStockModal
        onClose={closeReceiveModal}
        onSubmit={handleReceiveStock}
        open={receiveModalOpen}
        product={receivingProduct}
        products={products}
        submitting={submittingReceive}
      />
      <Ean13LabelsModal
        onClose={() => setEan13LabelsOpen(false)}
        open={ean13LabelsOpen}
        products={products}
      />
      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </div>
  );
}
