import { requireSupabaseConfig } from "../../../lib/supabase";
import { normalizeEan13Input } from "../../../lib/productDisplay";
import { productEngineClient } from "./client";
import { fetchAllRows, fetchRowsForIds } from "../../../lib/catalogData";

export type ProductBarcodeReservation = {
  id: string;
  product_id: string;
  sku: string;
  barcode: string;
  is_active: boolean;
  products: { name: string; deleted_at: string | null } | null;
};

// Retired SKUs still reserve codes. soft_delete_product releases deleted-product
// codes; legacy reservations remain visible until the database migration is run.
export async function fetchProductBarcodeReservations(codes?: string[]) {
  requireSupabaseConfig();
  if (codes && codes.length === 0) return [];

  const readPage = async (batch: string[] | undefined, first: number, last: number) => {
    let query = productEngineClient
      .from("product_variants")
      .select("id,product_id,sku,barcode,is_active,products(name,deleted_at)", { count: "exact" })
      .not("barcode", "is", null)
      .order("id")
      .range(first, last);
    if (batch) query = query.in("barcode", batch);
    const { data, error, count } = await query;
    if (error) throw new Error(`Không kiểm tra được EAN-13 trong dữ liệu: ${error.message}`);
    return { data: (data ?? []) as unknown as ProductBarcodeReservation[], error: null, count };
  };
  return codes
    ? fetchRowsForIds(codes, readPage)
    : fetchAllRows((first, last) => readPage(undefined, first, last));
}

export function getProductBarcodeConflictMessage(
  code: string | null | undefined,
  reservations: ProductBarcodeReservation[],
  variantId?: string,
) {
  const normalizedCode = normalizeEan13Input(code);
  if (!normalizedCode) return null;
  const conflict = reservations.find((row) =>
    row.id !== variantId && normalizeEan13Input(row.barcode) === normalizedCode,
  );
  if (!conflict) return null;
  const product = conflict.products
    ? ` của sản phẩm “${conflict.products.name}”${conflict.products.deleted_at ? " đã xóa" : ""}`
    : "";
  const retired = !conflict.is_active ? " (SKU đã ngừng bán)" : "";
  return `EAN-13 ${normalizedCode} đang thuộc SKU “${conflict.sku}”${product}${retired}. Hãy chọn mã khác hoặc kiểm tra lại sản phẩm cũ.`;
}
