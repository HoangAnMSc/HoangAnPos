import { requireSupabaseConfig, supabase } from "../lib/supabase";
import type { Product, ProductBatch } from "../types";
import type { Json } from "../types/database";
import { fetchProducts as fetchEngineProducts } from "../features/products/services/productEngine";
import { productEngineClient } from "../features/products/services/client";

const missingCategoryTableMessage =
  "Cơ sở dữ liệu chưa có bảng product_categories. Hãy chạy lại supabase/schema.sql rồi thử lại.";

export type ProductInput = {
  name: string;
  sku?: string | null;
  category?: string | null;
  description?: string | null;
  price: number;
  cost_price: number;
  import_date?: string | null;
  expiry_date?: string | null;
  stock: number;
  shelf_stock?: number;
  image_url?: string | null;
  is_active: boolean;
  is_reward: boolean;
  reward_points_cost: number;
  attributes?: Json;
};

export type ReceiveStockInput = {
  expiry_date?: string | null;
  import_date?: string | null;
  product_id: string;
  quantity: number;
};

export type InventoryCountProduct = Pick<
  Product,
  "category" | "expiry_date" | "id" | "image_url" | "is_active" | "name" | "sku"
>;

export type DeleteProductResult = {
  mode: "deleted" | "soft-deleted" | "hidden";
};

const nullableProductFields = [
  "sku",
  "category",
  "description",
  "import_date",
  "expiry_date",
  "image_url",
] as const;

function createProductPayload(input: ProductInput) {
  const payload = { ...input };

  nullableProductFields.forEach((field) => {
    if (payload[field] === null || payload[field] === "") {
      payload[field] = null;
    }
  });

  return payload;
}

function isMissingDescriptionColumn(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    error.code === "PGRST204" &&
    typeof error.message === "string" &&
    error.message.includes("'description' column")
  );
}

function isMissingDateColumn(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    error.code === "PGRST204" &&
    typeof error.message === "string" &&
    (error.message.includes("'import_date' column") ||
      error.message.includes("'expiry_date' column"))
  );
}

function isMissingProductCategoriesTable(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    (error.code === "PGRST205" || error.code === "42P01") &&
    typeof error.message === "string" &&
    error.message.includes("product_categories")
  );
}

function isDuplicateKey(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function isForeignKeyViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23503"
  );
}

function isMissingDeletedAtColumn(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    (error.message.includes("'deleted_at' column") ||
      error.message.includes("deleted_at") ||
      error.message.includes("products_deleted_at"))
  );
}

function withoutDescription(input: ProductInput) {
  const payload = createProductPayload(input);
  delete payload.description;
  return payload;
}

export async function fetchProducts() {
  requireSupabaseConfig();

  try {
    const engineProducts = await fetchEngineProducts();
    return engineProducts.map((product): Product => {
      const activeVariants = product.variants.filter((variant) => variant.is_active);
      const variants = activeVariants.length ? activeVariants : product.variants;
      const defaultVariant = [...variants].sort(
        (first, second) =>
          first.base_price - second.base_price ||
          Number(second.is_default) - Number(first.is_default),
      )[0];
      const valuesById = new Map(product.variant_attributes.flatMap((attribute) => attribute.values.map((value) => [value.id, { attribute, value }] as const)));
      const attributes: Record<string, Json | undefined> = {
        _defaultVariantId: defaultVariant?.id,
        _variantAttributeIds: product.variant_attributes.map((attribute) => attribute.id),
        _variants: variants.map((variant) => ({
          values: Object.fromEntries(variant.value_ids.map((id) => {
            const item = valuesById.get(id);
            return [item?.attribute.id ?? id, item?.value.label ?? id];
          })),
          stock: variant.stock_quantity,
          shelf_stock: variant.stock_quantity,
          image_url: variant.image_url ?? undefined,
          linked_values: {
            _variant_id: variant.id,
            sku: variant.sku,
            price: String(variant.base_price),
            cost_price: String(variant.cost_price),
            compare_at_price: variant.compare_at_price == null ? "" : String(variant.compare_at_price),
          },
        })),
      };
      product.variant_attributes.forEach((attribute) => { attributes[attribute.id] = attribute.values.filter((value) => value.is_active).map((value) => value.label); });
      product.specifications.forEach((specification) => { attributes[specification.code] = specification.value; });
      const primary = product.images.find((image) => image.is_primary) ?? product.images[0];
      return {
        id: product.id, name: product.name, sku: defaultVariant?.barcode ?? defaultVariant?.sku ?? null,
        category: product.category?.name ?? product.product_type?.name ?? null, description: product.description,
        price: defaultVariant?.base_price ?? 0, cost_price: defaultVariant?.cost_price ?? 0,
        import_date: null, expiry_date: null,
        stock: variants.reduce((sum, variant) => sum + variant.stock_quantity, 0),
        shelf_stock: variants.reduce((sum, variant) => sum + variant.stock_quantity, 0),
        // The product image is the neutral card/picker image. A SKU image only
        // takes over after the customer explicitly selects that SKU.
        image_url: primary?.image_url ?? defaultVariant?.image_url ?? null,
        is_active: product.status === "active", is_reward: product.is_reward,
        reward_points_cost: product.reward_points_cost, attributes: attributes as Json,
        deleted_at: product.deleted_at, created_at: product.created_at, updated_at: product.updated_at,
      };
    });
  } catch (engineError) {
    if (!(engineError instanceof Error) || !/product_types|product_variant|schema cache|does not exist/i.test(engineError.message)) throw engineError;
  }

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingDeletedAtColumn(error)) {
      const fallback = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

      if (!fallback.error) {
        return fallback.data ?? [];
      }
    }

    throw error;
  }

  return data ?? [];
}

