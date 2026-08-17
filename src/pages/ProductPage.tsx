import {
  Barcode,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  LayoutGrid,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Save,
  Settings2,
  Sparkles,
  Tags,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CloudinaryImageField } from "../components/media/CloudinaryImageField";
import { Ean13LabelsModal } from "../components/products/Ean13LabelsModal";
import { Ean13PickerModal } from "../components/products/Ean13PickerModal";
import { Ean13ScannerModal } from "../components/products/Ean13ScannerModal";
import { ConfigurableProductCard } from "../components/products/ConfigurableProductCard";
import { productCardPreviewData } from "../components/products/productCardPreview";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { useActionNotice } from "../contexts/ActionNoticeContext";
import { formatIntegerInput, normalizeIntegerInput } from "../lib/format";
import { getErrorMessage } from "../lib/errors";
import {
  clearLocalDraft,
  readLocalDraft,
  writeLocalDraft,
} from "../lib/localDraft";
import { VariantBuilder } from "../features/products/components/VariantBuilder";
import { SkuMatrix } from "../features/products/components/SkuMatrix";
import {
  archiveProduct,
  deleteAttribute,
  deleteProductType,
  fetchAttributes,
  fetchProducts,
  fetchProductTypeAttributes,
  fetchProductTypes,
  saveAttribute,
  saveProduct,
  saveProductType,
  saveProductTypeAttributes,
  updateProductStatus,
} from "../features/products/services/productEngine";
import type {
  AttributeDataType,
  AttributeInputType,
  Product,
  ProductAttribute,
  ProductEditorInput,
  ProductStatus,
  ProductType,
  ProductTypeAttribute,
  VariantAttribute,
  VariantDisplayType,
  VariantDraft,
} from "../features/products/types";
import {
  countVariantCombinations,
  createSkuPrefix,
  formatVariantValueLabel,
  getVariantLabel,
  mergeGeneratedVariants,
  variantCombinationKey,
} from "../features/products/utils/variants";
import { formatCurrency, formatDateTime } from "../lib/format";
import {
  createVietnamEan13FromSeed,
  isValidEan13,
  normalizeEan13Input,
} from "../lib/productDisplay";
import {
  defaultProductSettings,
  fetchProductSettings,
  saveProductSettings,
  type ProductCardSettings,
  type ProductSettings,
} from "../services/productSettings";

type PageTab = "products" | "types" | "attributes" | "card";

const productSections = [
  ["products", "Sản phẩm", Boxes],
  ["types", "Danh mục sản phẩm", Tags],
  ["attributes", "Thuộc tính sản phẩm", Settings2],
  ["card", "Giao diện card", LayoutGrid],
] as const;

function productArchiveErrorMessage(reason: unknown) {
  const message = getErrorMessage(reason, "Không thể ẩn sản phẩm.");
  if (message.includes("PRODUCT_HAS_STOCK")) {
    return message.replace(/^.*PRODUCT_HAS_STOCK:\s*/, "");
  }
  return message;
}

function productSaveErrorMessage(message: string) {
  for (const tag of ["VARIANT_HAS_STOCK", "STOCK_PERMISSION_DENIED"]) {
    if (message.includes(tag)) {
      return message.replace(new RegExp(`^.*${tag}:\\s*`), "");
    }
  }
  if (message.includes("product_variant_attributes_product_id_code_key")) {
    return "Sản phẩm đang có tùy chọn biến thể bị trùng mã. Hãy đóng bản nháp, mở lại sản phẩm và thử lưu lần nữa.";
  }
  if (message.includes("stock_movements_variant_id_fkey")) {
    return "Không thể thay thế tổ hợp đã có lịch sử kho. Hệ thống sẽ giữ lại mã tổ hợp cũ; hãy mở lại sản phẩm rồi thử lưu lần nữa.";
  }
  return message;
}

