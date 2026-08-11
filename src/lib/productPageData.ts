import type {
  CustomProductAttribute,
  CustomAttributeType,
  ProductSettings,
} from "../services/productSettings";
import type { Product } from "../types";
import { formatCurrency } from "./format";
import { getProductEan13Value } from "./productDisplay";

export type ProductFormState = {
  name: string;
  ean13: string;
  category: string;
  description: string;
  price: string;
  cost_price: string;
  import_date: string;
  expiry_date: string;
  stock: string;
  shelf_stock: string;
  image_url: string;
  is_active: boolean;
  is_reward: boolean;
  reward_points_cost: string;
};

export type ProductVariant = {
  values: Record<string, string>;
  stock: number;
  shelf_stock: number;
  image_url?: string;
  linked_values?: Record<string, string>;
};

export type ProductVariantSelection = Record<string, string[]>;

export type ResolvedProductVariant = {
  image_url?: string;
  label: string;
  linked_values: Record<string, string>;
  matches: ProductVariant[];
  selection: ProductVariantSelection;
  shelf_stock: number | null;
  stock: number | null;
  stock_sources: ProductVariant[];
  values: Record<string, string | string[]>;
};

export type ProductVariantDefinition = Pick<
  CustomProductAttribute,
  "id" | "name" | "optionColors" | "optionDisplay" | "optionImages" | "options" | "type" | "variantDisplayType"
>;

export function isProductVariantOptionAvailable(
  product: Product,
  selection: ProductVariantSelection,
  attributeId: string,
  option: string,
) {
  const candidate = { ...selection, [attributeId]: [option] };
  return getProductVariants(product).some((variant) => {
    if (getVariantStock(variant, true) <= 0) return false;
    return Object.entries(candidate).every(([id, selected]) => {
      if (!selected.length) return true;
      const value = variant.values[id];
      return value !== undefined && selected.includes(String(value));
    });
  });
}

export function getProductAttributes(product: Product) {
  return product.attributes &&
    typeof product.attributes === "object" &&
    !Array.isArray(product.attributes)
    ? (product.attributes as Record<string, unknown>)
    : {};
}

export function getProductVariantAttributeIds(product: Product) {
  const attributes = getProductAttributes(product);
  return Array.isArray(attributes._variantAttributeIds)
    ? attributes._variantAttributeIds.filter(
        (value): value is string => typeof value === "string" && Boolean(value),
      )
    : [];
}

export function getProductVariants(product: Product): ProductVariant[] {
  const attributes = getProductAttributes(product);
  if (!Array.isArray(attributes._variants)) return [];

  return attributes._variants.filter(
    (variant): variant is ProductVariant =>
      Boolean(
        variant &&
          typeof variant === "object" &&
          !Array.isArray(variant) &&
          "values" in variant &&
          variant.values &&
          typeof variant.values === "object" &&
          !Array.isArray(variant.values),
      ),
  );
}

export function getProductVariantCount(product: Product) {
  const variants = getProductVariants(product);
  const attributeIds = new Set(getProductVariantAttributeIds(product));
  const maxSpecificity = Math.max(
    0,
    ...variants.map(
      (variant) =>
        Object.keys(variant.values).filter((key) => attributeIds.has(key)).length,
    ),
  );
  return variants.filter(
    (variant) =>
      Object.keys(variant.values).filter((key) => attributeIds.has(key)).length ===
      maxSpecificity,
  ).length;
}

export function getProductVariantDefinitions(
  product: Product,
  settings: ProductSettings,
): ProductVariantDefinition[] {
  const ids = new Set(getProductVariantAttributeIds(product));
  return settings.customAttributes.filter(
    (attribute) =>
      attribute.enabled &&
      ids.has(attribute.id) &&
      (attribute.type === "single" || attribute.type === "multiple"),
  );
}

export function getProductVariantKey(
  variant: Pick<ProductVariant, "values">,
  attributeIds?: string[],
) {
  const keys = attributeIds?.length
    ? attributeIds
    : Object.keys(variant.values).sort((left, right) => left.localeCompare(right));
  return keys.map((key) => `${key}:${variant.values[key] ?? ""}`).join("|");
}

