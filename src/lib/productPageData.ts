import type {
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
  batchTotal: number,
  activeBatchCount: number,
) {
  return [
    { label: "EAN-13", value: getProductEan13Value(product) },
    { label: "Nhóm hàng", value: product.category || "Chưa phân nhóm" },
    { label: "Giá vốn", value: formatCurrency(product.cost_price) },
    { label: "Giá bán", value: formatCurrency(product.price) },
    { label: "Tổng tồn", value: String(product.stock) },
    { label: "Trên kệ", value: String(product.shelf_stock) },
    { label: "Trong kho", value: String(product.stock - product.shelf_stock) },
    { label: "Tồn theo lô", value: `${batchTotal} / ${activeBatchCount} lô` },
    { label: "Trạng thái", value: product.is_active ? "Đang hiện" : "Đang ẩn" },
  ];
}

export function buildVariantCombinations(
  attributes: ProductSettings["customAttributes"],
  values: Record<string, unknown>,
) {
  return attributes
    .filter((item) => item.enabled && item.useForVariants)
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