function ProductSectionSelect({
  onChange,
  value,
}: {
  onChange: (value: PageTab) => void;
  value: PageTab;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = productSections.find(([key]) => key === value) ?? productSections[0];
  const CurrentIcon = current[2];

  useEffect(() => {
    if (!open) return;
    const closeWhenOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="relative min-w-0 flex-1" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex min-h-12 w-full items-center gap-2 rounded-xl border px-3 text-left text-sm font-extrabold transition ${open ? "border-coal bg-coal text-white shadow-sm" : "border-slate-200 bg-white text-coal hover:border-moss-300"}`}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
        type="button"
      >
        <CurrentIcon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{current[1]}</span>
        <ChevronRight className={`h-4 w-4 shrink-0 transition ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {open ? (
        <div
          className="absolute bottom-[calc(100%+0.5rem)] left-0 z-[70] w-full min-w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_-18px_48px_rgba(15,23,42,0.18)]"
          role="listbox"
        >
          {productSections.map(([key, label, Icon]) => (
            <button
              aria-selected={value === key}
              className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-extrabold transition ${value === key ? "bg-coal text-white" : "text-coal hover:bg-slate-50"}`}
              key={key}
              onClick={() => {
                onChange(key);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
              {value === key ? <CircleCheck className="ml-auto h-4 w-4" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProductSearchPopup({
  children,
  onChange,
  onClose,
  onScan,
  open,
  placeholder,
  title,
  value,
  showInput = true,
}: {
  children?: React.ReactNode;
  onChange: (value: string) => void;
  onClose: () => void;
  onScan?: () => void;
  open: boolean;
  placeholder: string;
  title: string;
  value: string;
  showInput?: boolean;
}) {
  return (
    <Modal
      footer={<Button className="w-full sm:w-auto" onClick={onClose}>Xong</Button>}
      onClose={onClose}
      open={open}
      size="sm"
      title={title}
      zIndex={105}
    >
      {showInput ? <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-10 text-sm outline-none transition focus:border-moss-500 focus:bg-white focus:ring-2 focus:ring-moss-100"
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            value={value}
          />
          {value ? (
            <button
              aria-label="Xóa nội dung tìm kiếm"
              className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
              onClick={() => onChange("")}
              type="button"
            >
              ×
            </button>
          ) : null}
        </label>
        {onScan ? (
          <Button aria-label="Quét EAN-13" className="h-12 min-h-12 shrink-0 px-3" onClick={onScan} title="Quét EAN-13" variant="secondary">
            <Barcode className="h-4 w-4" />
            <span className="hidden sm:inline">Quét</span>
          </Button>
        ) : null}
      </div> : null}
      {children}
    </Modal>
  );
}

function ProductSearchFilter({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {options.map((option) => (
          <button
            aria-pressed={value === option.value}
            className={`h-9 shrink-0 rounded-full px-3 text-xs font-extrabold transition ${value === option.value ? "bg-coal text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function QuickStatusButton({
  active,
  disabled,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
  tone: ProductStatus;
}) {
  const activeClass = tone === "active"
    ? "border-emerald-600 bg-emerald-600 text-white"
    : tone === "draft"
      ? "border-amber-500 bg-amber-500 text-white"
      : "border-slate-700 bg-slate-700 text-white";
  return (
    <button
      aria-pressed={active}
      className={`h-8 rounded-lg border px-2 text-[11px] font-extrabold transition disabled:cursor-wait disabled:opacity-50 ${active ? activeClass : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
type EditorTab = "general" | "specifications" | "variants" | "images" | "seo";
const editorSteps: Array<[EditorTab, string]> = [
  ["general", "Thông tin & ảnh"],
  ["specifications", "Thuộc tính"],
  ["variants", "Tùy chọn"],
  ["images", "Tổ hợp"],
  ["seo", "SEO"],
];
type ProductEditorDraft = {
  form: ProductEditorInput;
  editorTab: EditorTab;
  hasVariants: boolean;
  dirtyDimensions: boolean;
};

function productUsesVariants(product: Product) {
  return (
    product.variant_attributes.length > 0 ||
    product.variants.some(
      (variant) => variant.is_active && variant.value_ids.length > 0,
    )
  );
}

function getSimpleProductVariant(product: Product) {
  return (
    product.variants.find(
      (variant) =>
        variant.is_active &&
        variant.is_default &&
        variant.value_ids.length === 0,
    ) ??
    product.variants.find(
      (variant) => variant.is_active && variant.value_ids.length === 0,
    ) ??
    product.variants.find(
      (variant) => variant.is_default && variant.value_ids.length === 0,
    ) ??
    product.variants.find((variant) => variant.value_ids.length === 0) ??
    product.variants[0]
  );
}

const editorGuides: Record<EditorTab, { title: string; description: string }> = {
  general: {
    title: "Thông tin & hình ảnh",
    description: "Nhập thông tin bán hàng và chọn ảnh dùng trên danh sách, POS.",
  },
  specifications: {
    title: "Thuộc tính",
    description: "Điền thông số của sản phẩm; trường không bắt buộc có thể để trống.",
  },
  variants: {
    title: "Tùy chọn",
    description: "Tạo các nhóm như màu sắc, kích thước và giá trị tương ứng.",
  },
  images: {
    title: "Tổ hợp",
    description: "Tạo SKU rồi nhập mã, giá, tồn kho và ảnh riêng cho từng tổ hợp.",
  },
  seo: {
    title: "SEO",
    description: "Nhập tiêu đề và mô tả dùng khi sản phẩm xuất hiện trên công cụ tìm kiếm.",
  },
};

function ProductEditorGuide({
  onDismiss,
  step,
}: {
  onDismiss: () => void;
  step: EditorTab;
}) {
  const guide = editorGuides[step];
  return (
    <div className="flex gap-3 rounded-2xl border border-moss-200 bg-moss-50 p-3 sm:p-4">
      <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-moss-700" />
      <div className="min-w-0 flex-1">
        <p className="font-extrabold text-moss-900">{guide.title}</p>
        <p className="mt-1 text-sm leading-5 text-moss-800">{guide.description}</p>
        <button
          className="mt-2 text-xs font-extrabold text-moss-800 underline decoration-moss-300 underline-offset-4"
          onClick={onDismiss}
          type="button"
        >
          Đã hiểu
        </button>
      </div>
    </div>
  );
}
const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const inferVariantDisplay = (
  inputType: AttributeInputType,
): ProductTypeAttribute["display_type"] => {
  if (inputType === "color") return "color_circle";
  if (inputType === "image") return "image";
  if (inputType === "image_text") return "image_text";
  if (inputType === "select" || inputType === "multi_select") return "dropdown";
  return "text_button";
};
const variantDisplayInputType = (
  displayType: VariantDisplayType,
): AttributeInputType => {
  if (displayType === "color" || displayType === "color_circle") return "color";
  if (displayType === "image") return "image";
  if (displayType === "image_text" || displayType === "image_text_horizontal")
    return "image_text";
  if (displayType === "dropdown") return "select";
  return "radio";
};
const emptyInput = (ean13: string | null = null): ProductEditorInput => ({
  name: "",
  slug: "",
  description: "",
  status: "draft",
  product_type_id: null,
  category_id: null,
  is_reward: false,
  reward_points_cost: 0,
  seo_title: "",
  seo_description: "",
  specifications: [],
  variant_attributes: [],
  variants: [
    {
      sku: `DEFAULT-${Date.now()}`,
      barcode: ean13,
      base_price: 0,
      compare_at_price: null,
      cost_price: 0,
      stock_quantity: 0,
      shelf_quantity: 0,
      weight: null,
      is_default: true,
      is_active: true,
      value_ids: [],
      image_url: null,
      cloudinary_public_id: null,
    },
  ],
  images: [],
});

export function ProductPage() {
  const { alertAction, confirmAction, showSuccess } = useActionNotice();
  const { canAccess, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const canCreateProduct = canAccess("products.create");
  const canUpdateProduct = canAccess("products.update");
  const canToggleProductStatus = canAccess("products.toggle-active");
  const canDeleteProduct = canAccess("products.delete");
  const canManageProductTypes =
    canAccess("products.types.manage") || canUpdateProduct;
  const canManageProductAttributes =
    canAccess("products.attributes.manage") || canUpdateProduct;
  const canUpdateProductCard =
    canAccess("products.card.update") || canUpdateProduct;
  const [pageTab, setPageTab] = useState<PageTab>("products");
  const [editorTab, setEditorTab] = useState<EditorTab>("general");
  const [products, setProducts] = useState<Product[]>([]);
  const [types, setTypes] = useState<ProductType[]>([]);
  const [attributes, setAttributes] = useState<ProductAttribute[]>([]);
  const [typeAttributes, setTypeAttributes] = useState<ProductTypeAttribute[]>(
    [],
  );
  const [productSettings, setProductSettings] = useState<ProductSettings>(
    defaultProductSettings,
  );
  const [query, setQuery] = useState("");
  const [productTypeFilter, setProductTypeFilter] = useState("all");
  const [productStatusFilter, setProductStatusFilter] = useState<ProductStatus | "all">("all");
  const [productScannerOpen, setProductScannerOpen] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [form, setForm] = useState<ProductEditorInput>(emptyInput());
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [ean13GateOpen, setEan13GateOpen] = useState(false);
  const [ean13LabelsOpen, setEan13LabelsOpen] = useState(false);
  const [defaultEanOpen, setDefaultEanOpen] = useState(false);
  const [hasVariants, setHasVariants] = useState(false);
  const [manualCombinationOpen, setManualCombinationOpen] = useState(false);
  const [manualValueIds, setManualValueIds] = useState<Record<string, string>>(
    {},
  );
  const [dirtyDimensions, setDirtyDimensions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [restoredDraftKey, setRestoredDraftKey] = useState("");
  const draftKey = `product-editor-draft:${user?.id ?? "anonymous"}`;
  const guideKey = `product-editor-guides:${user?.id ?? "anonymous"}`;
  const [guideDismissed, setGuideDismissed] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, t, a, ta, settings] = await Promise.all([
        fetchProducts(),
        fetchProductTypes(),
        fetchAttributes(),
        fetchProductTypeAttributes(),
        fetchProductSettings(),
      ]);
      setProducts(p);
      setTypes(t);
      setAttributes(a);
      setTypeAttributes(ta);
      setProductSettings(settings);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Không tải được dữ liệu.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setEan13LabelsOpen(new URLSearchParams(location.search).get("ean13-labels") === "1");
  }, [location.search]);
  useEffect(() => {
    const saved = readLocalDraft<unknown>(guideKey, false);
    setGuideDismissed(
      saved === true || (Array.isArray(saved) && saved.length > 0),
    );
  }, [guideKey]);
  useEffect(() => {
    const draft = readLocalDraft<ProductEditorDraft | null>(draftKey, null);
    if (draft?.form && editorSteps.some(([key]) => key === draft.editorTab)) {
      setForm(draft.form);
      setEditorTab(draft.editorTab);
      setHasVariants(draft.hasVariants);
      setDirtyDimensions(draft.dirtyDimensions);
    }
    setRestoredDraftKey(draftKey);
  }, [draftKey]);
  useEffect(() => {
    if (restoredDraftKey !== draftKey || !open) return;
    writeLocalDraft(draftKey, {
      form,
      editorTab,
      hasVariants,
      dirtyDimensions,
    } satisfies ProductEditorDraft);
  }, [dirtyDimensions, draftKey, editorTab, form, hasVariants, open, restoredDraftKey]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("vi");
    return products.filter((product) => {
      const searchableText = [
        product.name,
        product.slug,
        product.product_type?.name,
        ...product.variants.flatMap((variant) => [variant.sku, variant.barcode]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("vi");
      const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery);
      const matchesType = productTypeFilter === "all" ||
        (productTypeFilter === "uncategorized"
          ? !product.product_type_id
          : product.product_type_id === productTypeFilter);
      const matchesStatus = productStatusFilter === "all" || product.status === productStatusFilter;
      return matchesQuery && matchesType && matchesStatus;
    });
  }, [productStatusFilter, productTypeFilter, products, query]);
  const productTypeFilters = useMemo(() => {
    const usedTypeIds = new Set(products.map((product) => product.product_type_id).filter(Boolean));
    return types.filter((type) => usedTypeIds.has(type.id));
  }, [products, types]);

  function toggleProductSelection(productId: string) {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function handleProductEanDetected(code: string) {
    setQuery(code);
    setProductTypeFilter("all");
    setProductStatusFilter("all");
    setProductScannerOpen(false);
    setProductSearchOpen(true);
  }

  async function bulkUpdateStatus(status: ProductStatus) {
    if (!selectedProductIds.size || updatingStatusId) return;
    if (!canUpdateProduct && (!canToggleProductStatus || status === "draft")) return;
    const selected = products.filter((product) => selectedProductIds.has(product.id));
    setUpdatingStatusId("bulk");
    try {
      await Promise.all(selected.map((product) => updateProductStatus(product.id, status)));
      const updatedAt = new Date().toISOString();
      setProducts((current) => current.map((product) =>
        selectedProductIds.has(product.id) ? { ...product, status, updated_at: updatedAt } : product,
      ));
      showSuccess(`Đã chuyển ${selected.length} sản phẩm sang ${formatProductStatus(status).toLocaleLowerCase("vi")}.`);
      setSelectedProductIds(new Set());
      setSelectionMode(false);
    } catch (reason) {
      setError(getErrorMessage(reason, "Không thể cập nhật trạng thái sản phẩm."));
      await load();
    } finally {
      setUpdatingStatusId(null);
    }
  }

  function closeEan13Labels() {
    const nextParams = new URLSearchParams(location.search);
    nextParams.delete("ean13-labels");
    void navigate(`${location.pathname}${nextParams.size ? `?${nextParams.toString()}` : ""}`, { replace: true });
  }
  const guideVisible = !guideDismissed;
  function dismissCurrentGuide() {
    setGuideDismissed(true);
    writeLocalDraft(guideKey, true);
  }
  function showAllGuides() {
    setGuideDismissed(false);
    writeLocalDraft(guideKey, false);
  }
  function showProductSaveError(message: string) {
    setError(message);
    void alertAction({
      confirmLabel: "Đã hiểu",
      message,
      title: "Không thể lưu sản phẩm",
      tone: "danger",
    });
  }
  const usedEan13Codes = useMemo(
    () =>
      products.flatMap((product) =>
        product.variants
          .map((variant) => variant.barcode)
          .filter((code): code is string => Boolean(code)),
      ),
    [products],
  );
  function edit(product: Product) {
    if (!canUpdateProduct && !canDeleteProduct) return;
    const usesVariants = productUsesVariants(product);
    const simpleVariant = getSimpleProductVariant(product);
    setViewingProduct(null);
    setForm({
      ...product,
      specifications: product.specifications,
      variant_attributes: product.variant_attributes,
      variants: usesVariants
        ? product.variants
        : simpleVariant
          ? [{ ...simpleVariant, is_default: true, value_ids: [] }]
          : emptyInput().variants,
      images: [...product.images].sort(
        (first, second) => Number(second.is_primary) - Number(first.is_primary),
      ),
    });
    setEditorTab("general");
    setHasVariants(usesVariants);
    setDirtyDimensions(false);
    setOpen(true);
  }
  function createProductWithEan13(ean13: string) {
    if (!canCreateProduct) return;
    const base = emptyInput(ean13);
    const simpleType = types.find((type) => type.code === "general");
    const configured = simpleType
      ? typeAttributes
          .filter(
            (item) =>
              item.product_type_id === simpleType.id &&
              item.role === "specification",
          )
          .sort((a, b) => a.sort_order - b.sort_order)
      : [];
    setForm({
      ...base,
      product_type_id: simpleType?.id ?? null,
      specifications: configured.map((item) => {
        const attribute = attributes.find(
          (value) => value.id === item.attribute_id,
        )!;
        return {
          attribute_id: attribute.id,
          name: attribute.name,
          code: attribute.code,
          data_type: attribute.data_type,
          input_type: attribute.input_type,
          unit: attribute.unit,
          value: "",
          is_required: item.is_required,
          sort_order: item.sort_order,
        };
      }),
    });
    setEditorTab("general");
    setHasVariants(false);
    setDirtyDimensions(false);
    setEan13GateOpen(false);
    setOpen(true);
  }
  async function submit() {
    setError("");
    if (form.id ? !canUpdateProduct : !canCreateProduct) {
      showProductSaveError("Tài khoản không có quyền lưu sản phẩm này.");
      return;
    }
    if (!form.name.trim() || !form.slug.trim()) {
      showProductSaveError("Tên và slug là bắt buộc.");
      return;
    }
    if (hasVariants && !form.variant_attributes.length) {
      showProductSaveError("Hãy thêm ít nhất một loại biến thể trước khi lưu.");
      setEditorTab("variants");
      return;
    }
    if (
      hasVariants &&
      form.variant_attributes.some((attribute) => !attribute.values.length)
    ) {
      showProductSaveError("Mỗi loại biến thể cần có ít nhất một giá trị.");
      setEditorTab("variants");
      return;
    }
    if (dirtyDimensions) {
      showProductSaveError(
        "Cấu hình biến thể vừa thay đổi. Hãy bấm “Tạo tất cả tổ hợp” để đồng bộ SKU trước khi lưu.",
      );
      setEditorTab("images");
      return;
    }
    if (!form.variants.length) {
      showProductSaveError(
        hasVariants
          ? "Hãy tạo tổ hợp SKU trước khi lưu sản phẩm."
          : "Sản phẩm phải có một SKU mặc định.",
      );
      if (hasVariants) setEditorTab("images");
      return;
    }
    let formToSave = form;
    const missingEan13Count = form.variants.filter(
      (variant) => !normalizeEan13Input(variant.barcode),
    ).length;
    if (missingEan13Count > 0) {
      const shouldGenerateEan13 = await confirmAction({
        confirmLabel: "Tạo mã và lưu",
        message: `${missingEan13Count} tổ hợp chưa có EAN-13. Bạn có muốn hệ thống tự tạo mã Việt Nam không trùng cho các tổ hợp này rồi tiếp tục lưu?`,
        title: "Thiếu mã EAN-13",
      });
      if (!shouldGenerateEan13) return;

      const usedCodes = new Set([
        ...usedEan13Codes.map(normalizeEan13Input),
        ...form.variants
          .map((variant) => normalizeEan13Input(variant.barcode))
          .filter(Boolean),
      ]);
      const generatedAt = Date.now();
      let generationFailed = false;
      const variants = form.variants.map((variant, index) => {
        if (normalizeEan13Input(variant.barcode)) return variant;
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const code = createVietnamEan13FromSeed(
            `product-variant:${form.id ?? form.slug}:${variant.id ?? variant.sku}:${generatedAt}:${index}:${attempt}:${Math.random()}`,
          );
          if (!usedCodes.has(code)) {
            usedCodes.add(code);
            return { ...variant, barcode: code };
          }
        }
        generationFailed = true;
        return variant;
      });
      if (generationFailed) {
        showProductSaveError(
          "Không thể tạo đủ mã EAN-13 duy nhất. Vui lòng thử lưu lại.",
        );
        return;
      }
      formToSave = { ...form, variants };
      setForm(formToSave);
    }
    if (
      formToSave.variants.some(
        (variant) =>
          variant.compare_at_price != null &&
          variant.compare_at_price < variant.base_price,
      )
    ) {
      showProductSaveError("Giá so sánh phải lớn hơn hoặc bằng giá bán của SKU.");
      setEditorTab(hasVariants ? "images" : "general");
      return;
    }
    const barcodes = formToSave.variants
      .map((variant) => normalizeEan13Input(variant.barcode ?? ""))
      .filter(Boolean);
    if (barcodes.some((barcode) => !isValidEan13(barcode))) {
      showProductSaveError("Mỗi EAN-13 phải có đúng 13 chữ số và số kiểm tra hợp lệ.");
      setEditorTab(hasVariants ? "images" : "general");
      return;
    }
    if (new Set(barcodes).size !== barcodes.length) {
      showProductSaveError("EAN-13 không được trùng giữa các SKU.");
      setEditorTab(hasVariants ? "images" : "general");
      return;
    }
    setSaving(true);
    try {
      const baseSlug = formToSave.slug.trim();
      let uniqueSlug = baseSlug;
      let suffix = 2;
      while (
        products.some(
          (product) => product.id !== formToSave.id && product.slug === uniqueSlug,
        )
      ) {
        uniqueSlug = `${baseSlug}-${suffix++}`;
      }
      const payload =
        uniqueSlug === formToSave.slug
          ? formToSave
          : { ...formToSave, slug: uniqueSlug };
      if (uniqueSlug !== formToSave.slug) setForm(payload);
      const wasEditing = Boolean(formToSave.id);
      await saveProduct(payload);
      clearLocalDraft(draftKey);
      setOpen(false);
      await load();
      showSuccess(
        wasEditing ? "Đã lưu thay đổi của sản phẩm." : "Đã thêm sản phẩm mới.",
      );
    } catch (reason) {
      const requestMessage = getErrorMessage(
        reason,
        "Không lưu được sản phẩm.",
      );
      showProductSaveError(productSaveErrorMessage(requestMessage));
    } finally {
      setSaving(false);
    }
  }
  async function removeCurrentProduct() {
    if (!canDeleteProduct) {
      setError("Tài khoản không có quyền xóa sản phẩm.");
      return;
    }
    if (!form.id || !await confirmAction({
      confirmLabel: "Xóa sản phẩm",
      message: `Bạn có chắc muốn xóa sản phẩm “${form.name}”?`,
      title: "Xác nhận xóa sản phẩm",
      tone: "danger",
    })) return;
    setSaving(true);
    setError("");
    try {
      await archiveProduct(form.id);
      clearLocalDraft(draftKey);
      setOpen(false);
      await load();
      showSuccess("Đã xóa sản phẩm.");
    } catch (reason) {
      setError(productArchiveErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  }
  function updateVariants(next: VariantDraft[]) {
    setForm((current) => ({ ...current, variants: next }));
  }
  function updatePrimaryVariant(patch: Partial<VariantDraft>) {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, index) =>
        variant.is_default || index === 0 ? { ...variant, ...patch } : variant,
      ),
    }));
  }
  async function createVariantCatalogAttribute(input: {
    code: string;
    displayType: VariantDisplayType;
    name: string;
    unit: string | null;
  }) {
    const saved = await saveAttribute({
      name: input.name,
      code: input.code,
      data_type: "option",
      input_type: variantDisplayInputType(input.displayType),
      unit: input.unit,
      is_active: true,
    });
    setAttributes((current) =>
      [...current.filter((attribute) => attribute.id !== saved.id), saved].sort(
        (first, second) => first.name.localeCompare(second.name, "vi"),
      ),
    );
    return saved;
  }
  async function generate() {
    const count = countVariantCombinations(form.variant_attributes);
    if (
      dirtyDimensions &&
      form.variants.some((variant) => variant.id) &&
      !await confirmAction({
        confirmLabel: "Tạo lại tổ hợp",
        message: `Việc tạo lại ${count} tổ hợp có thể thay thế SKU hiện tại. Snapshot đơn hàng vẫn được giữ.`,
        title: "Tạo lại ma trận SKU",
      })
    )
      return;
    setForm((current) => {
      const generated = mergeGeneratedVariants(
        current.variant_attributes,
        current.variants,
        createSkuPrefix(current.slug),
      );
      const initialBarcode =
        current.variants.length === 1 && current.variants[0].is_default
          ? current.variants[0].barcode
          : null;
      if (initialBarcode && generated[0] && !generated[0].barcode) {
        generated[0] = { ...generated[0], barcode: initialBarcode };
      }
      return { ...current, variants: generated };
    });
    setDirtyDimensions(false);
    setError("");
  }
  function addManualCombination() {
    setManualValueIds(
      Object.fromEntries(
        form.variant_attributes.map((attribute) => [
          attribute.id,
          attribute.values.find((value) => value.is_active)?.id ?? "",
        ]),
      ),
    );
    setManualCombinationOpen(true);
  }
  function confirmManualCombination() {
    const valueIds = form.variant_attributes.map(
      (attribute) => manualValueIds[attribute.id],
    );
    if (valueIds.some((id) => !id)) {
      setError("Hãy chọn một giá trị cho mỗi loại biến thể.");
      return;
    }
    if (
      form.variants.some(
        (variant) =>
          variantCombinationKey(variant.value_ids) ===
          variantCombinationKey(valueIds),
      )
    ) {
      setError("Tổ hợp này đã tồn tại.");
      return;
    }
    setForm((current) => ({
      ...current,
      variants: [
        ...current.variants.filter((variant) => variant.value_ids.length > 0),
        {
          sku: `${createSkuPrefix(current.slug)}-${String(current.variants.length + 1).padStart(3, "0")}`,
          barcode: null,
          base_price: 0,
          compare_at_price: null,
          cost_price: 0,
          stock_quantity: 0,
          shelf_quantity: 0,
          weight: null,
          is_default: false,
          is_active: true,
          value_ids: valueIds,
          image_url: null,
          cloudinary_public_id: null,
        },
      ],
    }));
    setManualCombinationOpen(false);
    setError("");
  }
  async function applyProductType(productTypeId: string) {
    if (
      form.product_type_id &&
      form.product_type_id !== productTypeId &&
      form.variant_attributes.length > 0 &&
      !await confirmAction({
        confirmLabel: "Đổi loại sản phẩm",
        message: "Cấu hình thông số và biến thể mặc định sẽ được nạp lại. SKU chỉ thay đổi khi bạn xác nhận tạo lại ma trận.",
        title: "Đổi loại sản phẩm",
      })
    )
      return;
    const configured = typeAttributes
      .filter((item) => item.product_type_id === productTypeId)
      .sort((a, b) => a.sort_order - b.sort_order);
    setForm((current) => ({
      ...current,
      product_type_id: productTypeId || null,
      specifications: configured
        .filter((item) => item.role === "specification")
        .map((item) => {
          const attribute = attributes.find(
            (value) => value.id === item.attribute_id,
          )!;
          return {
            attribute_id: attribute.id,
            name: attribute.name,
            code: attribute.code,
            data_type: attribute.data_type,
            input_type: attribute.input_type,
            unit: attribute.unit,
            value: "",
            is_required: item.is_required,
            sort_order: item.sort_order,
          };
        }),
      variant_attributes: (hasVariants ? configured : [])
        .filter((item) => item.role === "variant")
        .map((item) => {
          const attribute = attributes.find(
            (value) => value.id === item.attribute_id,
          )!;
          return {
            id: crypto.randomUUID(),
            product_id: current.id ?? "",
            source_attribute_id: attribute.id,
            name: attribute.name,
            code: attribute.code,
            data_type: "option" as const,
            unit: attribute.unit,
            display_type: item.display_type ?? "text_button",
            is_required: item.is_required,
            sort_order: item.sort_order,
            values: [],
          };
        }),
    }));
    setDirtyDimensions(
      hasVariants &&
        (form.variant_attributes.length > 0 ||
          configured.some((item) => item.role === "variant")),
    );
  }
  async function setVariantMode(next: boolean) {
    if (
      !next &&
      (form.variant_attributes.length > 0 || form.variants.length > 1) &&
      !await confirmAction({
        confirmLabel: "Tắt biến thể",
        message: "Hệ thống sẽ giữ lại một SKU mặc định và bỏ ma trận biến thể hiện tại.",
        title: "Xác nhận tắt biến thể",
        tone: "danger",
      })
    )
      return;
    setHasVariants(next);
    if (next) {
      setForm((current) => ({
        ...current,
        variants: current.variants.filter((item) => item.value_ids.length > 0),
      }));
      const configured = typeAttributes
        .filter(
          (item) =>
            item.product_type_id === form.product_type_id &&
            item.role === "variant",
        )
        .sort((a, b) => a.sort_order - b.sort_order);
      if (!form.variant_attributes.length && configured.length) {
        setForm((current) => ({
          ...current,
          variant_attributes: configured.map((item) => {
            const attribute = attributes.find(
              (value) => value.id === item.attribute_id,
            )!;
            return {
              id: crypto.randomUUID(),
              product_id: current.id ?? "",
              source_attribute_id: attribute.id,
              name: attribute.name,
              code: attribute.code,
              data_type: "option" as const,
              unit: attribute.unit,
              display_type: item.display_type ?? "text_button",
              is_required: item.is_required,
              sort_order: item.sort_order,
              values: [],
            };
          }),
        }));
        setDirtyDimensions(true);
      }
      return;
    }
    setForm((current) => {
      const retained =
        current.variants.find((item) => item.is_default) ??
        current.variants[0] ??
        emptyInput().variants[0];
      return {
        ...current,
        variant_attributes: [],
        variants: [{ ...retained, is_default: true, value_ids: [] }],
      };
    });
    setDirtyDimensions(false);
  }
  const editorStepIndex = editorSteps.findIndex(([key]) => key === editorTab);
  return (
    <div className={`mx-auto max-w-[1500px] space-y-4 px-3 sm:px-6 lg:px-8 ${selectionMode && selectedProductIds.size ? "pb-44" : "pb-28"}`}>
      {error ? (
        <div className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
          <button className="float-right" onClick={() => setError("")}>
            ×
          </button>
        </div>
      ) : null}
      {pageTab === "products" ? (
        <>
          <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-12px_32px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:left-72">
            <div className="mx-auto flex max-w-4xl items-center gap-2">
            <ProductSectionSelect onChange={setPageTab} value={pageTab} />
            {(canUpdateProduct || canToggleProductStatus) ? (
              <Button
                aria-pressed={selectionMode}
                className="h-12 min-h-12 shrink-0 px-3 sm:min-w-[88px]"
                onClick={() => {
                  setSelectionMode((current) => !current);
                  setSelectedProductIds(new Set());
                }}
                variant={selectionMode ? "primary" : "secondary"}
              >
                <CircleCheck className="h-4 w-4" />
                <span>{selectionMode ? "Hủy" : "Chọn"}</span>
              </Button>
            ) : null}
            <Button aria-label="Lọc sản phẩm" className="relative h-12 min-h-12 w-12 shrink-0 px-0" onClick={() => setProductSearchOpen(true)} title="Lọc sản phẩm" variant="secondary">
              <Search className="h-4 w-4" />
              {query || productTypeFilter !== "all" || productStatusFilter !== "all" ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-moss-600" /> : null}
            </Button>
            {canCreateProduct ? <Button aria-label="Thêm sản phẩm" className="h-12 min-h-12 w-12 shrink-0 px-0" onClick={() => setEan13GateOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button> : null}
            </div>
          </div>
          {loading ? (
            <Card className="grid min-h-48 place-items-center">
              <Spinner label="Đang tải sản phẩm..." />
            </Card>
          ) : (
            <>
              <Card className="hidden overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="p-4">Sản phẩm</th>
                        <th>Loại</th>
                        <th>SKU</th>
                        <th>Giá từ</th>
                        <th>Tồn kho</th>
                        <th>Trạng thái</th>
                        <th className="pr-4 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, 0).map((product) => {
                        const active = product.variants.filter(
                          (variant) => variant.is_active,
                        );
                        const price = active.length
                          ? Math.min(
                              ...active.map((variant) => variant.base_price),
                            )
                          : 0;
                        const stock = active.reduce(
                          (sum, variant) => sum + variant.stock_quantity,
                          0,
                        );
                        return (
                          <tr
                            className="border-t border-slate-100 hover:bg-slate-50/70"
                            key={product.id}
                          >
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                {product.images[0]?.image_url ? (
                                  <img
                                    alt=""
                                    className="h-11 w-11 rounded-lg object-cover"
                                    src={product.images[0].image_url}
                                  />
                                ) : (
                                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-slate-100 text-slate-400">
                                    <Boxes className="h-5 w-5" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="max-w-[280px] truncate font-extrabold">
                                    {product.name}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    /{product.slug}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td>
                              {product.product_type?.name ?? "Chưa phân loại"}
                            </td>
                            <td>{active.length}</td>
                            <td className="font-bold text-moss-700">
                              {formatCurrency(price)}
                            </td>
                            <td>
                              <span
                                className={
                                  stock > 0
                                    ? "font-bold text-emerald-700"
                                    : "font-bold text-red-600"
                                }
                              >
                                {stock}
                              </span>
                            </td>
                            <td>
                              <StatusPill
                                active={product.status === "active"}
                                label={
                                  product.status === "active"
                                    ? "Đang bán"
                                    : product.status
                                }
                              />
                            </td>
                            <td className="pr-4">
                              <div className="flex justify-end gap-2">
                                <Button
                                  className="min-h-9 px-3 py-1.5"
                                  onClick={() => edit(product)}
                                  variant="secondary"
                                >
                                  <Pencil className="h-4 w-4" /> Sửa
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
              <div className="grid grid-cols-2 justify-start gap-2 sm:[grid-template-columns:repeat(auto-fill,minmax(168px,184px))] sm:gap-3">
                {filtered.map((product) => (
                  <ProductAdminCard
                    key={product.id}
                    onView={() => selectionMode ? toggleProductSelection(product.id) : setViewingProduct(product)}
                    product={product}
                    selected={selectedProductIds.has(product.id)}
                    settings={productSettings.card}
                  />
                ))}
              </div>
              {selectionMode && selectedProductIds.size ? (
                <div className="pointer-events-none fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 px-3 lg:left-72">
                  <div className="pointer-events-auto mx-auto flex max-w-4xl items-center gap-1.5 rounded-2xl border border-white/10 bg-coal p-2 shadow-[0_16px_40px_rgba(15,23,42,0.28)] sm:gap-2 sm:p-2.5">
                    <div className="mr-auto flex min-w-0 items-center gap-2 pl-1.5 pr-1 text-white">
                      <CircleCheck className="h-4 w-4 shrink-0 text-moss-200" />
                      <p className="truncate text-xs font-extrabold sm:text-sm">
                        <strong className="text-white">{selectedProductIds.size}</strong> sản phẩm
                      </p>
                    </div>
                    <QuickStatusButton active={false} disabled={Boolean(updatingStatusId)} label="Bán" onClick={() => void bulkUpdateStatus("active")} tone="active" />
                    {canUpdateProduct ? <QuickStatusButton active={false} disabled={Boolean(updatingStatusId)} label="Nháp" onClick={() => void bulkUpdateStatus("draft")} tone="draft" /> : null}
                    <QuickStatusButton active={false} disabled={Boolean(updatingStatusId)} label="Ẩn" onClick={() => void bulkUpdateStatus("inactive")} tone="inactive" />
                  </div>
                </div>
              ) : null}
              <div className="!hidden grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.slice(0, 0).map((product) => {
                  const active = product.variants.filter(
                    (variant) => variant.is_active,
                  );
                  const price = active.length
                    ? Math.min(...active.map((variant) => variant.base_price))
                    : 0;
                  const stock = active.reduce(
                    (sum, variant) => sum + variant.stock_quantity,
                    0,
                  );
                  return (
                    <Card className="p-4" key={product.id}>
                      <div className="flex gap-3">
                        {product.images[0]?.image_url ? (
                          <img
                            alt=""
                            className="h-20 w-20 rounded-xl object-cover"
                            src={product.images[0].image_url}
                          />
                        ) : (
                          <div className="h-20 w-20 rounded-xl bg-slate-100" />
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-extrabold">
                            {product.name}
                          </h3>
                          <p className="text-xs text-slate-500">
                            {product.product_type?.name ?? "Chưa có loại"} ·{" "}
                            {active.length} SKU
                          </p>
                          <p className="mt-2 font-black text-moss-700">
                            {formatCurrency(price)}
                          </p>
                          <p className="text-xs">Tồn: {stock}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
                        <StatusPill
                          active={product.status === "active"}
                          label={
                            product.status === "active"
                              ? "Đang bán"
                              : product.status
                          }
                        />
                        <Button
                          className="ml-auto flex-1"
                          onClick={() => edit(product)}
                          variant="secondary"
                        >
                          Sửa
                        </Button>
                        <Button
                          onClick={async () => {
                            if (await confirmAction({
                              confirmLabel: "Ẩn sản phẩm",
                              message: `Bạn có chắc muốn ẩn “${product.name}”?`,
                              title: "Xác nhận ẩn sản phẩm",
                              tone: "danger",
                            })) {
                              try {
                                await archiveProduct(product.id);
                                await load();
                                showSuccess("Đã ẩn sản phẩm.");
                              } catch (reason) {
                                setError(productArchiveErrorMessage(reason));
                              }
                            }
                          }}
                          variant="danger"
                        >
                          Ẩn
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
              {!filtered.length ? (
                <ProductListEmptyState label="Không tìm thấy sản phẩm phù hợp." />
              ) : null}
            </>
          )}
        </>
      ) : null}
      {pageTab === "types" ? (
        <DefinitionManager
          attributes={attributes}
          currentSection={pageTab}
          kind="type"
          mappings={typeAttributes}
          onSectionChange={setPageTab}
          records={types}
          onSaved={load}
          canDelete={canManageProductTypes}
          canManage={canManageProductTypes}
        />
      ) : null}
      {pageTab === "attributes" ? (
        <DefinitionManager
          currentSection={pageTab}
          kind="attribute"
          onSectionChange={setPageTab}
          records={attributes}
          onSaved={load}
          canDelete={canManageProductAttributes}
          canManage={canManageProductAttributes}
        />
      ) : null}
      {pageTab === "card" ? (
        canUpdateProductCard ? <CardAppearanceEditor
            currentSection={pageTab}
            onChange={setProductSettings}
            onSectionChange={setPageTab}
            settings={productSettings}
          /> : <>
            <Card className="grid min-h-48 place-items-center p-6 text-center text-sm font-semibold text-slate-500">
              Tài khoản chỉ có quyền xem sản phẩm, không có quyền sửa giao diện card.
            </Card>
            <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2.5 lg:left-72">
              <div className="mx-auto flex max-w-4xl"><ProductSectionSelect onChange={setPageTab} value={pageTab} /></div>
            </div>
          </>
      ) : null}
      <ProductDetailModal
        canEdit={canUpdateProduct || canDeleteProduct}
        onClose={() => setViewingProduct(null)}
        onEdit={edit}
        product={viewingProduct}
      />
      <ProductSearchPopup
        onChange={setQuery}
        onClose={() => setProductSearchOpen(false)}
        onScan={() => {
          setProductSearchOpen(false);
          setProductScannerOpen(true);
        }}
        open={productSearchOpen}
        placeholder="Tên, SKU hoặc EAN-13..."
        title="Tìm sản phẩm"
        value={query}
      >
        <div className="mt-4 space-y-4">
          <ProductSearchFilter
            label="Danh mục"
            onChange={setProductTypeFilter}
            options={[
              { label: "Tất cả", value: "all" },
              ...productTypeFilters.map((type) => ({ label: type.name, value: type.id })),
              ...(products.some((product) => !product.product_type_id)
                ? [{ label: "Chưa phân loại", value: "uncategorized" }]
                : []),
            ]}
            value={productTypeFilter}
          />
          <ProductSearchFilter
            label="Trạng thái"
            onChange={(value) => setProductStatusFilter(value as ProductStatus | "all")}
            options={[
              { label: "Tất cả", value: "all" },
              { label: "Đang bán", value: "active" },
              { label: "Bản nháp", value: "draft" },
              { label: "Đã ẩn", value: "inactive" },
            ]}
            value={productStatusFilter}
          />
          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <p className="text-xs font-bold text-slate-500">
              <strong className="text-slate-950">{filtered.length}</strong> sản phẩm phù hợp
            </p>
            {query || productTypeFilter !== "all" || productStatusFilter !== "all" ? (
              <button
                className="text-xs font-extrabold text-moss-700 hover:text-moss-900"
                onClick={() => {
                  setQuery("");
                  setProductTypeFilter("all");
                  setProductStatusFilter("all");
                }}
                type="button"
              >
                Xóa bộ lọc
              </button>
            ) : null}
          </div>
        </div>
      </ProductSearchPopup>
      <Modal
        footer={
          <div className={`grid w-full gap-2 sm:flex sm:w-auto sm:items-center ${form.id ? "grid-cols-4" : "grid-cols-3"}`}>
            {form.id && canDeleteProduct ? (
              <Button
                aria-label="Xóa sản phẩm"
                className="px-2 sm:px-4"
                disabled={saving}
                onClick={() => void removeCurrentProduct()}
                variant="danger"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Xóa</span>
              </Button>
            ) : null}
            <Button
              className="px-2 sm:hidden"
              onClick={() =>
                editorStepIndex > 0
                  ? setEditorTab(editorSteps[editorStepIndex - 1][0])
                  : setOpen(false)
              }
              variant="secondary"
            >
              {editorStepIndex > 0 ? (
                <>
                  <ChevronLeft className="h-4 w-4" /> Lại
                </>
              ) : (
                "Hủy"
              )}
            </Button>
            <Button
              className="hidden sm:inline-flex"
              onClick={() => setOpen(false)}
              variant="secondary"
            >
              Hủy
            </Button>
            {editorStepIndex > 0 ? (
              <Button
                className="hidden sm:inline-flex"
                onClick={() =>
                  setEditorTab(editorSteps[editorStepIndex - 1][0])
                }
                variant="secondary"
              >
                <ChevronLeft className="h-4 w-4" /> Quay lại
              </Button>
            ) : null}
            {editorStepIndex < editorSteps.length - 1 ? (
              <Button
                className="px-2 sm:px-4"
                onClick={() =>
                  setEditorTab(editorSteps[editorStepIndex + 1][0])
                }
                variant="secondary"
              >
                Tiếp <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <span className="sm:hidden" />
            )}
            {(form.id ? canUpdateProduct : canCreateProduct) ? <Button
              className="px-2 sm:px-4"
              disabled={saving}
              onClick={() => void submit()}
            >
              {saving ? "Đang lưu..." : "Lưu"}
            </Button> : null}
          </div>
        }
        headerAction={
          <button
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-extrabold text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
            onClick={showAllGuides}
            type="button"
          >
            <CircleHelp className="h-3.5 w-3.5" />
            <span>Xem hướng dẫn</span>
          </button>
        }
        onClose={() => setOpen(false)}
        open={open}
        size="wide"
        title={form.id ? "Sửa sản phẩm" : "Thêm sản phẩm"}
      >
        <div className="mb-5 md:hidden">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wide text-moss-700">
              Bước {editorStepIndex + 1}/{editorSteps.length}
            </span>
            <span className="text-sm font-extrabold">
              {editorSteps[editorStepIndex][1]}
            </span>
          </div>
          <div className="flex gap-1">
            {editorSteps.map(([key], index) => (
              <button
                aria-label={`Bước ${index + 1}`}
                className={`h-2 flex-1 rounded-full transition ${index <= editorStepIndex ? "bg-moss-600" : "bg-slate-200"}`}
                key={key}
                onClick={() => setEditorTab(key)}
                type="button"
              />
            ))}
          </div>
        </div>
        <div className="scrollbar-none -mx-1 mb-6 hidden overflow-x-auto px-1 pb-1 md:flex">
          {editorSteps.map(([key, label], index) => (
            <button
              className={`group flex min-w-[132px] flex-1 items-center gap-2 border-b-2 px-2 py-3 text-left text-sm font-bold transition ${
                editorTab === key
                  ? "border-moss-600 text-moss-700"
                  : "border-slate-200 text-slate-500 hover:text-coal"
              }`}
              key={key}
              onClick={() => setEditorTab(key)}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs ${editorTab === key ? "bg-moss-600 text-white" : "bg-slate-100 text-slate-500"}`}
              >
                {index + 1}
              </span>
              <span>{label}</span>
            </button>
          ))}
        </div>
        {editorTab === "general" ? (
          <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-5 lg:space-y-0">
            {guideVisible ? (
              <div className="lg:col-span-2">
                <ProductEditorGuide onDismiss={dismissCurrentGuide} step="general" />
              </div>
            ) : null}

            <section className="flex flex-col rounded-2xl border border-slate-200 p-3 sm:p-4 lg:col-span-2">
              <div className="order-1 mb-4">
                <h3 className="font-black">Thông tin sản phẩm</h3>
              </div>
              <div className="order-3 mt-5 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
                <Select
                  label="Danh mục sản phẩm *"
                  onChange={(event) => applyProductType(event.target.value)}
                  value={form.product_type_id ?? ""}
                >
                  <option value="">Chọn danh mục sản phẩm</option>
                  {types
                    .filter((type) => type.is_active)
                    .map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                </Select>
                <Input
                  label="Tên sản phẩm *"
                  onChange={(event) =>
                    setForm((current) => {
                      const nextSlug = current.id
                        ? current.slug
                        : slugify(event.target.value);
                      return {
                        ...current,
                        name: event.target.value,
                        slug: nextSlug,
                        variants: current.variants.map((variant, index) =>
                          !current.id &&
                          index === 0 &&
                          variant.sku.startsWith("DEFAULT-")
                            ? {
                                ...variant,
                                sku: `${createSkuPrefix(nextSlug)}-001`,
                              }
                            : variant,
                        ),
                      };
                    })
                  }
                  placeholder="Ví dụ: Áo sơ mi Summer"
                  value={form.name}
                />
                <Select
                  label="Trạng thái"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as ProductStatus,
                    }))
                  }
                  value={form.status}
                >
                  <option value="draft">Lưu nháp</option>
                  <option value="active">Đăng bán ngay</option>
                  <option value="inactive">Tạm ẩn</option>
                </Select>
              </div>

              <div className="order-2 space-y-4">
                <div>
                  <p className="mb-2 text-sm font-extrabold text-slate-800">
                    Ảnh đại diện
                  </p>
                  <CloudinaryImageField
                    appearance="row"
                    imageUrl={form.images[0]?.image_url}
                    label=""
                    onChange={(selected) =>
                      setForm((current) => ({
                        ...current,
                        images: selected.imageUrl
                          ? [
                              {
                                ...(current.images[0] ?? {
                                  alt_text: current.name,
                                  sort_order: 0,
                                  variant_id: null,
                                  variant_value_id: null,
                                }),
                                image_url: selected.imageUrl,
                                cloudinary_public_id: selected.publicId,
                                is_primary: true,
                              },
                              ...current.images.slice(1),
                            ]
                          : current.images.slice(1).map((image, index) => ({
                              ...image,
                              is_primary: index === 0,
                              sort_order: index,
                            })),
                      }))
                    }
                    publicId={form.images[0]?.cloudinary_public_id}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <p className="text-sm font-extrabold text-slate-800">
                    Ảnh bổ sung
                  </p>
                  <Button
                    className="shrink-0"
                    onClick={() =>
                      setForm((current) => {
                        const primary = current.images.length
                          ? current.images
                          : [
                              {
                                image_url: "",
                                cloudinary_public_id: null,
                                alt_text: current.name,
                                sort_order: 0,
                                is_primary: true,
                                variant_id: null,
                                variant_value_id: null,
                              },
                            ];
                        return {
                          ...current,
                          images: [
                            ...primary,
                            {
                              image_url: "",
                              cloudinary_public_id: null,
                              alt_text: current.name,
                              sort_order: primary.length,
                              is_primary: false,
                              variant_id: null,
                              variant_value_id: null,
                            },
                          ],
                        };
                      })
                    }
                    variant="secondary"
                  >
                    <Plus className="h-4 w-4" /> Thêm ảnh
                  </Button>
                </div>
                {form.images.slice(1).map((image, additionalIndex) => {
                  const index = additionalIndex + 1;
                  return (
                    <CloudinaryImageField
                      appearance="row"
                      imageUrl={image.image_url}
                      key={image.id ?? `additional-${index}`}
                      label={`Ảnh bổ sung ${additionalIndex + 1}`}
                      onChange={(selected) =>
                        setForm((current) => ({
                          ...current,
                          images: current.images.map((item, position) =>
                            position === index
                              ? {
                                  ...item,
                                  image_url: selected.imageUrl,
                                  cloudinary_public_id: selected.publicId,
                                }
                              : item,
                          ),
                        }))
                      }
                      onRemove={() =>
                        setForm((current) => ({
                          ...current,
                          images: current.images
                            .filter((_, position) => position !== index)
                            .map((item, position) => ({
                              ...item,
                              sort_order: position,
                            })),
                        }))
                      }
                      publicId={image.cloudinary_public_id}
                    />
                  );
                })}
              </div>
            </section>

            <section className="flex min-h-16 items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:col-span-2">
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-slate-800">
                  Sản phẩm có biến thể
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Dùng cho màu sắc, kích thước hoặc dung lượng.
                </p>
              </div>
              <CompactSwitch
                checked={hasVariants}
                label="Sản phẩm có biến thể"
                onChange={setVariantMode}
              />
            </section>

            {!hasVariants && form.variants[0] ? (
              <section className="rounded-2xl border border-slate-200 p-3 sm:p-4 lg:col-span-2">
                <div className="mb-4">
                  <h3 className="font-black">Thông tin bán hàng</h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Giá bán *"
                    inputMode="numeric"
                    onChange={(event) =>
                      updatePrimaryVariant({
                        base_price:
                          Number(normalizeIntegerInput(event.target.value)) ||
                          0,
                      })
                    }
                    placeholder="0"
                    value={formatIntegerInput(form.variants[0].base_price)}
                  />
                  <Input
                    label="Tồn kho ban đầu"
                    inputMode="numeric"
                    onChange={(event) =>
                      updatePrimaryVariant({
                        stock_quantity:
                          Number(normalizeIntegerInput(event.target.value)) ||
                          0,
                        shelf_quantity:
                          Number(normalizeIntegerInput(event.target.value)) || 0,
                      })
                    }
                    placeholder="0"
                    value={formatIntegerInput(form.variants[0].stock_quantity)}
                  />
                  <Input
                    label="SKU nội bộ"
                    onChange={(event) =>
                      updatePrimaryVariant({ sku: event.target.value })
                    }
                    value={form.variants[0].sku}
                  />
                  <div>
                    <span className="mb-1.5 block text-sm font-bold text-slate-700">
                      EAN-13
                    </span>
                    <button
                      className="flex min-h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
                      onClick={() => setDefaultEanOpen(true)}
                      type="button"
                    >
                      <span>{form.variants[0].barcode ?? "Chọn EAN-13"}</span>
                      <CircleCheck className="h-4 w-4 text-emerald-600" />
                    </button>
                  </div>
                </div>
              </section>
            ) : (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 lg:col-span-2">
                Giá và tồn kho được nhập theo từng SKU ở bước “Tổ hợp”.
              </div>
            )}

            <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:col-span-2">
              <summary className="cursor-pointer text-sm font-extrabold">
                Thông tin nâng cao
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Input
                  label="Slug"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      slug: slugify(event.target.value),
                    }))
                  }
                  value={form.slug}
                />
                <div className="sm:col-span-2">
                  <Textarea
                    label="Mô tả sản phẩm"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    value={form.description ?? ""}
                  />
                </div>
              </div>
            </details>
          </div>
        ) : null}
        {editorTab === "specifications" ? (
          <div className="space-y-4">
            {guideVisible ? (
              <ProductEditorGuide onDismiss={dismissCurrentGuide} step="specifications" />
            ) : null}
            <SpecificationsEditor
              attributes={attributes}
              form={form}
              setForm={setForm}
            />
          </div>
        ) : null}
        {editorTab === "variants" ? (
          <div className="space-y-6">
            {guideVisible ? (
              <ProductEditorGuide onDismiss={dismissCurrentGuide} step="variants" />
            ) : null}
            {!hasVariants ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                <h3 className="font-black">Sản phẩm không có biến thể</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Giá và tồn kho đang được quản lý bằng một SKU mặc định.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setVariantMode(true)}
                  variant="secondary"
                >
                  Bật biến thể
                </Button>
              </div>
            ) : null}
            {hasVariants ? (
              <div>
                <VariantBuilder
                  attributes={form.variant_attributes}
                  catalogAttributes={attributes}
                  onChange={(variant_attributes: VariantAttribute[]) =>
                    setForm((current) => ({ ...current, variant_attributes }))
                  }
                  onCreateAttribute={createVariantCatalogAttribute}
                  onDimensionsChanged={() => setDirtyDimensions(true)}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        {editorTab === "images" ? (
          <div className="space-y-5">
            {guideVisible ? (
              <ProductEditorGuide onDismiss={dismissCurrentGuide} step="images" />
            ) : null}
            {!hasVariants ? (
              <div className="rounded-2xl border border-slate-200 p-6 text-center">
                <h3 className="font-black">Không cần tạo tổ hợp</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Sản phẩm này dùng một SKU mặc định đã nhập ở bước Thông tin & ảnh.
                </p>
              </div>
            ) : (
              <>
                {dirtyDimensions ? (
                  <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <strong>Cần đồng bộ lại tổ hợp</strong>
                      <p className="mt-1 text-amber-700">
                        Tùy chọn vừa thay đổi. Tổ hợp cũ được giữ nguyên cho đến
                        khi bạn xác nhận tạo lại.
                      </p>
                    </div>
                    <Button className="shrink-0" onClick={generate}>
                      Tạo lại tổ hợp
                    </Button>
                  </div>
                ) : null}
                <SkuMatrix
                  attributes={form.variant_attributes}
                  fallbackImageUrl={form.images[0]?.image_url}
                  onAddManual={addManualCombination}
                  onChange={updateVariants}
                  onGenerate={generate}
                  usedEan13Codes={usedEan13Codes}
                  variants={form.variants}
                />
              </>
            )}
          </div>
        ) : null}
        {editorTab === "seo" ? (
          <div className="space-y-4">
            {guideVisible ? (
              <ProductEditorGuide onDismiss={dismissCurrentGuide} step="seo" />
            ) : null}
            <Input
              label="SEO tiêu đề"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  seo_title: event.target.value,
                }))
              }
              placeholder="Tiêu đề ngắn gọn, nêu rõ tên sản phẩm"
              value={form.seo_title ?? ""}
            />
            <Textarea
              label="SEO Mô tả"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  seo_description: event.target.value,
                }))
              }
              placeholder="Tóm tắt điểm nổi bật của sản phẩm"
              value={form.seo_description ?? ""}
            />
          </div>
        ) : null}
      </Modal>
      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2">
            <Button
              onClick={() => setManualCombinationOpen(false)}
              variant="secondary"
            >
              Hủy
            </Button>
            <Button onClick={confirmManualCombination}>Thêm tổ hợp</Button>
          </div>
        }
        onClose={() => setManualCombinationOpen(false)}
        open={manualCombinationOpen}
        size="sm"
        title="Chọn tổ hợp SKU"
        zIndex={110}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            Chọn một giá trị ở mỗi nhóm. Tổ hợp đã tồn tại sẽ không được thêm
            lại.
          </p>
          {form.variant_attributes.map((attribute) => (
            <Select
              key={attribute.id}
              label={attribute.name}
              onChange={(event) =>
                setManualValueIds((current) => ({
                  ...current,
                  [attribute.id]: event.target.value,
                }))
              }
              value={manualValueIds[attribute.id] ?? ""}
            >
              <option value="">Chọn {attribute.name.toLowerCase()}</option>
              {attribute.values
                .filter((value) => value.is_active)
                .map((value) => (
                  <option key={value.id} value={value.id}>
                    {formatVariantValueLabel(value.label, attribute.unit)}
                  </option>
                ))}
            </Select>
          ))}
        </div>
      </Modal>
      <Ean13PickerModal
        description="Sản phẩm mới cần một EAN-13 cho SKU mặc định. Bạn có thể quét mã trên bao bì hoặc để hệ thống tự tạo mã Việt Nam."
        onClose={() => setEan13GateOpen(false)}
        onSelect={createProductWithEan13}
        open={ean13GateOpen}
        title="Chọn EAN-13 cho sản phẩm mới"
        usedCodes={usedEan13Codes}
      />
      <Ean13PickerModal
        currentCode={form.variants[0]?.barcode}
        description="Bạn có thể quét lại mã trên bao bì hoặc tự tạo một EAN-13 Việt Nam mới cho SKU mặc định."
        onClose={() => setDefaultEanOpen(false)}
        onSelect={(code) => updatePrimaryVariant({ barcode: code })}
        open={defaultEanOpen}
        title="EAN-13 của SKU mặc định"
        usedCodes={usedEan13Codes}
      />
      <Ean13LabelsModal
        onClose={closeEan13Labels}
        open={ean13LabelsOpen}
        products={products}
      />
      <Ean13ScannerModal
        description="Quét EAN-13 để tìm nhanh sản phẩm trong danh sách."
        onClose={() => {
          setProductScannerOpen(false);
          setProductSearchOpen(true);
        }}
        onDetected={handleProductEanDetected}
        open={productScannerOpen}
        title="Quét EAN-13 sản phẩm"
      />
    </div>
  );
}