export function getProductVariantLabel(
  variant: Pick<ProductVariant, "values">,
  definitions: ProductVariantDefinition[],
) {
  return definitions
    .map((definition) => variant.values[definition.id])
    .filter(Boolean)
    .join(" / ");
}

export function getVariantStock(variant: ProductVariant, shelf = false) {
  const value = Number(shelf ? variant.shelf_stock : variant.stock);
  return Number.isFinite(value) ? Math.max(Math.floor(value), 0) : 0;
}

function hasOwnVariantValue(
  variant: ProductVariant,
  key: "stock" | "shelf_stock",
) {
  return Object.prototype.hasOwnProperty.call(variant, key);
}

export function resolveProductVariantSelection(
  product: Product,
  settings: ProductSettings,
  selection: ProductVariantSelection,
): ResolvedProductVariant | null {
  const definitions = getProductVariantDefinitions(product, settings);
  if (!definitions.length) return null;

  const normalizedSelection = Object.fromEntries(
    definitions.map((definition) => [
      definition.id,
      (selection[definition.id] ?? []).filter((value) =>
        definition.options.includes(value),
      ),
    ]),
  );
  if (
    definitions.some(
      (definition) => normalizedSelection[definition.id].length === 0,
    )
  ) {
    return null;
  }

  const definitionIds = new Set(definitions.map((definition) => definition.id));
  const matches = getProductVariants(product)
    .filter((variant) => {
      const entries = Object.entries(variant.values).filter(([key]) =>
        definitionIds.has(key),
      );
      return (
        entries.length > 0 &&
        entries.every(([key, value]) =>
          normalizedSelection[key]?.includes(String(value)),
        )
      );
    })
    .sort((left, right) => {
      const specificity =
        Object.keys(right.values).filter((key) => definitionIds.has(key)).length -
        Object.keys(left.values).filter((key) => definitionIds.has(key)).length;
      if (specificity) return specificity;
      return getProductVariantKey(left).localeCompare(getProductVariantKey(right));
    });

  const linkedValues: Record<string, string> = {};
  [...matches].reverse().forEach((variant) => {
    Object.entries(variant.linked_values ?? {}).forEach(([key, value]) => {
      if (value !== "") linkedValues[key] = value;
    });
  });
  // Apply the most specific records last so combined matches override
  // information stored on each individual attribute.
  matches.forEach((variant) => {
    Object.entries(variant.linked_values ?? {}).forEach(([key, value]) => {
      if (value !== "" && linkedValues[key] === undefined)
        linkedValues[key] = value;
    });
  });

  const specificityOf = (variant: ProductVariant) =>
    Object.keys(variant.values).filter((key) => definitionIds.has(key)).length;
  const firstInventoryMatch = matches.find(
    (variant) =>
      hasOwnVariantValue(variant, "stock") &&
      hasOwnVariantValue(variant, "shelf_stock"),
  );
  const inventorySpecificity = firstInventoryMatch
    ? specificityOf(firstInventoryMatch)
    : -1;
  const stockSources = matches.filter(
    (variant) =>
      hasOwnVariantValue(variant, "stock") &&
      hasOwnVariantValue(variant, "shelf_stock") &&
      specificityOf(variant) === inventorySpecificity,
  );
  const shelfSources = stockSources;
  const stock = stockSources.length
    ? Math.min(...stockSources.map((variant) => getVariantStock(variant)))
    : null;
  const shelfStock = shelfSources.length
    ? Math.min(...shelfSources.map((variant) => getVariantStock(variant, true)))
    : stock;
  const values = Object.fromEntries(
    definitions.map((definition) => {
      const selected = normalizedSelection[definition.id];
      return [
        definition.id,
        definition.type === "multiple" ? selected : selected[0],
      ];
    }),
  );

  return {
    image_url: matches.find((variant) => variant.image_url)?.image_url,
    label: definitions
      .map(
        (definition) =>
          `${definition.name}: ${normalizedSelection[definition.id].join(", ")}`,
      )
      .join(" · "),
    linked_values: linkedValues,
    matches,
    selection: normalizedSelection,
    shelf_stock: shelfStock,
    stock,
    stock_sources: stockSources,
    values,
  };
}

