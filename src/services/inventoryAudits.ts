import { requireSupabaseConfig, supabase } from "../lib/supabase";
import type { InventoryAuditLine, InventoryAuditSession } from "../lib/inventoryAudits";
import type { Json } from "../types/database";
import { productEngineClient } from "../features/products/services/client";
import { fetchRowsForIds, groupBy } from "../lib/catalogData";

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
      "Cơ sở dữ liệu chưa cập nhật chức năng kiểm kê. Hãy kiểm tra các migration kiểm kê rồi thử lại."
    );
  }

  throw error;
}

export async function fetchInventoryAudits(): Promise<InventoryAuditSession[]> {
  requireSupabaseConfig();

  const { data, error } = await supabase
    .from("inventory_audits")
    .select("id,created_at,staff_name")
    .order("created_at", { ascending: false })
    .order("id")
    .limit(50);

  if (error) {
    throwInventoryAuditError(error);
  }

  // Filter to the displayed sessions and page every line: a single SELECT is
  // capped by PostgREST and can silently omit entire recent sessions.
  const lines = await fetchRowsForIds(
    (data ?? []).map((audit) => audit.id),
    (auditIds, first, last) => productEngineClient
      .from("inventory_audit_lines")
      .select("*", { count: "exact" })
      .in("audit_id", auditIds)
      .order("id")
      .range(first, last),
  );
  const linesByAudit = groupBy(lines, (line) => String(line.audit_id));

  return (data ?? []).map((audit) => ({
    createdAt: audit.created_at,
    id: audit.id,
    lines: (linesByAudit.get(audit.id) ?? []).map(
      (line): InventoryAuditLine => ({
        counted: Number(line.counted),
        ean13: String(line.sku ?? line.ean13 ?? ""),
        productId: line.variant_id || line.product_id ? String(line.variant_id ?? line.product_id) : null,
        productName: String(line.product_name),
        systemStock: line.system_stock == null ? null : Number(line.system_stock),
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
