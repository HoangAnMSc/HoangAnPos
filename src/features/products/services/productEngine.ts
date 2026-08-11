import type { Json } from "../../../types/database";
import { requireSupabaseConfig } from "../../../lib/supabase";
import type {
  Product,
  ProductAttribute,
  ProductEditorInput,
  ProductImage,
  ProductSpecification,
  ProductType,
  ProductTypeAttribute,
  ProductVariant,
  VariantAttribute,
  VariantValue,
} from "../types";
import { createSkuPrefix } from "../utils/variants";
import { productEngineClient } from "./client";

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function fetchProductTypes(): Promise<ProductType[]> {
  requireSupabaseConfig();
  const { data, error } = await productEngineClient
    .from("product_types")
    .select("*")
    .order("name");
  throwIfError(error);
  return (data ?? []) as ProductType[];
}

export async function saveProductType(
  input: Pick<ProductType, "name" | "code" | "description" | "is_active"> & {
    id?: string;
  },
) {
  const { data, error } = await productEngineClient
    .from("product_types")
    .upsert(input)
    .select("*")
    .single();
  throwIfError(error);
  return data as ProductType;
}

export async function deleteProductType(productTypeId: string) {
  const { error } = await productEngineClient
    .from("product_types")
    .delete()
    .eq("id", productTypeId);
  throwIfError(error);
}

export async function fetchProductTypeAttributes(): Promise<
  ProductTypeAttribute[]
> {
  const { data, error } = await productEngineClient
    .from("product_type_attributes")
    .select("*")
    .order("sort_order");
  throwIfError(error);
  return (data ?? []) as ProductTypeAttribute[];
}

export async function saveProductTypeAttributes(
  productTypeId: string,
  rows: Omit<ProductTypeAttribute, "product_type_id">[],
) {
  const removed = await productEngineClient
    .from("product_type_attributes")
    .delete()
    .eq("product_type_id", productTypeId);
  throwIfError(removed.error);
  if (!rows.length) return;
  const inserted = await productEngineClient
    .from("product_type_attributes")
    .insert(rows.map((row) => ({ ...row, product_type_id: productTypeId })));
  throwIfError(inserted.error);
}

export async function fetchAttributes(): Promise<ProductAttribute[]> {
  const { data, error } = await productEngineClient
    .from("product_attributes")
    .select("*")
    .order("name");
  throwIfError(error);
  return (data ?? []) as ProductAttribute[];
}

export async function saveAttribute(
  input: Pick<
    ProductAttribute,
    "name" | "code" | "data_type" | "input_type" | "unit" | "is_active"
  > & { id?: string },
) {
  const { data, error } = await productEngineClient
    .from("product_attributes")
    .upsert(input)
    .select("*")
    .single();
  throwIfError(error);
  return data as ProductAttribute;
}

export async function deleteAttribute(attributeId: string) {
  const { error } = await productEngineClient
    .from("product_attributes")
    .delete()
    .eq("id", attributeId);
  throwIfError(error);
}

export async function fetchCategories() {
  const { data, error } = await productEngineClient
    .from("product_categories")
    .select("*")
    .order("name");
  throwIfError(error);
  return (data ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
  }>;
}

