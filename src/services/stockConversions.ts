import { productEngineClient } from "../features/products/services/client";
import { fetchAllRows } from "../lib/catalogData";
import { requireSupabaseConfig } from "../lib/supabase";

export type StockConversion = {
  id: string;
  product_id: string;
  variant_a_id: string;
  quantity_a: number;
  variant_b_id: string;
  quantity_b: number;
  updated_at: string;
};

export type StockConversionResult = {
  id: string;
  source_quantity: number;
  target_quantity: number;
  source_stock_after: number;
  target_stock_after: number;
};

function throwConversionError(error: { message: string; code?: string } | null, migration = "202610200001_stock_conversions.sql") {
  if (!error) return;
  if (["42P01", "PGRST202", "PGRST205"].includes(error.code ?? "")) {
    throw new Error(`Chức năng quy đổi chưa được cập nhật trên cơ sở dữ liệu. Cần chạy migration ${migration} để sử dụng.`);
  }
  throw new Error(error.message);
}

function singleResult<T>(data: T | T[] | null): T {
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error("Máy chủ không trả về kết quả quy đổi. Hãy tải lại trước khi tiếp tục.");
  return result;
}

export async function fetchStockConversions(): Promise<StockConversion[]> {
  requireSupabaseConfig();
  const rows = await fetchAllRows(async (first, last) => {
    const result = await productEngineClient.from("stock_conversions").select("*", { count: "exact" })
      .order("created_at").order("id").range(first, last);
    throwConversionError(result.error);
    return result;
  });
  return rows as StockConversion[];
}

export async function saveStockConversion(input: Omit<StockConversion, "id" | "updated_at"> & Partial<Pick<StockConversion, "id" | "updated_at">>) {
  requireSupabaseConfig();
  const { data, error } = await productEngineClient.rpc("save_stock_conversion", {
    product_id_input: input.product_id, variant_a_id_input: input.variant_a_id, quantity_a_input: input.quantity_a,
    variant_b_id_input: input.variant_b_id, quantity_b_input: input.quantity_b,
    conversion_id_input: input.id ?? null, expected_updated_at_input: input.updated_at ?? null,
  });
  throwConversionError(error);
  return singleResult(data) as StockConversion;
}

export async function executeStockConversion(input: { conversion: StockConversion; reversed: boolean; quantity: number; requestId: string; note: string }) {
  requireSupabaseConfig();
  const { data, error } = await productEngineClient.rpc("execute_stock_conversion", {
    conversion_id_input: input.conversion.id, reversed_input: input.reversed, quantity_input: input.quantity,
    request_id_input: input.requestId, expected_updated_at_input: input.conversion.updated_at, note_input: input.note,
  });
  throwConversionError(error);
  return singleResult(data) as StockConversionResult;
}

export async function deleteStockConversion(conversion: Pick<StockConversion, "id" | "updated_at">) {
  requireSupabaseConfig();
  const { error } = await productEngineClient.rpc("delete_stock_conversion", {
    conversion_id_input: conversion.id, expected_updated_at_input: conversion.updated_at,
  });
  throwConversionError(error, "202610200002_stock_conversion_management.sql");
}
