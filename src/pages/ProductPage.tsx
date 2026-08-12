import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  LayoutGrid,
  Minus,
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
import { CloudinaryImageField } from "../components/media/CloudinaryImageField";
import { Ean13PickerModal } from "../components/products/Ean13PickerModal";
import { ConfigurableProductCard } from "../components/products/ConfigurableProductCard";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { formatIntegerInput, normalizeIntegerInput } from "../lib/format";
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
  VariantDraft,
} from "../features/products/types";
import {
  countVariantCombinations,
  createSkuPrefix,
  formatVariantValueLabel,
  mergeGeneratedVariants,
  variantCombinationKey,
} from "../features/products/utils/variants";
import { formatCurrency } from "../lib/format";
import { isValidEan13, normalizeEan13Input } from "../lib/productDisplay";
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
  onChange,
  onClose,
  open,
  placeholder,
  title,
  value,
}: {
  onChange: (value: string) => void;
  onClose: () => void;
  open: boolean;
  placeholder: string;
  title: string;
  value: string;
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
      <label className="relative block">
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
    </Modal>
  );
}
type EditorTab = "general" | "specifications" | "variants" | "images" | "seo";
const editorSteps: Array<[EditorTab, string]> = [
  ["general", "Thông tin chung"],
  ["specifications", "Thuộc tính"],
  ["variants", "Biến thể"],
  ["images", "Hình ảnh"],
  ["seo", "SEO"],
];
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
  const { canAccess } = useAuth();
  const canCreateProduct = canAccess("products.create");
  const canUpdateProduct = canAccess("products.update");
  const canDeleteProduct = canAccess("products.delete");
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
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [form, setForm] = useState<ProductEditorInput>(emptyInput());
  const [open, setOpen] = useState(false);
  const [ean13GateOpen, setEan13GateOpen] = useState(false);
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
  const filtered = useMemo(
    () =>
      products.filter((product) =>
        `${product.name} ${product.slug} ${product.variants.map((variant) => variant.sku).join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [products, query],
  );
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
    setForm({
      ...product,
      specifications: product.specifications,
      variant_attributes: product.variant_attributes,
      variants: product.variants,
      images: [...product.images].sort(
        (first, second) => Number(second.is_primary) - Number(first.is_primary),
      ),
    });
    setEditorTab("general");
    setHasVariants(
      product.variant_attributes.length > 0 || product.variants.length > 1,
    );
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
    if (form.id ? !canUpdateProduct : !canCreateProduct) {
      setError("Tài khoản không có quyền lưu sản phẩm này.");
      return;
    }
    if (!form.name.trim() || !form.slug.trim()) {
      setError("Tên và slug là bắt buộc.");
      return;
    }
    if (hasVariants && !form.variant_attributes.length) {
      setError("Hãy thêm ít nhất một loại biến thể trước khi lưu.");
      setEditorTab("variants");
      return;
    }
    if (
      hasVariants &&
      form.variant_attributes.some((attribute) => !attribute.values.length)
    ) {
      setError("Mỗi loại biến thể cần có ít nhất một giá trị.");
      setEditorTab("variants");
      return;
    }
    if (dirtyDimensions) {
      setError(
        "Cấu hình biến thể vừa thay đổi. Hãy bấm “Tạo tất cả tổ hợp” để đồng bộ SKU trước khi lưu.",
      );
      setEditorTab("variants");
      return;
    }
    if (!form.variants.length) {
      setError(
        hasVariants
          ? "Hãy tạo tổ hợp SKU trước khi lưu sản phẩm."
          : "Sản phẩm phải có một SKU mặc định.",
      );
      if (hasVariants) setEditorTab("variants");
      return;
    }
    if (
      form.variants.some(
        (variant) =>
          variant.compare_at_price != null &&
          variant.compare_at_price < variant.base_price,
      )
    ) {
      setError("Giá so sánh phải lớn hơn hoặc bằng giá bán của SKU.");
      setEditorTab(hasVariants ? "variants" : "general");
      return;
    }
    const barcodes = form.variants
      .map((variant) => normalizeEan13Input(variant.barcode ?? ""))
      .filter(Boolean);
    if (barcodes.some((barcode) => !isValidEan13(barcode))) {
      setError("Mỗi EAN-13 phải có đúng 13 chữ số và số kiểm tra hợp lệ.");
      setEditorTab("variants");
      return;
    }
    if (new Set(barcodes).size !== barcodes.length) {
      setError("EAN-13 không được trùng giữa các SKU.");
      setEditorTab("variants");
      return;
    }
    setSaving(true);
    try {
      const baseSlug = form.slug.trim();
      let uniqueSlug = baseSlug;
      let suffix = 2;
      while (
        products.some(
          (product) => product.id !== form.id && product.slug === uniqueSlug,
        )
      ) {
        uniqueSlug = `${baseSlug}-${suffix++}`;
      }
      const payload =
        uniqueSlug === form.slug ? form : { ...form, slug: uniqueSlug };
      if (uniqueSlug !== form.slug) setForm(payload);
      await saveProduct(payload);
      setOpen(false);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Không lưu được sản phẩm.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function removeCurrentProduct() {
    if (!canDeleteProduct) {
      setError("Tài khoản không có quyền xóa sản phẩm.");
      return;
    }
    if (!form.id || !window.confirm(`Xóa sản phẩm “${form.name}”?`)) return;
    setSaving(true);
    setError("");
    try {
      await archiveProduct(form.id);
      setOpen(false);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Không xóa được sản phẩm.",
      );
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
  function generate() {
    const count = countVariantCombinations(form.variant_attributes);
    if (
      dirtyDimensions &&
      form.variants.some((variant) => variant.id) &&
      !window.confirm(
        `Việc tạo lại ${count} tổ hợp có thể thay thế SKU hiện tại. Snapshot đơn hàng vẫn được giữ. Tiếp tục?`,
      )
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
  function applyProductType(productTypeId: string) {
    if (
      form.product_type_id &&
      form.product_type_id !== productTypeId &&
      form.variant_attributes.length > 0 &&
      !window.confirm(
        "Đổi Product Type sẽ nạp lại cấu hình specification/variant mặc định. SKU chỉ thay đổi khi bạn xác nhận tạo lại matrix. Tiếp tục?",
      )
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
  function setVariantMode(next: boolean) {
    if (
      !next &&
      (form.variant_attributes.length > 0 || form.variants.length > 1) &&
      !window.confirm(
        "Tắt biến thể sẽ giữ lại một SKU mặc định và bỏ ma trận biến thể hiện tại. Tiếp tục?",
      )
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
    <div className="mx-auto max-w-[1500px] space-y-4 px-3 pb-28 sm:px-6 lg:px-8">
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
            <Button aria-label="Tìm sản phẩm" className="relative h-12 min-h-12 w-12 shrink-0 px-0" onClick={() => setProductSearchOpen(true)} variant="secondary">
              <Search className="h-4 w-4" />
              {query ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-moss-600" /> : null}
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
              <div className="grid justify-start gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(148px,172px))] sm:gap-3">
                {filtered.map((product) => (
                  <ProductAdminCard
                    key={product.id}
                    onEdit={canUpdateProduct || canDeleteProduct ? () => edit(product) : undefined}
                    product={product}
                    settings={productSettings.card}
                  />
                ))}
              </div>
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
                            if (window.confirm(`Ẩn ${product.name}?`)) {
                              await archiveProduct(product.id);
                              await load();
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
                <EmptyState label="Không tìm thấy sản phẩm phù hợp." />
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
          canDelete={canDeleteProduct}
          canManage={canUpdateProduct}
        />
      ) : null}
      {pageTab === "attributes" ? (
        <DefinitionManager
          currentSection={pageTab}
          kind="attribute"
          onSectionChange={setPageTab}
          records={attributes}
          onSaved={load}
          canDelete={canDeleteProduct}
          canManage={canUpdateProduct}
        />
      ) : null}
      {pageTab === "card" ? (
        canUpdateProduct ? <CardAppearanceEditor
            currentSection={pageTab}
            onChange={setProductSettings}
            onSectionChange={setPageTab}
            products={products}
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
      <ProductSearchPopup
        onChange={setQuery}
        onClose={() => setProductSearchOpen(false)}
        open={productSearchOpen}
        placeholder="Tìm theo tên, slug hoặc SKU..."
        title="Tìm sản phẩm"
        value={query}
      />
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
            <div className="flex gap-3 rounded-2xl border border-moss-200 bg-moss-50 p-3 sm:p-4 lg:col-span-2">
              <Sparkles className="h-5 w-5 shrink-0 text-moss-700" />
              <div>
                <p className="font-extrabold text-moss-900">
                  Nhập nhanh trong 3 bước
                </p>
                <p className="mt-1 text-sm text-moss-800">
                  Chọn danh mục → chọn có biến thể hay không → nhập thông tin
                  bán hàng. Slug và SKU được hệ thống chuẩn bị.
                </p>
              </div>
            </div>

            <section className="rounded-2xl border border-slate-200 p-3 sm:p-4">
              <div className="mb-4 flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-coal text-xs font-black text-white">
                  1
                </span>
                <div>
                  <h3 className="font-black">Sản phẩm là gì?</h3>
                  <p className="text-xs text-slate-500">
                    Danh mục sẽ tự nạp bộ thuộc tính đã cấu hình trong tab Danh
                    mục sản phẩm.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
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
                <label className="flex min-h-12 items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 sm:col-span-2">
                  <span>
                    <strong className="block text-sm">
                      Sản phẩm có biến thể
                    </strong>
                    <span className="text-xs text-slate-500">
                      Ví dụ: màu sắc, kích thước hoặc dung lượng
                    </span>
                  </span>
                  <input
                    checked={hasVariants}
                    className="h-5 w-5 accent-moss-600"
                    onChange={(event) => setVariantMode(event.target.checked)}
                    type="checkbox"
                  />
                </label>
              </div>
            </section>

            {!hasVariants && form.variants[0] ? (
              <section className="rounded-2xl border border-slate-200 p-3 sm:p-4">
                <div className="mb-4 flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-coal text-xs font-black text-white">
                    2
                  </span>
                  <div>
                    <h3 className="font-black">Thông tin bán hàng</h3>
                    <p className="text-xs text-slate-500">
                      Giá và tồn kho của SKU mặc định.
                    </p>
                  </div>
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
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                <strong>Giá và tồn kho sẽ nhập theo từng SKU.</strong> Sang bước
                “Biến thể” để thêm lựa chọn và tạo tổ hợp.
              </div>
            )}

            <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-extrabold">
                Thông tin nâng cao: slug và mô tả
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
                    label="Mô tả"
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
          <SpecificationsEditor
            attributes={attributes}
            form={form}
            setForm={setForm}
          />
        ) : null}
        {editorTab === "variants" ? (
          <div className="space-y-6">
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
            {hasVariants && dirtyDimensions ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <strong>Cần đồng bộ lại SKU</strong>
                  <p className="mt-1 text-amber-700">
                    Bạn đã thêm hoặc xóa chiều/giá trị biến thể. SKU cũ chưa bị
                    xóa cho đến khi bạn xác nhận tạo lại tổ hợp.
                  </p>
                </div>
                <Button className="shrink-0" onClick={generate}>
                  Tạo lại tổ hợp SKU
                </Button>
              </div>
            ) : null}
            {hasVariants ? (
              <>
                <VariantBuilder
                  attributes={form.variant_attributes}
                  onChange={(variant_attributes: VariantAttribute[]) =>
                    setForm((current) => ({ ...current, variant_attributes }))
                  }
                  onDimensionsChanged={() => setDirtyDimensions(true)}
                />
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
            ) : null}
          </div>
        ) : null}
        {editorTab === "images" ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 p-3 sm:p-4">
              <div className="mb-3">
                <h3 className="font-black">Hình ảnh</h3>
                <p className="text-xs text-slate-500">Hiển thị mặc định trước khi khách chọn một SKU cụ thể.</p>
              </div>
              <CloudinaryImageField
                appearance="row"
                imageUrl={form.images[0]?.image_url}
                label=""
                onChange={(selected) => setForm((current) => ({
                  ...current,
                  images: selected.imageUrl
                    ? [{
                        ...(current.images[0] ?? {
                          alt_text: current.name,
                          sort_order: 0,
                          variant_id: null,
                          variant_value_id: null,
                        }),
                        image_url: selected.imageUrl,
                        cloudinary_public_id: selected.publicId,
                        is_primary: true,
                      }, ...current.images.slice(1)]
                    : current.images.slice(1).map((image, index) => ({
                        ...image,
                        is_primary: index === 0,
                        sort_order: index,
                      })),
                }))}
                publicId={form.images[0]?.cloudinary_public_id}
              />
            </section>
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
              <strong>Ảnh bổ sung của sản phẩm</strong>
              <p className="mt-1 text-xs leading-5 text-blue-700">
                Ảnh đại diện được chọn ở phía trên. Ảnh riêng của SKU được chọn trong Ma trận SKU.
              </p>
            </div>
            <Button
              disabled={!form.images[0]?.image_url}
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  images: [
                    ...current.images,
                    {
                      image_url: "",
                      cloudinary_public_id: null,
                      alt_text: current.name,
                      sort_order: current.images.length,
                      is_primary: false,
                      variant_id: null,
                      variant_value_id: null,
                    },
                  ],
                }))
              }
            >
              + Thêm ảnh bổ sung
            </Button>
            {form.images.slice(1).map((image, additionalIndex) => {
              const index = additionalIndex + 1;
              return (
              <CloudinaryImageField
                appearance="row"
                imageUrl={image.image_url}
                key={image.id ?? index}
                label={`Ảnh bổ sung ${additionalIndex + 1}`}
                onChange={(selected) =>
                  setForm((current) => ({
                    ...current,
                    images: selected.imageUrl
                      ? current.images.map((item, position) =>
                          position === index
                            ? {
                                ...item,
                                image_url: selected.imageUrl,
                                cloudinary_public_id: selected.publicId,
                              }
                            : item,
                        )
                      : current.images.filter(
                          (_, position) => position !== index,
                        ),
                  }))
                }
                publicId={image.cloudinary_public_id}
              />
              );
            })}
            {form.images.length <= 1 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-500">
                Chưa có ảnh bổ sung.
              </p>
            ) : null}
          </div>
        ) : null}
        {editorTab === "seo" ? (
          <div className="space-y-4">
            <Input
              label="SEO title"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  seo_title: event.target.value,
                }))
              }
              value={form.seo_title ?? ""}
            />
            <Textarea
              label="SEO description"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  seo_description: event.target.value,
                }))
              }
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
  products,
  settings,
}: {
  currentSection: PageTab;
  onChange: React.Dispatch<React.SetStateAction<ProductSettings>>;
  onSectionChange: (value: PageTab) => void;
  products: Product[];
  settings: ProductSettings;
}) {
  const [target, setTarget] = useState<"card" | "posCard">("card");
  const [savingCard, setSavingCard] = useState(false);
  const [message, setMessage] = useState("");
  const current = settings[target];
  const sample = products[0] ?? null;

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
      setMessage("Đã lưu giao diện card.");
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
          <div><h3 className="font-black">Xem trước</h3><p className="text-xs text-slate-500">Dữ liệu thật từ sản phẩm đầu tiên.</p></div>
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500">{target === "card" ? "Sản phẩm" : "POS"}</span>
        </div>
        <div className="mx-auto max-w-sm">
          {sample ? (
            <ProductAdminCard onEdit={() => undefined} posPreview={target === "posCard"} preview product={sample} settings={current} />
          ) : (
            <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white text-sm text-slate-500">Thêm sản phẩm để xem trước.</div>
          )}
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

function ProductAdminCard({
  onEdit,
  posPreview = false,
  preview = false,
  product,
  settings,
}: {
  onEdit?: () => void;
  posPreview?: boolean;
  preview?: boolean;
  product: Product;
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
      action={preview && posPreview ? <div className="flex items-center gap-1 rounded-full bg-moss-50 p-1"><span className="grid h-7 w-7 place-items-center rounded-full bg-white text-moss-700 shadow-sm ring-1 ring-moss-100"><Minus className="h-4 w-4" /></span><span className="min-w-5 text-center text-sm font-black">2</span><span className="grid h-8 w-8 place-items-center rounded-full bg-moss-700 text-white shadow-sm"><Plus className="h-4 w-4" /></span></div> : undefined}
      category={product.category?.name ?? product.product_type?.name}
      compareAtPrice={comparePrice}
      imageUrl={image}
      name={product.name}
      onActivate={!preview ? onEdit : undefined}
      price={minPrice}
      selected={preview && posPreview}
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

function EmptyState({ label }: { label: string }) {
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
      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-black leading-5 text-blue-950">
              Thông số sản phẩm
            </h3>
            <p className="mt-0.5 text-xs leading-4 text-blue-700">
              Điền thông tin có sẵn, trường không bắt buộc có thể để trống.
            </p>
          </div>
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
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4">
      <button
        aria-label="Đóng"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <div className="relative flex max-h-[78dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-6">
          <div>
            <h3 className="font-black text-slate-950">{title}</h3>
            <p className="text-xs text-slate-500">Chọn một mục để thêm</p>
          </div>
          <button
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            <span className="text-xl">×</span>
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
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
      </div>
    </div>
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
      !window.confirm(
        `Xóa ${label} “${record.name}”? Dữ liệu snapshot đã lưu trên sản phẩm sẽ được giữ.`,
      )
    )
      return;
    setLocalError("");
    try {
      if (kind === "type") await deleteProductType(record.id);
      else await deleteAttribute(record.id);
      setOpenEditor(false);
      await onSaved();
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