export const linkedFieldLabels: Record<string, string> = {
  name: "Tên sản phẩm",
  sku: "EAN-13",
  category: "Nhóm hàng",
  description: "Mô tả",
  price: "Giá bán",
  cost_price: "Giá vốn",
  import_date: "Ngày nhập",
  expiry_date: "Hạn sử dụng",
  is_active: "Trạng thái",
  is_reward: "Sản phẩm đổi điểm",
  reward_points_cost: "Điểm cần đổi",
};

export const emptyForm: ProductFormState = {
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
  shelf_stock: "0",
};

export const fieldClassName =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-moss-400 focus:ring-4 focus:ring-moss-100";

export const labelClassName =
  "mb-1.5 block text-xs font-extrabold text-slate-700";

export const productFieldLabels: Record<string, string> = {
  image: "Hình ảnh",
  name: "Tên sản phẩm",
  sku: "EAN-13",
  category: "Nhóm hàng",
  description: "Mô tả",
  price: "Giá bán",
  cost_price: "Giá vốn",
  stock: "Tổng tồn kho",
  shelf_stock: "Tồn trên kệ",
  import_date: "Ngày nhập",
  expiry_date: "Hạn sử dụng",
  is_active: "Trạng thái",
  is_reward: "Sản phẩm đổi điểm",
  reward_points_cost: "Điểm cần đổi",
  color: "Màu sắc",
  size: "Kích thước",
};

export const attributeTypeLabels: Record<CustomAttributeType, string> = {
  text: "Văn bản",
  number: "Số",
  date: "Ngày",
  single: "Chọn một",
  multiple: "Chọn nhiều",
  media: "Ảnh & video",
};

export const productAttributeTypeOptions: ReadonlyArray<{
  value: CustomAttributeType;
  label: string;
}> = [
  { value: "text", label: "Văn bản" },
  { value: "number", label: "Số" },
  { value: "date", label: "Ngày tháng năm" },
  { value: "single", label: "Chọn duy nhất" },
  { value: "multiple", label: "Chọn nhiều" },
  { value: "media", label: "Hình ảnh & video" },
];

export const productOptionDisplayOptions = [
  { value: "text", label: "Chữ" },
  { value: "color", label: "Màu" },
  { value: "both", label: "Cả hai" },
] as const;

export const placeholderLabels: Record<string, string> = {
  name: "{#ten}",
  category: "{#nhomhang}",
  price: "{#giaban}",
  shelf_stock: "{#trenke}",
  stock: "{#tongton}",
  expiry_date: "{#hansudung}",
};

export const productBadgeToneClassNames = {
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-moss-100 text-moss-700",
  green: "bg-moss-100 text-moss-700",
  neutral: "bg-slate-100 text-slate-600",
} as const;

export const productCardSampleFallbacks = {
  name: "Tên sản phẩm",
  category: "Nhóm hàng",
  price: 20000,
  cost_price: 15000,
  stock: 20,
  shelf_stock: 10,
  sku: "8930000000000",
  description: "Mô tả sản phẩm",
  import_date: "2026-08-05",
  expiry_date: "2027-08-05",
  reward_points_cost: 100,
} as const;

export const productMediaSamplePlaceholder =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='160'%3E%3Crect width='100%25' height='100%25' fill='%23f1f5f9'/%3E%3C/svg%3E";

export function getProductCardEditorSampleValues(
  product?: Product | null,
): Record<string, string> {
  return {
    name: product?.name ?? productCardSampleFallbacks.name,
    category: product?.category ?? productCardSampleFallbacks.category,
    price: formatCurrency(product?.price ?? productCardSampleFallbacks.price),
    cost_price: formatCurrency(
      product?.cost_price ?? productCardSampleFallbacks.cost_price,
    ),
    stock: String(product?.stock ?? productCardSampleFallbacks.stock),
    shelf_stock: String(
      product?.shelf_stock ?? productCardSampleFallbacks.shelf_stock,
    ),
    sku: product?.sku ?? productCardSampleFallbacks.sku,
    description: product?.description ?? productCardSampleFallbacks.description,
    import_date: product?.import_date ?? productCardSampleFallbacks.import_date,
    expiry_date: product?.expiry_date ?? productCardSampleFallbacks.expiry_date,
    is_active: product?.is_active === false ? "Đang ẩn" : "Đang bán",
    is_reward: product?.is_reward ? "Có" : "Không",
    reward_points_cost: String(
      product?.reward_points_cost ??
        productCardSampleFallbacks.reward_points_cost,
    ),
  };
}