export async function fetchInventoryCountProducts(): Promise<InventoryCountProduct[]> {
  requireSupabaseConfig();

  try {
    const products = await fetchEngineProducts();
    return products.flatMap((product) => {
      const labels = new Map(product.variant_attributes.flatMap((attribute) =>
        attribute.values.map((value) => [value.id, value.label] as const),
      ));
      const primaryImage = product.images.find((image) => image.is_primary)?.image_url
        ?? product.images[0]?.image_url
        ?? null;
      return product.variants.filter((variant) => variant.is_active).map((variant) => {
        const selectedValues = variant.value_ids.map((id) => labels.get(id)).filter(Boolean).join(" / ");
        return {
          id: variant.id,
          name: selectedValues ? `${product.name} · ${selectedValues}` : product.name,
          sku: variant.barcode ?? variant.sku,
          category: product.category?.name ?? null,
          image_url: variant.image_url ?? primaryImage,
          is_active: product.status === "active" && variant.is_active,
          expiry_date: null,
        };
      });
    });
  } catch (engineError) {
    if (!(engineError instanceof Error) || !/product_types|product_variant|schema cache|does not exist/i.test(engineError.message)) throw engineError;
  }

  const fields = "id,name,sku,category,image_url,is_active,expiry_date";
  const { data, error } = await supabase
    .from("products")
    .select(fields)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) {
    if (isMissingDeletedAtColumn(error)) {
      const fallback = await supabase.from("products").select(fields).order("name", {
        ascending: true,
      });

      if (!fallback.error) {
        return fallback.data ?? [];
      }
    }

    throw error;
  }

  return data ?? [];
}

