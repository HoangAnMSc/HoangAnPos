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

  const { data, error } = await supabase.from("products").insert(input).select("*").single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateProduct(id: string, input: ProductInput) {
  requireSupabaseConfig();

  const { data, error } = await supabase
    .from("products")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
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
