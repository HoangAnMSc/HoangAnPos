import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  Edit3,
  ImagePlus,
  Layers3,
  PackagePlus,
  Search,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";
import { formatCurrency } from "../lib/format";
import { uploadProductImage } from "../lib/cloudinary";
import {
  createProduct,
  deleteProduct,
  fetchProducts,
  updateProduct,
  type ProductInput,
} from "../services/products";
import type { Product } from "../types";

type ProductFormState = {
  name: string;
  sku: string;
  category: string;
  description: string;
  price: string;
  cost_price: string;
  stock: string;
  image_url: string;
  is_active: boolean;
};

const emptyForm: ProductFormState = {
  category: "",
  cost_price: "0",
  description: "",
  image_url: "",
  is_active: true,
  name: "",
  price: "0",
  sku: "",
  stock: "0",
};

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function productToForm(product?: Product | null): ProductFormState {
  if (!product) {
    return emptyForm;
  }

  return {
    category: product.category ?? "",
    cost_price: String(product.cost_price),
    description: product.description ?? "",
    image_url: product.image_url ?? "",
    is_active: product.is_active,
    name: product.name,
    price: String(product.price),
    sku: product.sku ?? "",
    stock: String(product.stock),
  };
}

type MediaPickerSheetProps = {
  currentImageUrl: string;
  libraryImages: string[];
  open: boolean;
  onClose: () => void;
  onSave: (value: { imageUrl: string; imageFile: File | null; previewUrl: string }) => void;
};