export async function fetchProductBatches(productId?: string) {
  requireSupabaseConfig();

  try {
    const [{ data: batches, error }, { data: variants, error: variantError }] = await Promise.all([
      productEngineClient.from("product_batches").select("*").gt("quantity", 0).order("expiry_date", { ascending: true, nullsFirst: false }),
      productEngineClient.from("product_variants").select("id,product_id"),
    ]);
    if (error) throw error;
    if (variantError) throw variantError;
    const productByVariant = new Map((variants ?? []).map((variant) => [String(variant.id), String(variant.product_id)]));
    return (batches ?? []).map((batch) => ({ ...batch, product_id: productByVariant.get(String(batch.variant_id)) ?? "" }))
      .filter((batch) => !productId || batch.product_id === productId) as ProductBatch[];
  } catch (engineError) {
    if (!(engineError instanceof Error) || !/product_variant|variant_id|schema cache|does not exist/i.test(engineError.message)) throw engineError;
  }

  let query = supabase
    .from("product_batches")
    .select("*")
    .gt("quantity", 0)
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("import_date", { ascending: true, nullsFirst: false });

  if (productId) {
    query = query.eq("product_id", productId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchProductCategories() {
  requireSupabaseConfig();

  const { data, error } = await supabase
    .from("product_categories")
    .select("name")
    .order("name", { ascending: true });

  if (error) {
    if (isMissingProductCategoriesTable(error)) {
      return [];
    }

    throw error;
  }

  return (data ?? []).map((category) => category.name);
}

export async function createProductCategory(name: string) {
  requireSupabaseConfig();

  const nextName = name.trim();
  if (!nextName) {
    throw new Error("Nhập tên nhóm hàng.");
  }

  const { data, error } = await supabase
    .from("product_categories")
    .insert({ name: nextName })
    .select("name")
    .single();

  if (error) {
    if (isMissingProductCategoriesTable(error)) {
      throw new Error(missingCategoryTableMessage);
    }

    if (isDuplicateKey(error)) {
      const categories = await fetchProductCategories();
      return (
        categories.find((category) => category.toLowerCase() === nextName.toLowerCase()) ??
        nextName
      );
    }

    throw error;
  }

  return data.name;
}

export async function createProduct(input: ProductInput) {
  requireSupabaseConfig();

  const payload = createProductPayload(input);
  const { data, error } = await supabase.from("products").insert(payload).select("*").single();

  if (error) {
    if (isMissingDateColumn(error)) {
      throw new Error(
        "Bảng products chưa có cột ngày nhập/ngày hết hạn. Hãy chạy SQL migration rồi thử lại."
      );
    }

    if (isMissingDescriptionColumn(error)) {
      const retry = await supabase
        .from("products")
        .insert(withoutDescription(input))
        .select("*")
        .single();

      if (!retry.error) {
        return retry.data;
      }
    }

    throw error;
  }

  if (data.stock > 0) {
    await createProductBatch({
      expiry_date: data.expiry_date,
      import_date: data.import_date,
      product_id: data.id,
      quantity: data.stock,
    });
  }

  return data;
}

export async function updateProduct(id: string, input: ProductInput) {
  requireSupabaseConfig();

  const payload = createProductPayload(input);
  const { data, error } = await supabase
    .from("products")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (isMissingDateColumn(error)) {
      throw new Error(
        "Bảng products chưa có cột ngày nhập/ngày hết hạn. Hãy chạy SQL migration rồi thử lại."
      );
    }

    if (isMissingDescriptionColumn(error)) {
      const retry = await supabase
        .from("products")
        .update(withoutDescription(input))
        .eq("id", id)
        .select("*")
        .single();

      if (!retry.error) {
        return retry.data;
      }
    }

    throw error;
  }

  return data;
}

export async function updateProductActive(id: string, isActive: boolean) {
  requireSupabaseConfig();

  const { data, error } = await supabase.rpc("set_product_active", {
    is_active_input: isActive,
    product_id_input: id,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteProduct(id: string): Promise<DeleteProductResult> {
  requireSupabaseConfig();

  const { error } = await supabase.from("products").delete().eq("id", id);

  if (error) {
    if (isForeignKeyViolation(error)) {
      return softDeleteProduct(id);
    }

    throw error;
  }

  return { mode: "deleted" };
}

async function softDeleteProduct(id: string): Promise<DeleteProductResult> {
  const { error } = await supabase.rpc("soft_delete_product", { product_id_input: id });
  if (error) throw error;
  return { mode: "soft-deleted" };
}

export async function receiveProductStock(input: ReceiveStockInput) {
  requireSupabaseConfig();

  const { data, error } = await supabase.rpc("receive_product_stock", {
    expiry_date_input: input.expiry_date ?? null,
    import_date_input: input.import_date ?? null,
    product_id_input: input.product_id,
    quantity_input: Math.floor(input.quantity),
  });

  if (error) {
    throw error;
  }

  return data;
}

async function createProductBatch(input: ReceiveStockInput): Promise<ProductBatch> {
  const { data, error } = await supabase
    .from("product_batches")
    .insert({
      expiry_date: input.expiry_date,
      import_date: input.import_date,
      product_id: input.product_id,
      quantity: Math.floor(input.quantity),
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export function getActiveProducts(products: Product[]) {
  return products.filter((product) => product.is_active);
}
