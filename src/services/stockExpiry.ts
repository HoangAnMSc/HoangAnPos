import { productEngineClient } from "../features/products/services/client";
import { fetchAllRows } from "../lib/catalogData";
import { requireSupabaseConfig } from "../lib/supabase";
import type { ExpiryLot, ExpiryVariantState } from "../lib/stockExpiry";

export type StockExpirySettings = { warning_days: number; updated_at: string };
export type ExpiryAllocation = { expiry_date: string; quantity: number };

export function throwStockExpiryError(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (["42P01", "PGRST202", "PGRST205"].includes(error.code ?? "")) {
    throw new Error("Chức năng HSD chưa được cập nhật trên cơ sở dữ liệu. Vui lòng cập nhật hệ thống rồi thử lại.");
  }
  throw new Error(error.message);
}

export async function fetchStockExpiry() {
  requireSupabaseConfig();
  const [variants, settingsResult] = await Promise.all([
    fetchAllRows<ExpiryVariantState>(async (first, last) => {
      const result = await productEngineClient.rpc("list_stock_expiry", undefined, { count: "exact" }).range(first, last);
      throwStockExpiryError(result.error);
      return result;
    }),
    productEngineClient.from("stock_expiry_settings").select("warning_days,updated_at").eq("id", true).single(),
  ]);
  throwStockExpiryError(settingsResult.error);
  return { variants, settings: settingsResult.data as StockExpirySettings };
}

export async function assignStockExpiry(lot: Pick<ExpiryLot, "id" | "updated_at">, allocations: ExpiryAllocation[], requestId: string) {
  requireSupabaseConfig();
  const { error } = await productEngineClient.rpc("assign_stock_expiry", {
    lot_id_input: lot.id, expected_updated_at_input: lot.updated_at, allocations_input: allocations, request_id_input: requestId,
  });
  throwStockExpiryError(error);
}

export async function prepareStockExpiry(variantId: string) {
  requireSupabaseConfig();
  const { data, error } = await productEngineClient.rpc("prepare_stock_expiry", { variant_id_input: variantId });
  throwStockExpiryError(error);
  if (!data) throw new Error("Không tìm thấy số hàng để nhập HSD. Hãy tải lại.");
  return data;
}

export async function setStockExpiry(variantId: string, lots: Pick<ExpiryLot, "id" | "updated_at">[], allocations: ExpiryAllocation[], requestId: string) {
  requireSupabaseConfig();
  const { error } = await productEngineClient.rpc("set_stock_expiry", {
    variant_id_input: variantId, lots_input: lots.map(({ id, updated_at }) => ({ id, updated_at })), allocations_input: allocations, request_id_input: requestId,
  });
  throwStockExpiryError(error);
}

export async function clearStockExpiry(variantId: string, lots: Pick<ExpiryLot, "id" | "updated_at">[], requestId: string) {
  requireSupabaseConfig();
  const { error } = await productEngineClient.rpc("clear_stock_expiry", {
    variant_id_input: variantId, lots_input: lots.map(({ id, updated_at }) => ({ id, updated_at })), request_id_input: requestId,
  });
  throwStockExpiryError(error);
}

export async function saveStockExpirySettings(warningDays: number, settings: StockExpirySettings) {
  requireSupabaseConfig();
  const { data, error } = await productEngineClient.rpc("save_stock_expiry_settings", {
    warning_days_input: warningDays, expected_updated_at_input: settings.updated_at,
  });
  throwStockExpiryError(error);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error("Không nhận được cài đặt HSD. Hãy tải lại.");
  return result as StockExpirySettings;
}