function MediaPickerSheet({
  currentImageUrl,
  libraryImages,
  onClose,
  onSave,
  open,
}: MediaPickerSheetProps) {
  const [activeTab, setActiveTab] = useState<"library" | "upload">("library");
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [draftPreview, setDraftPreview] = useState("");
  const [selectedUrl, setSelectedUrl] = useState(currentImageUrl);

  useEffect(() => {
    setSelectedUrl(currentImageUrl);
  }, [currentImageUrl, open]);

  useEffect(() => {
    return () => {
      if (draftPreview.startsWith("blob:")) {
        URL.revokeObjectURL(draftPreview);
      }
    };
  }, [draftPreview]);

  if (!open) {
    return null;
  }

  const selectedCount = activeTab === "upload" && draftFile ? 1 : selectedUrl ? 1 : 0;

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
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 px-4 pb-4 backdrop-blur-sm sm:items-center sm:pb-0">
      <div className="w-full max-w-[390px] overflow-hidden rounded-t-[1.75rem] bg-white shadow-2xl sm:rounded-[1.75rem]">
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-200" />
        <div className="flex items-center justify-between px-5 py-4">
          <h3 className="flex-1 text-center text-sm font-extrabold text-zinc-950">Add Media</h3>
          <button
            aria-label="Đóng chọn ảnh"
            className="rounded-full p-1 text-zinc-950 hover:bg-zinc-100"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-t border-zinc-100 px-5 pb-5 pt-3">
          <div className="mb-4 flex items-center gap-2">
            <button
              className={`rounded-lg border px-3 py-1.5 text-xs font-extrabold transition ${
                activeTab === "library"
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-white text-zinc-950"
              }`}
              onClick={() => setActiveTab("library")}
              type="button"
            >
              Content Library
            </button>
            <button
              className={`rounded-lg border px-3 py-1.5 text-xs font-extrabold transition ${
                activeTab === "upload"
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-white text-zinc-950"
              }`}
              onClick={() => setActiveTab("upload")}
              type="button"
            >
              Upload New
            </button>
          </div>

          <div className="mb-3 flex items-center justify-between text-xs">
            <span className="text-zinc-600">
              Selected <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-bold text-zinc-950">{selectedCount}</span>
            </span>
            <button
              className="font-bold underline"
              onClick={() => {
                setSelectedUrl("");
                setDraftFile(null);
                setDraftPreview("");
              }}
              type="button"
            >
              Unselect all
            </button>
          </div>

          {activeTab === "library" ? (
            libraryImages.length > 0 ? (
              <div className="grid max-h-72 grid-cols-3 gap-3 overflow-y-auto pr-1">
                {libraryImages.map((imageUrl) => {
                  const selected = selectedUrl === imageUrl;

                  return (
                    <button
                      className={`relative aspect-square overflow-hidden rounded-xl border-2 bg-zinc-100 transition ${
                        selected ? "border-blue-500" : "border-transparent hover:border-zinc-300"
                      }`}
                      key={imageUrl}
                      onClick={() => setSelectedUrl(imageUrl)}
                      type="button"
                    >
                      <img alt="Ảnh sản phẩm" className="h-full w-full object-cover" src={imageUrl} />
                      <span
                        className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded border text-[10px] ${
                          selected
                            ? "border-blue-500 bg-blue-500 text-white"
                            : "border-zinc-300 bg-white text-transparent"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl bg-zinc-50 p-5 text-center">
                <ImagePlus className="h-8 w-8 text-zinc-400" />
                <p className="mt-3 text-sm font-bold text-zinc-950">Chưa có ảnh trong thư viện</p>
                <p className="mt-1 text-xs text-zinc-500">Upload ảnh mới để dùng cho sản phẩm.</p>
              </div>
            )
          ) : (
            <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-center transition hover:border-orange-500 hover:bg-orange-50">
              {draftPreview ? (
                <img
                  alt="Ảnh upload"
                  className="mb-4 h-32 w-32 rounded-2xl object-cover"
                  src={draftPreview}
                />
              ) : (
                <span className="mb-4 rounded-2xl bg-white p-4 text-orange-600 shadow-sm">
                  <Upload className="h-7 w-7" />
                </span>
              )}
              <span className="text-sm font-extrabold text-zinc-950">
                {draftFile ? draftFile.name : "Chọn ảnh từ máy"}
              </span>
              <span className="mt-1 text-xs text-zinc-500">Ảnh sẽ upload lên Cloudinary khi lưu sản phẩm.</span>
              <input accept="image/*" className="hidden" onChange={handleUploadChange} type="file" />
            </label>
          )}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              className="rounded-lg border border-zinc-950 bg-white px-4 py-3 text-sm font-extrabold text-zinc-950"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-orange-600 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-orange-600/20 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={selectedCount === 0}
              onClick={handleSave}
              type="button"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type SectionCardProps = {
  actionLabel?: string;
  children: React.ReactNode;
  icon: React.ReactNode;
  subtitle: string;
  title: string;
};

function SectionCard({ actionLabel = "+ Add", children, icon, subtitle, title }: SectionCardProps) {
  return (
    <section className="rounded-[1.5rem] border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            {icon}
          </span>
          <div>
            <h4 className="text-base font-extrabold text-zinc-950">{title}</h4>
            <p className="text-xs text-zinc-500">{subtitle}</p>
          </div>
        </div>
        <span className="text-xs font-extrabold text-orange-600 underline">{actionLabel}</span>
      </div>
      {children}
    </section>
  );
}

type PhoneInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

function PhoneInput({ className = "", label, ...props }: PhoneInputProps) {
  return (
    <label className="block">
      {label ? <span className="mb-2 block text-sm font-extrabold text-zinc-950">{label}</span> : null}
      <input
        className={`w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-100 ${className}`}
        {...props}
      />
    </label>
  );
}

type ProductFormProps = {
  libraryImages: string[];
  product?: Product | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (input: ProductInput, imageFile: File | null) => Promise<void>;
};

function ProductForm({ libraryImages, onCancel, onSubmit, product, submitting }: ProductFormProps) {
  const [form, setForm] = useState<ProductFormState>(() => productToForm(product));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(productToForm(product));
    setImageFile(null);
    setImagePreviewUrl("");
    setError("");
  }, [product]);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const name = form.name.trim();
    const price = Number(form.price);
    const costPrice = Number(form.cost_price);
    const stock = Number(form.stock);

    if (!name) {
      setError("Tên sản phẩm là bắt buộc.");
      return;
    }

    if ([price, costPrice, stock].some((value) => Number.isNaN(value) || value < 0)) {
      setError("Giá và tồn kho phải là số không âm.");
      return;
    }

    await onSubmit(
      {
        category: normalizeText(form.category),
        cost_price: costPrice,
        description: normalizeText(form.description),
        image_url: normalizeText(form.image_url),
        is_active: form.is_active,
        name,
        price,
        sku: normalizeText(form.sku),
        stock: Math.floor(stock),
      },
      imageFile
    );
  }

  const previewUrl = imagePreviewUrl || form.image_url;

  return (
    <>
      <form className="flex h-full min-h-0 flex-col bg-[#f7f2e8] text-zinc-950" onSubmit={handleSubmit}>
        <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-8">
          <div className="mx-auto flex max-w-7xl items-center gap-4">
            <button
              aria-label="Đóng"
              className="rounded-2xl border border-zinc-200 bg-white p-3 text-zinc-950 shadow-sm transition hover:bg-zinc-50"
              onClick={onCancel}
              type="button"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold uppercase tracking-[0.24em] text-orange-600">
                Product Manager
              </p>
              <h2 className="font-display text-2xl font-bold sm:text-3xl">
                {product ? "Sửa sản phẩm" : "Tạo sản phẩm"}
              </h2>
            </div>
            <div className="hidden gap-3 sm:flex">
              <button
                className="rounded-2xl border border-zinc-300 bg-white px-5 py-3 text-sm font-extrabold text-zinc-950 transition hover:bg-zinc-50"
                onClick={onCancel}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-2xl bg-orange-600 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-orange-600/20 transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={submitting}
                type="submit"
              >
                {submitting ? "Saving..." : product ? "Save Product" : "Add Product"}
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
            <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
              <section className="rounded-[1.75rem] border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-extrabold text-zinc-950">Media</p>
                    <p className="text-xs text-zinc-500">Ảnh đại diện sản phẩm</p>
                  </div>
                  <ImagePlus className="h-5 w-5 text-orange-600" />
                </div>

                <div className="overflow-hidden rounded-[1.5rem] border border-zinc-200 bg-zinc-50">
                  {previewUrl ? (
                    <img
                      alt="Ảnh sản phẩm"
                      className="aspect-square w-full object-cover"
                      src={previewUrl}
                    />
                  ) : (
                    <div className="flex aspect-square w-full flex-col items-center justify-center p-8 text-center">
                      <span className="rounded-3xl bg-white p-5 text-orange-600 shadow-sm">
                        <ImagePlus className="h-9 w-9" />
                      </span>
                      <p className="mt-4 text-sm font-extrabold text-zinc-950">Chưa có ảnh</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Chọn từ thư viện hoặc upload ảnh mới.
                      </p>
                    </div>
                  )}
                </div>

                <button
                  className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:border-orange-300 hover:bg-orange-50"
                  onClick={() => setMediaOpen(true)}
                  type="button"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                    <ImagePlus className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold text-zinc-950">Add Media</span>
                    <span className="block truncate text-xs text-zinc-500">
                      {imageFile
                        ? imageFile.name
                        : previewUrl
                          ? "Media selected for this product"
                          : "Add media for this product"}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-zinc-500" />
                </button>
              </section>

              <section className="rounded-[1.75rem] border border-zinc-200 bg-white p-5 shadow-sm">
                <p className="mb-3 text-sm font-extrabold text-zinc-950">Status</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                      form.is_active
                        ? "border-zinc-950 bg-zinc-950 text-white"
                        : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
                    }`}
                    onClick={() => updateField("is_active", true)}
                    type="button"
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                        form.is_active ? "border-blue-500 bg-blue-500" : "border-zinc-300"
                      }`}
                    >
                      {form.is_active ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                    </span>
                    Active
                  </button>
                  <button
                    className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                      !form.is_active
                        ? "border-zinc-950 bg-zinc-950 text-white"
                        : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
                    }`}
                    onClick={() => updateField("is_active", false)}
                    type="button"
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                        !form.is_active ? "border-blue-500 bg-blue-500" : "border-zinc-300"
                      }`}
                    >
                      {!form.is_active ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                    </span>
                    Inactive
                  </button>
                </div>
              </section>
            </aside>

            <section className="space-y-6">
              <section className="rounded-[1.75rem] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-5">
                  <p className="text-sm font-extrabold text-zinc-950">Thông tin sản phẩm</p>
                  <p className="text-xs text-zinc-500">Nội dung hiển thị trên POS và danh sách sản phẩm.</p>
                </div>
                <div className="grid gap-4">
                  <PhoneInput
                    label="Product Title"
                    onChange={(event) => updateField("name", event.target.value)}
                    placeholder="Enter product title"
                    required
                    value={form.name}
                  />
                  <label className="block">
                    <span className="mb-2 block text-sm font-extrabold text-zinc-950">
                      Descriptions
                    </span>
                    <textarea
                      className="min-h-36 w-full resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                      onChange={(event) => updateField("description", event.target.value)}
                      placeholder="Product description"
                      value={form.description}
                    />
                  </label>
                </div>
              </section>

              <div className="grid gap-6 lg:grid-cols-2">
                <SectionCard
                  icon={<Layers3 className="h-5 w-5" />}
                  subtitle={form.category || "Add Category"}
                  title="Category"
                >
                  <PhoneInput
                    onChange={(event) => updateField("category", event.target.value)}
                    placeholder="Nhập nhóm hàng"
                    value={form.category}
                  />
                </SectionCard>

                <SectionCard icon={<DollarSign className="h-5 w-5" />} subtitle="Add Price" title="Price">
                  <div className="grid grid-cols-2 gap-3">
                    <PhoneInput
                      min="0"
                      onChange={(event) => updateField("price", event.target.value)}
                      placeholder="Price"
                      type="number"
                      value={form.price}
                    />
                    <PhoneInput
                      min="0"
                      onChange={(event) => updateField("cost_price", event.target.value)}
                      placeholder="Cost"
                      type="number"
                      value={form.cost_price}
                    />
                  </div>
                </SectionCard>
              </div>

              <SectionCard icon={<Archive className="h-5 w-5" />} subtitle="SKU and stock" title="Inventory">
                <div className="grid gap-3 sm:grid-cols-2">
                  <PhoneInput
                    onChange={(event) => updateField("sku", event.target.value)}
                    placeholder="SKU"
                    value={form.sku}
                  />
                  <PhoneInput
                    min="0"
                    onChange={(event) => updateField("stock", event.target.value)}
                    placeholder="Stock"
                    type="number"
                    value={form.stock}
                  />
                </div>
              </SectionCard>

              {error ? (
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {error}
                </div>
              ) : null}
            </section>
          </div>
        </div>

        <div className="border-t border-zinc-200 bg-white/95 px-4 py-4 backdrop-blur sm:hidden">
          <div className="grid grid-cols-2 gap-2">
            <button
              className="rounded-2xl border border-zinc-950 bg-white px-4 py-3 text-sm font-extrabold text-zinc-950"
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-2xl bg-orange-600 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-orange-600/20 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting ? "Saving..." : product ? "Save Product" : "Add Product"}
            </button>
          </div>
        </div>
      </form>

      <MediaPickerSheet
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
    </>
  );
}