const cardFieldOptions = [
  ["image", "Hình ảnh"],
  ["name", "Tên sản phẩm"],
  ["category", "Danh mục"],
  ["price", "Giá bán / khoảng giá"],
  ["compare_price", "Giá so sánh"],
  ["stock", "Tồn kho"],
  ["variant_count", "Số lượng SKU"],
] as const;

function CardAppearanceEditor({
  currentSection,
  onChange,
  onSectionChange,
  settings,
}: {
  currentSection: PageTab;
  onChange: React.Dispatch<React.SetStateAction<ProductSettings>>;
  onSectionChange: (value: PageTab) => void;
  settings: ProductSettings;
}) {
  const { showSuccess } = useActionNotice();
  const [target, setTarget] = useState<"card" | "posCard">("card");
  const [savingCard, setSavingCard] = useState(false);
  const [message, setMessage] = useState("");
  const current = settings[target];

  function patch(value: Partial<ProductCardSettings>) {
    onChange((previous) => ({
      ...previous,
      [target]: { ...previous[target], ...value },
    }));
    setMessage("");
  }

  function toggleField(field: string) {
    patch({
      visibleFields: current.visibleFields.includes(field)
        ? current.visibleFields.filter((item) => item !== field)
        : [...current.visibleFields, field],
    });
  }

  async function save() {
    setSavingCard(true);
    setMessage("");
    try {
      onChange(await saveProductSettings(settings));
      showSuccess("Đã lưu giao diện card.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Không lưu được giao diện card.");
    } finally {
      setSavingCard(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(300px,0.8fr)_minmax(320px,1.2fr)]">
      <Card className="p-4">
        <div className="mb-4">
          <h2 className="font-black">Cấu hình card sản phẩm</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Giá bán, giá so sánh và hình ảnh lấy từ SKU có giá thấp nhất. Đây cũng là tổ hợp mặc định khi mở sản phẩm.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          <button className={`rounded-lg px-3 py-2 text-sm font-extrabold ${target === "card" ? "bg-white text-coal shadow-sm" : "text-slate-500"}`} onClick={() => setTarget("card")} type="button">Trang sản phẩm</button>
          <button className={`rounded-lg px-3 py-2 text-sm font-extrabold ${target === "posCard" ? "bg-white text-coal shadow-sm" : "text-slate-500"}`} onClick={() => setTarget("posCard")} type="button">Trang POS</button>
        </div>
        <div className="mt-4">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">Thông tin hiển thị</p>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            {cardFieldOptions.map(([field, label]) => (
              <label className="flex min-h-11 cursor-pointer items-center justify-between border-b border-slate-100 px-3 last:border-b-0" key={field}>
                <span className="text-sm font-bold">{label}</span>
                <CompactSwitch checked={current.visibleFields.includes(field)} label={label} onChange={() => toggleField(field)} />
              </label>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">Hiển thị hình ảnh</p>
          <div className="grid grid-cols-2 gap-2">
            <button className={`rounded-xl border px-3 py-2.5 text-sm font-bold ${current.imageFit === "cover" ? "border-moss-500 bg-moss-50 text-moss-800" : "border-slate-200"}`} onClick={() => patch({ imageFit: "cover" })} type="button">Lấp đầy card</button>
            <button className={`rounded-xl border px-3 py-2.5 text-sm font-bold ${current.imageFit === "contain" ? "border-moss-500 bg-moss-50 text-moss-800" : "border-slate-200"}`} onClick={() => patch({ imageFit: "contain" })} type="button">Hiện toàn ảnh</button>
          </div>
        </div>
      </Card>

      <Card className="bg-slate-50 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h3 className="font-black">Xem trước</h3><p className="text-xs text-slate-500">Dữ liệu mẫu đầy đủ để kiểm tra từng tùy chọn.</p></div>
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500">{target === "card" ? "Sản phẩm" : "POS"}</span>
        </div>
        <div className="mx-auto max-w-sm">
          <div className="mx-auto w-full max-w-[184px]">
            <ConfigurableProductCard
              {...productCardPreviewData}
              presentation={target === "posCard" ? "pos" : "product"}
              quantity={2}
              settings={current}
            />
          </div>
        </div>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-12px_32px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:left-72">
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <ProductSectionSelect onChange={onSectionChange} value={currentSection} />
          <Button aria-label="Lưu giao diện card" className="h-12 min-h-12 w-12 shrink-0 px-0" isLoading={savingCard} onClick={() => void save()} title={message || "Lưu giao diện"}><Save className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}

function formatProductStatus(status: ProductStatus) {
  if (status === "active") return "Đang bán";
  if (status === "inactive") return "Ngừng bán";
  return "Bản nháp";
}

function formatSpecificationValue(value: Product["specifications"][number]["value"]) {
  if (value === null || value === "") return "Chưa cập nhật";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (Array.isArray(value)) return value.join(", ") || "Chưa cập nhật";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ProductDetailModal({
  canEdit,
  onClose,
  onEdit,
  product,
}: {
  canEdit: boolean;
  onClose: () => void;
  onEdit: (product: Product) => void;
  product: Product | null;
}) {
  if (!product) return null;

  const hasProductVariants = productUsesVariants(product);
  const simpleVariant = getSimpleProductVariant(product);
  const displayedVariants = hasProductVariants
    ? product.variants.filter((variant) => variant.value_ids.length > 0)
    : simpleVariant
      ? [simpleVariant]
      : [];
  const activeVariants = displayedVariants.filter((variant) => variant.is_active);
  const totalStock = activeVariants.reduce(
    (sum, variant) => sum + variant.stock_quantity,
    0,
  );
  const totalShelfStock = activeVariants.reduce(
    (sum, variant) => sum + variant.shelf_quantity,
    0,
  );
  const sortedImages = [...product.images].sort(
    (first, second) => Number(second.is_primary) - Number(first.is_primary),
  );
  const primaryImage =
    sortedImages[0]?.image_url ??
    activeVariants.find((variant) => variant.image_url)?.image_url ??
    null;

  return (
    <Modal
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button onClick={onClose} variant="secondary">Đóng</Button>
          {canEdit ? (
            <Button onClick={() => onEdit(product)}>
              <Pencil className="h-4 w-4" /> Chỉnh sửa
            </Button>
          ) : null}
        </div>
      }
      onClose={onClose}
      open
      size="wide"
      title="Chi tiết sản phẩm"
    >
      <div className="space-y-5">
        <section className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
            {primaryImage ? (
              <img
                alt={product.name}
                className="aspect-square h-full w-full object-cover"
                src={primaryImage}
              />
            ) : (
              <div className="grid aspect-square place-items-center text-slate-300">
                <Boxes className="h-14 w-14" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-wide text-moss-700">
                  {product.category?.name ?? product.product_type?.name ?? "Chưa phân loại"}
                </p>
                <h3 className="mt-1 break-words text-2xl font-black text-slate-950">
                  {product.name}
                </h3>
                <p className="mt-1 break-all text-sm font-semibold text-slate-500">/{product.slug}</p>
              </div>
              <StatusPill
                active={product.status === "active"}
                label={formatProductStatus(product.status)}
              />
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {product.description?.trim() || "Sản phẩm chưa có mô tả."}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <ProductDetailMetric label="SKU" value={String(displayedVariants.length)} />
              <ProductDetailMetric label="Đang bán" value={String(activeVariants.length)} />
              <ProductDetailMetric label="Tồn kho" value={String(totalStock)} />
              <ProductDetailMetric label="Tại quầy" value={String(totalShelfStock)} />
            </dl>
          </div>
        </section>

        {sortedImages.length > 1 ? (
          <section>
            <h4 className="mb-2 text-sm font-black text-slate-950">Hình ảnh ({sortedImages.length})</h4>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {sortedImages.map((image) => (
                <img
                  alt={image.alt_text || product.name}
                  className="h-20 w-20 shrink-0 rounded-xl border border-slate-200 object-cover"
                  key={image.id}
                  src={image.image_url}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <h4 className="mb-2 text-sm font-black text-slate-950">Danh sách SKU</h4>
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="hidden grid-cols-[minmax(150px,1fr)_minmax(120px,0.8fr)_110px_90px_100px] gap-3 bg-slate-50 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-slate-500 sm:grid">
              <span>Phiên bản</span><span>Mã SKU / EAN-13</span><span>Giá bán</span><span>Tồn kho</span><span>Trạng thái</span>
            </div>
            <div className="divide-y divide-slate-100">
              {displayedVariants.map((variant) => (
                <div
                  className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(150px,1fr)_minmax(120px,0.8fr)_110px_90px_100px] sm:items-center sm:gap-3"
                  key={variant.id}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {(() => {
                      const skuImage =
                        variant.image_url ??
                        product.images.find((image) => image.variant_id === variant.id)?.image_url ??
                        product.images.find(
                          (image) =>
                            image.variant_value_id != null &&
                            variant.value_ids.includes(image.variant_value_id),
                        )?.image_url ??
                        primaryImage;
                      return skuImage ? (
                        <img
                          alt={`${product.name} - ${getVariantLabel(variant, product.variant_attributes)}`}
                          className="h-12 w-12 shrink-0 rounded-xl border border-slate-200 object-cover"
                          src={skuImage}
                        />
                      ) : (
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-300">
                          <Boxes className="h-5 w-5" />
                        </span>
                      );
                    })()}
                    <div className="min-w-0">
                      <p className="font-extrabold text-slate-900">{getVariantLabel(variant, product.variant_attributes)}</p>
                      {!hasProductVariants && variant.is_default ? (
                        <p className="text-xs font-semibold text-moss-700">Mặc định</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="min-w-0 text-xs font-semibold text-slate-600">
                    <p className="truncate" title={variant.sku}>{variant.sku}</p>
                    <p className="truncate text-slate-400" title={variant.barcode ?? undefined}>{variant.barcode || "Chưa có EAN-13"}</p>
                  </div>
                  <p className="font-black tabular-nums text-slate-950">{formatCurrency(variant.base_price)}</p>
                  <p className="font-extrabold tabular-nums text-slate-800">{variant.stock_quantity}</p>
                  <StatusPill active={variant.is_active} label={variant.is_active ? "Đang bán" : "Đã tắt"} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {product.specifications.length ? (
          <section>
            <h4 className="mb-2 text-sm font-black text-slate-950">Thông số sản phẩm</h4>
            <dl className="overflow-hidden rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {[...product.specifications]
                .sort((first, second) => first.sort_order - second.sort_order)
                .map((specification) => (
                  <div className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4" key={specification.id}>
                    <dt className="text-xs font-extrabold text-slate-500">{specification.name}</dt>
                    <dd className="break-words text-sm font-bold text-slate-900">
                      {formatSpecificationValue(specification.value)}{specification.unit ? ` ${specification.unit}` : ""}
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        ) : null}

        <p className="text-xs font-semibold text-slate-400">
          Tạo {formatDateTime(product.created_at)} · Cập nhật {formatDateTime(product.updated_at)}
        </p>
      </div>
    </Modal>
  );
}

function ProductDetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <dt className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-lg font-black tabular-nums text-slate-950">{value}</dd>
    </div>
  );
}

function ProductAdminCard({
  onView,
  product,
  selected,
  settings,
}: {
  onView: () => void;
  product: Product;
  selected?: boolean;
  settings: ProductCardSettings;
}) {
  const active = product.variants.filter((variant) => variant.is_active);
  const prices = active.map((variant) => variant.base_price);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const lowestVariant = active.find((variant) => variant.base_price === minPrice);
  const comparePrice =
    lowestVariant?.compare_at_price != null &&
    lowestVariant.compare_at_price > lowestVariant.base_price
      ? lowestVariant.compare_at_price
      : null;
  const stock = active.reduce((sum, variant) => sum + variant.stock_quantity, 0);
  const image =
    product.images.find((item) => item.is_primary)?.image_url ??
    product.images[0]?.image_url ??
    lowestVariant?.image_url ??
    active.find((variant) => variant.image_url)?.image_url ??
    null;
  return (
    <ConfigurableProductCard
      ariaLabel={`Xem chi tiết ${product.name}`}
      category={product.category?.name ?? product.product_type?.name}
      compareAtPrice={comparePrice}
      imageUrl={image}
      name={product.name}
      onActivate={onView}
      price={minPrice}
      selected={selected}
      settings={settings}
      stock={stock}
      variantCount={active.length}
    />
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-400"}`}
      />
      {label}
    </span>
  );
}

function CompactSwitch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center justify-center">
      <input
        aria-label={label}
        checked={checked}
        className="peer sr-only"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span className="relative h-6 w-11 rounded-full bg-slate-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:content-[''] peer-checked:bg-moss-700 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-moss-300 peer-focus-visible:ring-offset-2" />
    </label>
  );
}

function ProductListEmptyState({ label }: { label: string }) {
  return (
    <Card className="grid min-h-48 place-items-center text-center">
      <div>
        <PackageCheck className="mx-auto h-9 w-9 text-slate-300" />
        <p className="mt-2 text-sm font-semibold text-slate-500">{label}</p>
      </div>
    </Card>
  );
}

function SpecificationsEditor({
  attributes,
  form,
  setForm,
}: {
  attributes: ProductAttribute[];
  form: ProductEditorInput;
  setForm: React.Dispatch<React.SetStateAction<ProductEditorInput>>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  function add(attributeId: string) {
    const attribute = attributes.find((item) => item.id === attributeId);
    if (
      !attribute ||
      form.specifications.some((item) => item.code === attribute.code)
    )
      return;
    setForm((current) => ({
      ...current,
      specifications: [
        ...current.specifications,
        {
          attribute_id: attribute.id,
          name: attribute.name,
          code: attribute.code,
          data_type: attribute.data_type,
          input_type: attribute.input_type,
          unit: attribute.unit,
          value: "",
          is_required: false,
          sort_order: current.specifications.length,
        },
      ],
    }));
    setPickerOpen(false);
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-black">Thông số sản phẩm</h3>
        <Button
          className="shrink-0 px-3 py-2"
          onClick={() => setPickerOpen(true)}
          variant="secondary"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Thêm thuộc tính</span>
          <span className="sm:hidden">Thêm</span>
        </Button>
      </div>
      {!form.specifications.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
          <p className="font-bold text-slate-700">
            Loại sản phẩm này chưa có thông số mặc định
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Bạn có thể bỏ qua hoặc chọn một thuộc tính ở phía trên.
          </p>
        </div>
      ) : null}
      {form.specifications.map((specification, index) => (
        <div
          className="relative rounded-xl border border-slate-200 bg-white p-3 pr-12 sm:grid sm:grid-cols-[minmax(120px,1fr)_2fr_auto] sm:items-center sm:gap-3 sm:pr-3"
          key={specification.id ?? specification.code}
        >
          <div className="min-w-0">
            <strong className="block truncate text-sm">
              {specification.name}
            </strong>
            <p className="text-xs text-slate-500">
              {specification.data_type === "text"
                ? "Văn bản"
                : specification.data_type === "number"
                  ? "Số"
                  : specification.data_type === "date"
                    ? "Ngày"
                    : specification.data_type === "boolean"
                      ? "Có / Không"
                      : "Lựa chọn"}
              {specification.unit ? ` · ${specification.unit}` : ""}
            </p>
          </div>
          {specification.data_type === "boolean" ? (
            <Select
              className="mt-2 sm:mt-0"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  specifications: current.specifications.map(
                    (item, position) =>
                      position === index
                        ? { ...item, value: event.target.value === "true" }
                        : item,
                  ),
                }))
              }
              value={String(specification.value ?? false)}
            >
              <option value="false">Không</option>
              <option value="true">Có</option>
            </Select>
          ) : (
            <Input
              className="mt-2 sm:mt-0"
              min={specification.data_type === "number" ? "0" : undefined}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  specifications: current.specifications.map(
                    (item, position) =>
                      position === index
                        ? {
                            ...item,
                            value:
                              specification.data_type === "number"
                                ? Number(event.target.value)
                                : event.target.value,
                          }
                        : item,
                  ),
                }))
              }
              placeholder={
                specification.unit
                  ? `Nhập giá trị (${specification.unit})`
                  : `Nhập ${specification.name.toLocaleLowerCase()}`
              }
              type={
                specification.data_type === "number"
                  ? "number"
                  : specification.data_type === "date"
                    ? "date"
                    : "text"
              }
              value={
                typeof specification.value === "string" ||
                typeof specification.value === "number"
                  ? String(specification.value)
                  : ""
              }
            />
          )}
          <Button
            aria-label={`Bỏ ${specification.name}`}
            className="absolute right-2 top-2 !h-9 !min-h-0 !w-9 !p-0 sm:static"
            onClick={() =>
              setForm((current) => ({
                ...current,
                specifications: current.specifications.filter(
                  (_, position) => position !== index,
                ),
              }))
            }
            variant="danger"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <AttributePickerPopup
        attributes={attributes}
        excludedIds={form.specifications
          .map((item) => item.attribute_id)
          .filter((id): id is string => Boolean(id))}
        onClose={() => setPickerOpen(false)}
        onSelect={add}
        open={pickerOpen}
        title="Thêm thuộc tính cho sản phẩm"
      />
    </div>
  );
}

function AttributePickerPopup({
  attributes,
  excludedIds,
  onClose,
  onSelect,
  open,
  title,
}: {
  attributes: ProductAttribute[];
  excludedIds: string[];
  onClose: () => void;
  onSelect: (attributeId: string) => void;
  open: boolean;
  title: string;
}) {
  const [query, setQuery] = useState("");
  if (!open) return null;
  const available = attributes.filter(
    (attribute) =>
      attribute.is_active &&
      !excludedIds.includes(attribute.id) &&
      `${attribute.name} ${attribute.code}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <Modal
      onClose={onClose}
      open={open}
      size="sm"
      title={title}
      zIndex={120}
    >
      <div className="space-y-3">
        <p className="text-xs font-semibold text-slate-500">
          Chọn một mục để thêm
        </p>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            className="min-h-11 w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 outline-none focus:border-moss-500 focus:ring-2 focus:ring-moss-100"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm tên hoặc mã thuộc tính..."
            value={query}
          />
        </label>
        <div className="space-y-2">
          {available.map((attribute) => (
            <button
              className="flex min-h-14 w-full items-center justify-between rounded-xl border border-slate-200 px-4 text-left transition hover:border-moss-400 hover:bg-moss-50"
              key={attribute.id}
              onClick={() => onSelect(attribute.id)}
              type="button"
            >
              <span>
                <strong className="block text-sm">{attribute.name}</strong>
                <span className="text-xs text-slate-500">
                  {attribute.code} · {attribute.data_type}
                </span>
              </span>
              <Plus className="h-4 w-4 text-moss-700" />
            </button>
          ))}
          {!available.length ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              Không còn thuộc tính phù hợp để thêm.
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function DefinitionManager({
  attributes = [],
  canDelete,
  canManage,
  currentSection,
  kind,
  mappings = [],
  onSectionChange,
  onSaved,
  records,
}: {
  attributes?: ProductAttribute[];
  canDelete: boolean;
  canManage: boolean;
  currentSection: PageTab;
  kind: "type" | "attribute";
  mappings?: ProductTypeAttribute[];
  onSectionChange: (value: PageTab) => void;
  onSaved: () => Promise<void>;
  records: ProductType[] | ProductAttribute[];
}) {
  const { confirmAction, showSuccess } = useActionNotice();
  const [openEditor, setOpenEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [localError, setLocalError] = useState("");
  const [savingDefinition, setSavingDefinition] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [dataType, setDataType] = useState<AttributeDataType>("text");
  const [inputType, setInputType] = useState<AttributeInputType>("text");
  const [mappingRows, setMappingRows] = useState<ProductTypeAttribute[]>([]);
  const [mappingPickerOpen, setMappingPickerOpen] = useState(false);
  const filteredRecords = records.filter((record) =>
    `${record.name} ${record.code}`.toLowerCase().includes(query.toLowerCase()),
  );
  function editDefinition(record?: ProductType | ProductAttribute) {
    if (!canManage) return;
    setEditingId(record?.id ?? null);
    setName(record?.name ?? "");
    setCode(record?.code ?? "");
    setIsActive(record?.is_active ?? true);
    setDescription(
      record && "description" in record ? (record.description ?? "") : "",
    );
    setUnit(record && "data_type" in record ? (record.unit ?? "") : "");
    setDataType(record && "data_type" in record ? record.data_type : "text");
    setInputType(record && "data_type" in record ? record.input_type : "text");
    setMappingRows(
      record && !("data_type" in record)
        ? mappings.filter((mapping) => mapping.product_type_id === record.id)
        : [],
    );
    setLocalError("");
    setMappingPickerOpen(false);
    setOpenEditor(true);
  }
  async function save() {
    if (!canManage) return;
    if (!name.trim()) return;
    setSavingDefinition(true);
    setLocalError("");
    try {
      const wasEditing = Boolean(editingId);
      if (kind === "type") {
        const savedType = await saveProductType({
          id: editingId ?? undefined,
          name: name.trim(),
          code: code || slugify(name).replace(/-/g, "_"),
          description: description.trim() || null,
          is_active: isActive,
        });
        await saveProductTypeAttributes(
          savedType.id,
          mappingRows.map((row) => ({
            attribute_id: row.attribute_id,
            role: row.role,
            is_required: row.is_required,
            display_type: row.display_type,
            sort_order: row.sort_order,
          })),
        );
      } else
        await saveAttribute({
          id: editingId ?? undefined,
          name: name.trim(),
          code: code || slugify(name).replace(/-/g, "_"),
          data_type: dataType,
          input_type: inputType,
          unit: unit.trim() || null,
          is_active: isActive,
        });
      setOpenEditor(false);
      await onSaved();
      showSuccess(
        `${wasEditing ? "Đã lưu thay đổi" : "Đã thêm"} ${kind === "type" ? "danh mục sản phẩm" : "thuộc tính sản phẩm"}.`,
      );
    } catch (reason) {
      setLocalError(
        reason instanceof Error ? reason.message : "Không thể lưu dữ liệu.",
      );
    } finally {
      setSavingDefinition(false);
    }
  }
  async function remove(record: ProductType | ProductAttribute) {
    if (!canDelete) return;
    const label = kind === "type" ? "loại sản phẩm" : "thuộc tính";
    if (
      !await confirmAction({
        confirmLabel: `Xóa ${label}`,
        message: `Xóa ${label} “${record.name}”? Dữ liệu snapshot đã lưu trên sản phẩm sẽ được giữ.`,
        title: `Xác nhận xóa ${label}`,
        tone: "danger",
      })
    )
      return;
    setLocalError("");
    try {
      if (kind === "type") await deleteProductType(record.id);
      else await deleteAttribute(record.id);
      setOpenEditor(false);
      await onSaved();
      showSuccess(
        `Đã xóa ${kind === "type" ? "danh mục sản phẩm" : "thuộc tính sản phẩm"}.`,
      );
    } catch (reason) {
      setLocalError(
        reason instanceof Error ? reason.message : `Không thể xóa ${label}.`,
      );
    }
  }
  function toggleMapping(attributeId: string) {
    setMappingRows((current) =>
      current.some((row) => row.attribute_id === attributeId)
        ? current.filter((row) => row.attribute_id !== attributeId)
        : [
            ...current,
            {
              product_type_id: editingId ?? "",
              attribute_id: attributeId,
              role: "specification",
              is_required: false,
              display_type: null,
              sort_order: current.length,
            },
          ],
    );
  }
  function patchMapping(
    attributeId: string,
    patch: Partial<ProductTypeAttribute>,
  ) {
    setMappingRows((current) =>
      current.map((row) =>
        row.attribute_id === attributeId ? { ...row, ...patch } : row,
      ),
    );
  }
  return (
    <div className="space-y-4">
      {localError ? (
        <div className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
          {localError}
        </div>
      ) : null}
      <Card className="p-4">
        <div className="min-w-0">
          <h2 className="font-black">
            {kind === "type" ? "Danh mục sản phẩm" : "Thuộc tính sản phẩm"}
          </h2>
          <p className="text-xs text-slate-500">
            {kind === "type"
              ? "Mỗi danh mục là một Product Type với bộ thuộc tính dùng lại."
              : "Quản lý định nghĩa dữ liệu dùng chung cho mọi loại sản phẩm."}
          </p>
        </div>
      </Card>
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-12px_32px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:left-72">
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <ProductSectionSelect onChange={onSectionChange} value={currentSection} />
          <Button aria-label="Tìm kiếm" className="relative h-12 min-h-12 w-12 shrink-0 px-0" onClick={() => setSearchOpen(true)} variant="secondary">
            <Search className="h-4 w-4" />
            {query ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-moss-600" /> : null}
          </Button>
          {canManage ? <Button aria-label={kind === "type" ? "Thêm danh mục" : "Thêm thuộc tính"} className="h-12 min-h-12 w-12 shrink-0 px-0" onClick={() => editDefinition()}>
            <Plus className="h-4 w-4" />
          </Button> : null}
        </div>
      </div>
      <Card className="hidden overflow-hidden p-0 md:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="p-4">Tên</th>
              <th>Mã</th>
              {kind === "attribute" ? (
                <>
                  <th>Kiểu dữ liệu</th>
                  <th>Kiểu nhập</th>
                </>
              ) : (
                <th>Mô tả</th>
              )}
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map((record) => (
              <tr
                className={`border-t border-slate-100 transition ${canManage ? "cursor-pointer hover:bg-slate-50" : ""}`}
                key={record.id}
                onClick={() => editDefinition(record)}
              >
                <td className="p-4 font-extrabold">{record.name}</td>
                <td>
                  <code className="rounded bg-slate-100 px-2 py-1 text-xs">
                    {record.code}
                  </code>
                </td>
                {"data_type" in record ? (
                  <>
                    <td>{record.data_type}</td>
                    <td>{record.input_type}</td>
                  </>
                ) : (
                  <td className="max-w-xs truncate text-slate-500">
                    {record.description || "—"}
                  </td>
                )}
                <td>
                  <StatusPill
                    active={record.is_active}
                    label={record.is_active ? "Hiển thị" : "Đã ẩn"}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="grid gap-3 md:hidden">
        {filteredRecords.map((record) => (
          <button
            className={`w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-soft ${canManage ? "" : "cursor-default"}`}
            key={record.id}
            onClick={() => editDefinition(record)}
            type="button"
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <strong>{record.name}</strong>
                <p className="truncate text-xs text-slate-500">
                  {record.code}
                  {"data_type" in record
                    ? ` · ${record.data_type} / ${record.input_type}`
                    : ""}
                </p>
              </div>
              <StatusPill
                active={record.is_active}
                label={record.is_active ? "Hiện" : "Ẩn"}
              />
            </div>
          </button>
        ))}
      </div>
      {!filteredRecords.length ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          Không tìm thấy dữ liệu phù hợp.
        </Card>
      ) : null}
      <ProductSearchPopup
        onChange={setQuery}
        onClose={() => setSearchOpen(false)}
        open={searchOpen}
        placeholder="Tìm theo tên hoặc mã..."
        title={kind === "type" ? "Tìm danh mục sản phẩm" : "Tìm thuộc tính sản phẩm"}
        value={query}
      />
      <Modal
        footer={
          <div className="flex w-full flex-wrap gap-2">
            {editingId && canDelete ? (
              <Button
                className="mr-auto"
                onClick={() => {
                  const record = records.find((item) => item.id === editingId);
                  if (record) void remove(record);
                }}
                variant="danger"
              >
                <Trash2 className="h-4 w-4" /> Xóa
              </Button>
            ) : (
              <span className="mr-auto" />
            )}
            <Button onClick={() => setOpenEditor(false)} variant="secondary">
              Hủy
            </Button>
            {canManage ? <Button
              disabled={savingDefinition || !name.trim()}
              onClick={() => void save()}
            >
              {savingDefinition ? "Đang lưu..." : editingId ? "Lưu" : "Tạo mới"}
            </Button> : null}
          </div>
        }
        onClose={() => setOpenEditor(false)}
        open={openEditor}
        size={kind === "type" ? "xl" : "md"}
        title={`${editingId ? "Chỉnh sửa" : "Thêm"} ${kind === "type" ? "loại sản phẩm" : "thuộc tính"}`}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Tên *"
              onChange={(event) => {
                setName(event.target.value);
                if (!editingId && !code)
                  setCode(slugify(event.target.value).replace(/-/g, "_"));
              }}
              placeholder={
                kind === "type" ? "Ví dụ: Thời trang" : "Ví dụ: Màu sắc"
              }
              value={name}
            />
            <Input
              label="Mã *"
              onChange={(event) =>
                setCode(slugify(event.target.value).replace(/-/g, "_"))
              }
              placeholder={kind === "type" ? "clothing" : "color"}
              value={code}
            />
          </div>
          {kind === "type" ? (
            <>
              <Textarea
                label="Mô tả"
                onChange={(event) => setDescription(event.target.value)}
                value={description}
              />
              <section className="rounded-2xl border border-slate-200 p-3 sm:p-4">
                <div className="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-black leading-5 sm:text-base">
                      Cấu hình thuộc tính
                    </h3>
                    <p className="text-xs leading-4 text-slate-500">
                      Chỉ các thuộc tính đã thêm mới được dùng khi tạo sản phẩm.
                    </p>
                  </div>
                  <Button
                    className="min-h-10 w-full py-2 sm:w-auto"
                    onClick={() => setMappingPickerOpen(true)}
                    variant="secondary"
                  >
                    <Plus className="h-4 w-4" /> Thêm thuộc tính
                  </Button>
                </div>
                <div className="max-h-[42vh] overflow-y-auto rounded-xl border border-slate-200 bg-white">
                  {mappingRows.length ? (
                    <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_58px_58px_32px] items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-[9px] font-black uppercase tracking-wide text-slate-400 sm:grid-cols-[minmax(140px,1fr)_76px_76px_36px] sm:gap-2 sm:px-3 sm:text-[10px]">
                      <span>Thuộc tính</span>
                      <span className="text-center">Biến thể</span>
                      <span className="text-center">Cần thiết</span>
                      <span />
                    </div>
                  ) : null}
                  {mappingRows.map((row) => {
                    const attribute = attributes.find(
                      (item) => item.id === row.attribute_id,
                    );
                    if (!attribute) return null;
                    return (
                      <div
                        className="grid min-w-0 grid-cols-[minmax(0,1fr)_58px_58px_32px] items-center gap-1.5 border-b border-slate-100 px-2.5 py-2.5 last:border-b-0 sm:grid-cols-[minmax(140px,1fr)_76px_76px_36px] sm:gap-2 sm:px-3"
                        key={attribute.id}
                      >
                        <div className="min-w-0">
                          <strong className="block truncate text-sm">
                            {attribute.name}
                          </strong>
                          <span className="block truncate text-[11px] text-slate-400">
                            {attribute.data_type === "number"
                              ? "Số"
                              : attribute.data_type === "date"
                                ? "Ngày"
                                : attribute.data_type === "option"
                                  ? "Lựa chọn"
                                  : "Văn bản"}
                          </span>
                        </div>
                        <CompactSwitch
                          checked={row.role === "variant"}
                          label={`${attribute.name} là biến thể`}
                          onChange={(checked) =>
                            patchMapping(attribute.id, {
                              role: checked ? "variant" : "specification",
                              display_type: checked
                                ? (row.display_type ??
                                  inferVariantDisplay(attribute.input_type))
                                : null,
                            })
                          }
                        />
                        <CompactSwitch
                          checked={row.is_required}
                          label={`${attribute.name} cần thiết`}
                          onChange={(checked) =>
                            patchMapping(attribute.id, {
                              is_required: checked,
                            })
                          }
                        />
                        <button
                          aria-label={`Bỏ ${attribute.name}`}
                          className="grid h-9 w-8 place-items-center rounded-lg text-red-600 transition hover:bg-red-50 sm:w-9"
                          onClick={() => toggleMapping(attribute.id)}
                          title="Bỏ thuộc tính"
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                  {!mappingRows.length ? (
                    <div className="p-6 text-center text-sm text-slate-500">
                      Chưa có thuộc tính. Nhấn “Thêm thuộc tính” để cấu hình.
                    </div>
                  ) : null}
                </div>
              </section>
              <AttributePickerPopup
                attributes={attributes}
                excludedIds={mappingRows.map((row) => row.attribute_id)}
                onClose={() => setMappingPickerOpen(false)}
                onSelect={(attributeId) => {
                  toggleMapping(attributeId);
                  setMappingPickerOpen(false);
                }}
                open={mappingPickerOpen}
                title="Thêm thuộc tính vào danh mục"
              />
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Bản chất dữ liệu"
                onChange={(event) =>
                  setDataType(event.target.value as AttributeDataType)
                }
                value={dataType}
              >
                {["text", "number", "boolean", "date", "option", "json"].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </Select>
              <Select
                label="Kiểu nhập liệu"
                onChange={(event) =>
                  setInputType(event.target.value as AttributeInputType)
                }
                value={inputType}
              >
                {[
                  "text",
                  "textarea",
                  "number",
                  "select",
                  "multi_select",
                  "radio",
                  "checkbox",
                  "switch",
                  "date",
                  "color",
                  "image",
                  "image_text",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </Select>
              <Input
                label="Đơn vị"
                onChange={(event) => setUnit(event.target.value)}
                placeholder="kg, cm, GB, tháng..."
                value={unit}
              />
            </div>
          )}
          <label className="flex min-h-12 items-center justify-between rounded-xl border border-slate-200 px-4 text-sm font-bold">
            <span>Đang sử dụng</span>
            <input
              checked={isActive}
              className="h-5 w-5 accent-moss-600"
              onChange={(event) => setIsActive(event.target.checked)}
              type="checkbox"
            />
          </label>
          <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
            Mã dùng để liên kết dữ liệu và nên ổn định sau khi đã có sản phẩm.
            Việc xóa định nghĩa không xóa giá trị snapshot đã lưu trong sản
            phẩm/đơn hàng.
          </p>
        </div>
      </Modal>
    </div>
  );
}
