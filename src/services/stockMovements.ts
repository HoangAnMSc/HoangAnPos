import { requireSupabaseConfig, supabase } from "../lib/supabase";
import { productEngineClient } from "../features/products/services/client";
import { fetchProducts as fetchEngineProducts } from "../features/products/services/productEngine";
import type { Json } from "../types/database";

export type StockMovement = {
  id: string;
  movement_type: "in" | "out" | "sale" | "return" | "to_shelf" | "to_warehouse" | "adjustment";
  product_id: string;
  product_archived: boolean;
  quantity: number;
  reason: string | null;
  actor_name: string;
  created_at: string;
  products: { name: string; sku: string | null } | null;
};

export async function fetchWarehouseMovements() {
  requireSupabaseConfig();
  try {
    const [movements, products] = await Promise.all([
      productEngineClient.from("stock_movements").select("*").order("created_at", { ascending: false }).limit(200),
      fetchEngineProducts(),
    ]);
    if (movements.error) throw movements.error;
    const variants = new Map(products.flatMap((product) => product.variants.map((variant) => [variant.id, { product, variant }] as const)));
    return (movements.data ?? []).map((movement) => {
      const owner = variants.get(String(movement.variant_id));
      const snapshotProductId = typeof movement.product_id_snapshot === "string" ? movement.product_id_snapshot : "";
      const snapshotName = typeof movement.product_name_snapshot === "string" ? movement.product_name_snapshot.trim() : "";
      const snapshotSku = typeof movement.variant_sku_snapshot === "string" ? movement.variant_sku_snapshot.trim() : "";
      const productName = snapshotName || owner?.product.name || "";
      const sku = snapshotSku || owner?.variant.sku || "";
      return {
        ...movement,
        product_id: snapshotProductId || owner?.product.id || "",
        product_archived: Boolean(snapshotProductId && !owner),
        quantity: movement.movement_type === "adjustment"
          ? Number(movement.quantity)
          : Math.abs(Number(movement.quantity)),
        products: productName
          ? { name: `${productName}${sku ? ` · ${sku}` : ""}`, sku: sku || null }
          : null,
      };
    }) as StockMovement[];
  } catch (engineError) {
    if (!(engineError instanceof Error) || !/variant_id|schema cache|does not exist/i.test(engineError.message)) throw engineError;
  }
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id,movement_type,product_id,quantity,reason,actor_name,created_at,products(name,sku)")
    .in("movement_type", ["in", "out"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((movement) => ({
    ...movement,
    product_archived: false,
    quantity: Math.abs(Number(movement.quantity)),
  })) as unknown as StockMovement[];
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

export async function receiveVariantStock(input: {
  variantId: string;
  quantity: number;
  importDate?: string | null;
  expiryDate?: string | null;
}) {
  requireSupabaseConfig();
  const { data, error } = await productEngineClient.rpc("receive_variant_stock", {
    variant_id_input: input.variantId,
    quantity_input: Math.floor(input.quantity),
    import_date_input: input.importDate ?? null,
    expiry_date_input: input.expiryDate ?? null,
  });
  if (error) throw error;
  return data;
}

export async function issueVariantStock(
  variantId: string,
  quantity: number,
  reason: string,
) {
  requireSupabaseConfig();
  const { data, error } = await productEngineClient.rpc("issue_variant_stock", {
    variant_id_input: variantId,
    quantity_input: Math.floor(quantity),
    reason_input: reason.trim(),
  });
  if (error) throw error;
  return data;
}

export type VariantStockLine = { variantId: string; quantity: number };

export async function receiveVariantStocks(lines: VariantStockLine[]) {
  requireSupabaseConfig();
  const { data, error } = await productEngineClient.rpc("bulk_receive_variant_stock", {
    items_input: lines.map((line) => ({ variant_id: line.variantId, quantity: Math.floor(line.quantity) })) as Json,
  });
  if (error) throw error;
  return data;
}

export async function issueVariantStocks(lines: VariantStockLine[], reason: string) {
  requireSupabaseConfig();
  const { data, error } = await productEngineClient.rpc("bulk_issue_variant_stock", {
    items_input: lines.map((line) => ({ variant_id: line.variantId, quantity: Math.floor(line.quantity) })) as Json,
    reason_input: reason.trim(),
  });
  if (error) throw error;
  return data;
}