export function getProductDetailItems(
  product: Product,
) {
  return [
    { label: "EAN-13", value: getProductEan13Value(product) },
    { label: "Nhóm hàng", value: product.category || "Chưa phân nhóm" },
    { label: "Giá vốn", value: formatCurrency(product.cost_price) },
    { label: "Giá bán", value: formatCurrency(product.price) },
    { label: "Tổng tồn", value: String(product.stock) },
    { label: "Trên kệ", value: String(product.shelf_stock) },
    { label: "Trong kho", value: String(product.stock - product.shelf_stock) },
    { label: "Ngày nhập", value: product.import_date || "Chưa có" },
    { label: "Hạn sử dụng", value: product.expiry_date || "Chưa có" },
    {
      label: "Đổi điểm",
      value: product.is_reward
        ? `${product.reward_points_cost.toLocaleString("vi-VN")} điểm`
        : "Không",
    },
    { label: "Trạng thái", value: product.is_active ? "Đang hiện" : "Đang ẩn" },
  ];
}

export function getEnabledProductDetailItems(
  product: Product,
  settings: ProductSettings,
) {
  const items = [
    { key: "sku", label: "EAN-13", value: getProductEan13Value(product) || "Chưa có" },
    { key: "category", label: "Nhóm hàng", value: product.category || "Chưa phân nhóm" },
    { key: "price", label: "Giá bán", value: formatCurrency(product.price) },
    { key: "cost_price", label: "Giá vốn", value: formatCurrency(product.cost_price) },
    { key: "stock", label: "Tổng tồn", value: String(product.stock) },
    { key: "shelf_stock", label: "Trên kệ", value: String(product.shelf_stock) },
    { key: "stock", label: "Trong kho", value: String(product.stock - product.shelf_stock) },
    { key: "import_date", label: "Ngày nhập", value: product.import_date || "Chưa có" },
    { key: "expiry_date", label: "Hạn sử dụng", value: product.expiry_date || "Chưa có" },
    {
      key: "is_reward",
      label: "Sản phẩm đổi điểm",
      value: product.is_reward ? "Có" : "Không",
    },
    {
      key: "reward_points_cost",
      label: "Điểm cần đổi",
      value: product.is_reward
        ? `${product.reward_points_cost.toLocaleString("vi-VN")} điểm`
        : "Không áp dụng",
    },
    { key: "is_active", label: "Trạng thái", value: product.is_active ? "Đang hiện" : "Đang ẩn" },
  ];
  const order = new Map(settings.attributeOrder.map((key, index) => [key, index]));
  return items
    .filter((item) => settings.enabledFields[item.key] !== false)
    .sort(
      (left, right) =>
        (order.get(left.key) ?? 999) - (order.get(right.key) ?? 999),
    );
}

export function buildVariantCombinations(
  attributes: ProductSettings["customAttributes"],
  values: Record<string, unknown>,
  selectedAttributeIds?: string[],
) {
  const selectedIds = selectedAttributeIds
    ? new Set(selectedAttributeIds)
    : null;
  return attributes
    .filter(
      (item) =>
        item.enabled &&
        (selectedIds ? selectedIds.has(item.id) : item.useForVariants) &&
        (item.type === "single" || item.type === "multiple"),
    )
    .reduce<Record<string, string>[]>(
      (rows, attribute) => {
        const options =
          attribute.type === "single" || attribute.type === "multiple"
            ? attribute.options
            : [
                attribute.type === "media"
                  ? "Media"
                  : String(values[attribute.id] ?? "Chưa nhập"),
              ];
        return rows.flatMap((row) =>
          options.map((option) => ({
            ...row,
            [attribute.id]: option,
          })),
        );
      },
      [{}],
    )
    .slice(0, 100);
}
