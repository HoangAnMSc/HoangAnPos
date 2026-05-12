import { requireSupabaseConfig, supabase } from "../lib/supabase";
import type { Product } from "../types";

export type ProductInput = {
  name: string;
  sku?: string | null;
  category?: string | null;
  description?: string | null;
  price: number;
  cost_price: number;
  stock: number;
  image_url?: string | null;
  is_active: boolean;
};

const nullableProductFields = ["sku", "category", "description", "image_url"] as const;

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

export async function createProduct(input: ProductInput) {
  requireSupabaseConfig();

  const payload = createProductPayload(input);
  const { data, error } = await supabase.from("products").insert(payload).select("*").single();

  if (error) {
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

export function getActiveProducts(products: Product[]) {
  return products.filter((product) => product.is_active);
}
