import { requireSupabaseConfig, supabase } from "../lib/supabase";
import type { InventoryAuditLine, InventoryAuditSession } from "../lib/inventoryAudits";
import type { Json } from "../types/database";
import { productEngineClient } from "../features/products/services/client";

type InventoryAuditQueryRow = {
  created_at: string;
  id: string;
  inventory_audit_lines: Array<{
    counted: number;
    ean13: string;
    product_id: string | null;
    product_name: string;
    system_stock?: number | null;
  }>;
  staff_name: string;
};

function isMissingInventoryAuditSchema(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    (error.message.includes("inventory_audits") ||
      error.message.includes("inventory_audit_lines") ||
      error.message.includes("system_stock") ||
      error.message.includes("submit_inventory_audit"))
  );
}

function throwInventoryAuditError(error: unknown): never {
  if (isMissingInventoryAuditSchema(error)) {
    throw new Error(
      "Cơ sở dữ liệu chưa có chức năng kiểm kê mới. Hãy chạy lại supabase/schema.sql rồi thử lại."
    );
  }

  throw error;
}

export async function fetchInventoryAudits(): Promise<InventoryAuditSession[]> {
  requireSupabaseConfig();

  try {
    const [audits, lines] = await Promise.all([
      productEngineClient.from("inventory_audits").select("*").order("created_at", { ascending: false }).limit(50),
      productEngineClient.from("inventory_audit_lines").select("*"),
    ]);
    if (audits.error) throw audits.error;
    if (lines.error) throw lines.error;
    return (audits.data ?? []).map((audit) => ({
      createdAt: String(audit.created_at), id: String(audit.id), staffName: String(audit.staff_name),
      lines: (lines.data ?? []).filter((line) => line.audit_id === audit.id).map((line) => ({ counted: Number(line.counted), ean13: String(line.sku), productId: line.variant_id ? String(line.variant_id) : null, productName: String(line.product_name), systemStock: line.system_stock == null ? null : Number(line.system_stock) })),
    }));
  } catch (engineError) {
    if (!(engineError instanceof Error) || !/variant_id|schema cache|does not exist/i.test(engineError.message)) throw engineError;
  }

  const { data, error } = await supabase
    .from("inventory_audits")
    .select(
      "id,created_at,staff_name,inventory_audit_lines(product_id,product_name,ean13,counted,system_stock)"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throwInventoryAuditError(error);
  }

  return ((data ?? []) as InventoryAuditQueryRow[]).map((audit) => ({
    createdAt: audit.created_at,
    id: audit.id,
    lines: audit.inventory_audit_lines.map(
      (line): InventoryAuditLine => ({
        counted: line.counted,
        ean13: line.ean13,
        productId: line.product_id,
        productName: line.product_name,
        systemStock: line.system_stock ?? null,
      })
    ),
    staffName: audit.staff_name,
  }));
}

export async function submitInventoryAudit(
  staffName: string,
  lines: Array<Omit<InventoryAuditLine, "productId" | "systemStock"> & { productId: string }>
) {
  requireSupabaseConfig();

  const payload = lines.map((line) => ({
    counted: line.counted,
    ean13: line.ean13,
    variant_id: line.productId,
    product_name: line.productName,
  })) as Json;

  const { data, error } = await supabase.rpc("submit_inventory_audit", {
    lines_input: payload,
    staff_name_input: staffName,
  });

  if (error) {
    throwInventoryAuditError(error);
  }

  return data;
}

export async function deleteInventoryAudit(auditId: string) {
  requireSupabaseConfig();

  const { error } = await supabase.from("inventory_audits").delete().eq("id", auditId);

  if (error) {
    throwInventoryAuditError(error);
  }
}
