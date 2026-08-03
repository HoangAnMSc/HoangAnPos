import { requireSupabaseConfig, supabase } from "../lib/supabase";

export type StockMovement = {
  id: string;
  movement_type: "in" | "out" | "to_shelf" | "to_warehouse";
  product_id: string;
  quantity: number;
  reason: string | null;
  actor_name: string;
  created_at: string;
  products: { name: string; sku: string | null } | null;
};

export async function fetchStockMovements(type: "in" | "out") {
  requireSupabaseConfig();
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id,movement_type,product_id,quantity,reason,actor_name,created_at,products(name,sku)")
    .eq("movement_type", type)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as StockMovement[];
}

export async function fetchShelfMovements() {
  requireSupabaseConfig();
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id,movement_type,product_id,quantity,reason,actor_name,created_at,products(name,sku)")
    .in("movement_type", ["to_shelf", "to_warehouse"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as StockMovement[];
}

export async function issueProductStock(productId: string, quantity: number, reason: string) {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc("issue_product_stock", {
    product_id_input: productId,
    quantity_input: Math.floor(quantity),
    reason_input: reason.trim(),
  });
  if (error) throw error;
  return data;
}
