import { requireSupabaseConfig } from "../../../lib/supabase";
import { normalizeEan13Input } from "../../../lib/productDisplay";
import { productEngineClient } from "./client";

export type ProductBarcodeReservation = {
  id: string;
  product_id: string;
  sku: string;
  barcode: string;
  is_active: boolean;
  products: { name: string; deleted_at: string | null } | null;
};

// The UNIQUE constraint also reserves codes on retired SKUs and deleted products.
export async function fetchProductBarcodeReservations(codes?: string[]) {
  requireSupabaseConfig();
  if (codes && codes.length === 0) return [];

  const reservations: ProductBarcodeReservation[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = productEngineClient
      .from("product_variants")
      .select("id,product_id,sku,barcode,is_active,products(name,deleted_at)")
      .not("barcode", "is", null)
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (codes) query = query.in("barcode", [...new Set(codes)]);
    const { data, error } = await query;
    if (error) throw new Error(`Không kiểm tra được EAN-13 trong dữ liệu: ${error.message}`);
    const page = (data ?? []) as unknown as ProductBarcodeReservation[];
    reservations.push(...page);
    if (page.length < pageSize) return reservations;
  }
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