export async function fetchProducts(): Promise<Product[]> {
  requireSupabaseConfig();
  const [
    productsResult,
    specsResult,
    attributesResult,
    valuesResult,
    variantsResult,
    linksResult,
    imagesResult,
    typesResult,
    categoriesResult,
  ] = await Promise.all([
    productEngineClient
      .from("products")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    productEngineClient
      .from("product_specifications")
      .select("*")
      .order("sort_order"),
    productEngineClient
      .from("product_variant_attributes")
      .select("*")
      .order("sort_order"),
    productEngineClient
      .from("product_variant_values")
      .select("*")
      .order("sort_order"),
    productEngineClient
      .from("product_variants")
      .select("*")
      .order("created_at"),
    productEngineClient.from("variant_value_links").select("*"),
    productEngineClient.from("product_images").select("*").order("sort_order"),
    productEngineClient.from("product_types").select("id,name,code"),
    productEngineClient.from("product_categories").select("id,name,slug"),
  ]);
  [
    productsResult,
    specsResult,
    attributesResult,
    valuesResult,
    variantsResult,
    linksResult,
    imagesResult,
    typesResult,
    categoriesResult,
  ].forEach((result) => throwIfError(result.error));
  const specs = (specsResult.data ?? []) as ProductSpecification[];
  const attributes = (attributesResult.data ?? []) as Array<
    Omit<VariantAttribute, "values">
  >;
  const values = (valuesResult.data ?? []) as VariantValue[];
  const variants = (variantsResult.data ?? []) as Array<
    Omit<ProductVariant, "value_ids" | "image_url" | "cloudinary_public_id">
  >;
  const links = (linksResult.data ?? []) as Array<{
    variant_id: string;
    variant_value_id: string;
  }>;
  const images = (imagesResult.data ?? []) as ProductImage[];
  const types = (typesResult.data ?? []) as Array<{
    id: string;
    name: string;
    code: string;
  }>;
  const categories = (categoriesResult.data ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  return (
    (productsResult.data ?? []) as Array<
      Omit<
        Product,
        "specifications" | "variant_attributes" | "variants" | "images"
      >
    >
  ).map((product) => ({
    ...product,
    product_type:
      types.find((item) => item.id === product.product_type_id) ?? null,
    category:
      categories.find((item) => item.id === product.category_id) ?? null,
    specifications: specs.filter((item) => item.product_id === product.id),
    variant_attributes: attributes
      .filter((item) => item.product_id === product.id)
      .map((attribute) => ({
        ...attribute,
        values: values.filter(
          (value) => value.variant_attribute_id === attribute.id,
        ),
      })),
    variants: variants
      .filter((item) => item.product_id === product.id)
      .map((variant) => {
        const image = images.find(
          (item) => item.variant_id === variant.id && item.is_primary,
        );
        return {
          ...variant,
          value_ids: links
            .filter((link) => link.variant_id === variant.id)
            .map((link) => link.variant_value_id),
          image_url: image?.image_url ?? null,
          cloudinary_public_id: image?.cloudinary_public_id ?? null,
        };
      }),
    images: images.filter(
      (item) =>
        item.product_id === product.id &&
        !item.variant_id &&
        !item.variant_value_id,
    ),
  }));
}

export async function saveProduct(input: ProductEditorInput) {
  let slugQuery = productEngineClient
    .from("products")
    .select("id,slug")
    .like("slug", `${input.slug}%`);
  if (input.id) slugQuery = slugQuery.neq("id", input.id);
  const { data: slugRows, error: slugError } = await slugQuery;
  throwIfError(slugError);
  const usedSlugs = new Set(
    ((slugRows ?? []) as Array<{ slug: string }>).map((row) => row.slug),
  );
  let uniqueSlug = input.slug;
  let slugSuffix = 2;
  while (usedSlugs.has(uniqueSlug)) {
    uniqueSlug = `${input.slug}-${slugSuffix++}`;
  }
  const originalPrefix = createSkuPrefix(input.slug);
  const uniquePrefix = createSkuPrefix(uniqueSlug);
  const inputVariantIds = new Set(
    input.variants
      .map((variant) => variant.id)
      .filter((id): id is string => Boolean(id)),
  );
  const { data: skuRows, error: skuError } = await productEngineClient
    .from("product_variants")
    .select("id,sku");
  throwIfError(skuError);
  const usedSkus = new Set(
    ((skuRows ?? []) as Array<{ id: string; sku: string }>)
      .filter((row) => !inputVariantIds.has(row.id))
      .map((row) => row.sku),
  );
  const normalizedVariants = input.variants.map((variant) => {
    const generatedSku =
      uniqueSlug !== input.slug && variant.sku.startsWith(`${originalPrefix}-`)
        ? `${uniquePrefix}${variant.sku.slice(originalPrefix.length)}`
        : variant.sku;
    let uniqueSku = generatedSku;
    let skuSuffix = 2;
    while (usedSkus.has(uniqueSku))
      uniqueSku = `${generatedSku}-${skuSuffix++}`;
    usedSkus.add(uniqueSku);
    return { ...variant, sku: uniqueSku };
  });
  const payload: ProductEditorInput = {
    ...input,
    slug: uniqueSlug,
    specifications: input.specifications.map((item) => ({
      ...item,
      id: item.id ?? crypto.randomUUID(),
    })),
    variants: normalizedVariants.map((item) => ({
      ...item,
      id: item.id ?? crypto.randomUUID(),
    })),
    images: input.images
      .filter((item) => item.image_url.trim())
      .map((item) => ({ ...item, id: item.id ?? crypto.randomUUID() })),
  };
  const { data, error } = await productEngineClient.rpc("save_product_engine", {
    payload: payload as unknown as Json,
  });
  throwIfError(error);
  return data;
}

export async function archiveProduct(productId: string) {
  const { error } = await productEngineClient
    .from("products")
    .update({ deleted_at: new Date().toISOString(), status: "inactive" })
    .eq("id", productId);
  throwIfError(error);
}

export async function adjustVariantStock(
  variantId: string,
  stockDelta: number,
  reason: string,
) {
  const { data, error } = await productEngineClient.rpc(
    "adjust_variant_stock",
    {
      variant_id_input: variantId,
      quantity_delta_input: stockDelta,
      shelf_delta_input: stockDelta,
      reason_input: reason,
    },
  );
  throwIfError(error);
  return data;
}