type ProductEditorModalProps = {
  libraryImages: string[];
  open: boolean;
  product?: Product | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (input: ProductInput, imageFile: File | null) => Promise<void>;
};

function ProductEditorModal({
  libraryImages,
  onCancel,
  onSubmit,
  open,
  product,
  submitting,
}: ProductEditorModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 h-screen w-screen overflow-hidden bg-[#f7f2e8]">
      <ProductForm
        libraryImages={libraryImages}
        onCancel={onCancel}
        onSubmit={onSubmit}
        product={product}
        submitting={submitting}
      />
    </div>
  );
}

export function ProductsPage() {
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadProducts() {
    setLoading(true);
    setError("");

    try {
      setProducts(await fetchProducts());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Không tải được danh sách sản phẩm."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  function openCreateModal() {
    setEditingProduct(null);
    setModalOpen(true);
  }

  function openEditModal(product: Product) {
    setEditingProduct(product);
    setModalOpen(true);
  }

  async function handleSave(input: ProductInput, imageFile: File | null) {
    setSubmitting(true);
    setError("");

    try {
      const imageUrl = imageFile ? await uploadProductImage(imageFile) : input.image_url;
      const payload = { ...input, image_url: imageUrl };

      if (editingProduct) {
        await updateProduct(editingProduct.id, payload);
      } else {
        await createProduct(payload);
      }

      setModalOpen(false);
      setEditingProduct(null);
      await loadProducts();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Lưu sản phẩm thất bại."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(product: Product) {
    const confirmed = window.confirm(`Xóa sản phẩm "${product.name}"?`);
    if (!confirmed) {
      return;
    }

    setError("");

    try {
      await deleteProduct(product.id);
      setProducts((current) => current.filter((item) => item.id !== product.id));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Xóa sản phẩm thất bại."
      );
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filteredProducts = products.filter((product) =>
    [product.name, product.sku, product.category]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery))
  );
  const libraryImages = Array.from(
    new Set(products.map((product) => product.image_url).filter(Boolean))
  ) as string[];
  const activeCount = products.filter((product) => product.is_active).length;
  const stockValue = products.reduce(
    (sum, product) => sum + product.stock * product.cost_price,
    0
  );

  return (
    <div className="space-y-6">
      <ConfigNotice />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm font-extrabold uppercase tracking-wide text-coal/45">
            Tổng sản phẩm
          </p>
          <p className="mt-2 font-display text-3xl font-bold">{products.length}</p>
        </Card>
        <Card>
          <p className="text-sm font-extrabold uppercase tracking-wide text-coal/45">
            Đang bán
          </p>
          <p className="mt-2 font-display text-3xl font-bold">{activeCount}</p>
        </Card>
        <Card>
          <p className="text-sm font-extrabold uppercase tracking-wide text-coal/45">
            Giá trị tồn vốn
          </p>
          <p className="mt-2 font-display text-3xl font-bold">{formatCurrency(stockValue)}</p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-coal/35" />
            <Input
              className="pl-11"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tên, SKU, nhóm hàng..."
              value={query}
            />
          </div>
          <Button onClick={openCreateModal}>
            <PackagePlus className="h-4 w-4" />
            Thêm sản phẩm
          </Button>
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <Spinner />
        ) : filteredProducts.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              description="Thêm sản phẩm đầu tiên để POS có dữ liệu bán hàng."
              icon={Boxes}
              title="Chưa có sản phẩm phù hợp"
            />
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-3xl border border-coal/10">
            <div className="hidden grid-cols-[1.4fr_0.9fr_0.8fr_0.7fr_0.6fr] gap-4 bg-coal px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-white/70 lg:grid">
              <span>Sản phẩm</span>
              <span>Nhóm/SKU</span>
              <span>Giá bán</span>
              <span>Tồn</span>
              <span className="text-right">Thao tác</span>
            </div>
            <div className="divide-y divide-coal/10 bg-white/70">
              {filteredProducts.map((product) => (
                <div
                  className="grid gap-4 p-4 lg:grid-cols-[1.4fr_0.9fr_0.8fr_0.7fr_0.6fr] lg:items-center lg:px-5"
                  key={product.id}
                >
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 overflow-hidden rounded-2xl bg-coal/5">
                      {product.image_url ? (
                        <img
                          alt={product.name}
                          className="h-full w-full object-cover"
                          src={product.image_url}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-coal/35">
                          <Boxes className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-bold">{product.name}</p>
                      <p className="mt-1 line-clamp-1 max-w-xs text-xs text-coal/50">
                        {product.description || "Chưa có mô tả"}
                      </p>
                      <Badge className="mt-2" tone={product.is_active ? "green" : "neutral"}>
                        {product.is_active ? "Đang bán" : "Tạm ẩn"}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-sm">
                    <p className="font-bold">{product.category || "Chưa phân nhóm"}</p>
                    <div className="mt-1 flex items-center gap-1 text-coal/50">
                      <Tag className="h-3.5 w-3.5" />
                      <span>{product.sku || "Chưa có SKU"}</span>
                    </div>
                  </div>
                  <p className="font-display text-lg font-bold">{formatCurrency(product.price)}</p>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-moss" />
                    <span className="font-bold">{product.stock}</span>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button className="h-10 w-10 p-0" onClick={() => openEditModal(product)} variant="secondary">
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button className="h-10 w-10 p-0" onClick={() => handleDelete(product)} variant="danger">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <ProductEditorModal
        libraryImages={libraryImages}
        onCancel={() => setModalOpen(false)}
        onSubmit={handleSave}
        open={modalOpen}
        product={editingProduct}
        submitting={submitting}
      />
    </div>
  );
}
