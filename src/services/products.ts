import { requireSupabaseConfig, supabase } from "../lib/supabase";
import type { Product, ProductBatch } from "../types";

const missingCategoryTableMessage =
  "Database chua co bang product_categories. Hay chay lai supabase/schema.sql roi thu lai.";

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
  image_url?: string | null;
  is_active: boolean;
};

export type ReceiveStockInput = {
  expiry_date?: string | null;
  import_date?: string | null;
  product_id: string;
  quantity: number;
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
      delete payload[field];
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

function withoutDescription(input: ProductInput) {
  const payload = createProductPayload(input);
  delete payload.description;
  return payload;
}

export async function fetchProducts() {
  requireSupabaseConfig();

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchProductBatches(productId?: string) {
  requireSupabaseConfig();

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
    throw new Error("Nhap ten category.");
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
        "Database products chua co cot ngay nhap/ngay het han. Hay chay SQL migration roi thu lai."
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
        "Database products chua co cot ngay nhap/ngay het han. Hay chay SQL migration roi thu lai."
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

export async function deleteProduct(id: string) {
  requireSupabaseConfig();

  const { error } = await supabase.from("products").delete().eq("id", id);

  if (error) {
    throw error;
  }
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
