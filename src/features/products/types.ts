import type { Json } from "../../types/database";

export type AttributeDataType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "option"
  | "json";
export type AttributeInputType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "multi_select"
  | "radio"
  | "checkbox"
  | "switch"
  | "date"
  | "color"
  | "image"
  | "image_text";
export type VariantDisplayType =
  | "color_circle"
  | "text_button"
  | "image"
  | "image_text"
  | "dropdown";
export type ProductStatus = "draft" | "active" | "inactive";

export type ProductType = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductAttribute = {
  id: string;
  name: string;
  code: string;
  data_type: AttributeDataType;
  input_type: AttributeInputType;
  unit: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductTypeAttribute = {
  product_type_id: string;
  attribute_id: string;
  role: "specification" | "variant";
  is_required: boolean;
  display_type: VariantDisplayType | null;
  sort_order: number;
};

export type ProductSpecification = {
  id: string;
  product_id: string;
  attribute_id: string | null;
  name: string;
  code: string;
  data_type: AttributeDataType;
  input_type: AttributeInputType;
  unit: string | null;
  value: Json;
  is_required: boolean;
  sort_order: number;
};

export type VariantValue = {
  id: string;
  variant_attribute_id: string;
  label: string;
  value: string;
  metadata: {
    hex?: string;
    image_url?: string;
    cloudinary_public_id?: string;
  } & Record<string, Json | undefined>;
  sort_order: number;
  is_active: boolean;
};

export type VariantAttribute = {
  id: string;
  product_id: string;
  source_attribute_id: string | null;
  name: string;
  code: string;
  data_type: AttributeDataType;
  display_type: VariantDisplayType;
  is_required: boolean;
  sort_order: number;
  values: VariantValue[];
};

export type ProductVariant = {
  id: string;
  product_id: string;
  sku: string;
  barcode: string | null;
  base_price: number;
  compare_at_price: number | null;
  cost_price: number;
  stock_quantity: number;
  shelf_quantity: number;
  weight: number | null;
  is_default: boolean;
  is_active: boolean;
  value_ids: string[];
  image_url: string | null;
  cloudinary_public_id: string | null;
};

export type ProductImage = {
  id: string;
  product_id: string;
  variant_id: string | null;
  variant_value_id: string | null;
  image_url: string;
  cloudinary_public_id: string | null;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
};

export type Product = {
  id: string;
  product_type_id: string | null;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  status: ProductStatus;
  is_reward: boolean;
  reward_points_cost: number;
  seo_title: string | null;
  seo_description: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  product_type?: Pick<ProductType, "id" | "name" | "code"> | null;
  category?: { id: string; name: string; slug: string } | null;
  specifications: ProductSpecification[];
  variant_attributes: VariantAttribute[];
  variants: ProductVariant[];
  images: ProductImage[];
};

export type VariantDraft = Omit<ProductVariant, "id" | "product_id"> & {
  id?: string;
};
export type VariantSelection = Record<string, string>;

export type ProductEditorInput = Pick<
  Product,
  | "name"
  | "slug"
  | "description"
  | "status"
  | "product_type_id"
  | "category_id"
  | "is_reward"
  | "reward_points_cost"
  | "seo_title"
  | "seo_description"
> & {
  id?: string;
  specifications: Array<
    Omit<ProductSpecification, "id" | "product_id"> & { id?: string }
  >;
  variant_attributes: VariantAttribute[];
  variants: VariantDraft[];
  images: Array<Omit<ProductImage, "id" | "product_id"> & { id?: string }>;
};
