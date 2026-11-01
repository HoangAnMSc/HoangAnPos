import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createClient } from "@supabase/supabase-js";

let sourceInstance = 0;
async function loadSource(entry, client) {
  globalThis.inventoryAuditTestClient = client;
  const result = await build({
    entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "node",
    plugins: [{
      name: "audit-test-backend",
      setup(builder) {
        builder.onLoad({ filter: /[\\/]lib[\\/]supabase\.ts$/ }, () => ({
          contents: "export const supabase = globalThis.inventoryAuditTestClient; export function requireSupabaseConfig() {}",
          loader: "js",
        }));
      },
    }],
  });
  try {
    return await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}#${sourceInstance++}`);
  } finally { delete globalThis.inventoryAuditTestClient; }
}

// Exercise the real Supabase query builder against an API with a response cap.
function auditDatabase(tables, { cap = 1000, failPage } = {}) {
  const requests = [];
  const client = createClient("https://audit.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        const table = url.pathname.split("/").at(-1);
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const limit = Number(url.searchParams.get("limit") ?? cap);
        const auditIds = url.searchParams.get("audit_id")?.slice(4, -1).split(",");
        requests.push({ table, offset, limit, auditIds });
        if (failPage?.({ table, offset })) return new Response(JSON.stringify({ message: "Audit page unavailable", code: "XX000" }), { status: 500 });
        const rows = (tables[table] ?? []).filter((row) => !auditIds || auditIds.includes(row.audit_id));
        const orders = url.searchParams.get("order")?.split(",") ?? [];
        rows.sort((a, b) => {
          for (const order of orders) {
            const [column, direction] = order.split(".");
            const delta = a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0;
            if (delta) return direction === "desc" ? -delta : delta;
          }
          return 0;
        });
        const data = rows.slice(offset, offset + Math.min(limit, cap));
        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json", "Content-Range": `${offset}-${offset + data.length - 1}/${rows.length}` },
        });
      },
    },
  });
  return { client, requests };
}

function auditFixture(counts) {
  const audits = counts.map((_, index) => ({
    id: `audit-${String(index).padStart(4, "0")}`,
    created_at: new Date(Date.UTC(2026, 9, 1) + index * 86400000).toISOString(),
    staff_name: `Auditor ${index}`,
  }));
  const lines = audits.flatMap((audit, index) => Array.from({ length: counts[index] }, (_, lineIndex) => ({
    id: `${audit.id}-line-${String(lineIndex).padStart(4, "0")}`,
    audit_id: audit.id,
    variant_id: `variant-${lineIndex}`,
    product_name: `Product ${lineIndex}`,
    sku: "0012345678905",
    counted: lineIndex,
    system_stock: lineIndex + 1,
  })));
  return { inventory_audits: audits, inventory_audit_lines: lines };
}

test("history loads all 1,580 lines instead of marking the newest 133-product audits empty", async () => {
  const tables = auditFixture([129, 129, 129, 129, 133, 133, 133, 133, 133, 133, 133, 133]);
  const { client, requests } = auditDatabase(tables);
  const { fetchInventoryAudits } = await loadSource("src/services/inventoryAudits.ts", client);
  const audits = await fetchInventoryAudits();
  assert.equal(audits.length, 12);
  assert.equal(audits[0].id, tables.inventory_audits.at(-1).id);
  assert.equal(audits.reduce((sum, audit) => sum + audit.lines.length, 0), 1580);
  for (const audit of audits) {
    const expected = tables.inventory_audit_lines.filter((line) => line.audit_id === audit.id);
    assert.equal(audit.lines.length, expected.length);
    assert.equal(new Set(audit.lines.map((line) => line.productId)).size, expected.length);
    assert.equal(audit.lines[0].ean13, "0012345678905");
    assert.equal(audit.lines[0].systemStock, 1);
  }
  assert.ok(requests.some((request) => request.table === "inventory_audit_lines" && request.offset >= 1000));
});

test("one audit with over 1,000 products survives a deployment cap below the requested page size", async () => {
  const { client, requests } = auditDatabase(auditFixture([1120]), { cap: 137 });
  const { fetchInventoryAudits } = await loadSource("src/services/inventoryAudits.ts", client);
  const [audit] = await fetchInventoryAudits();
  assert.equal(audit.lines.length, 1120);
  assert.equal(audit.lines.at(-1).counted, 1119);
  assert.equal(new Set(audit.lines.map((line) => line.productId)).size, 1120);
  assert.ok(requests.some((request) => request.table === "inventory_audit_lines" && request.offset === 137));
});

test("line requests include only the 50 displayed audit sessions", async () => {
  const tables = auditFixture(Array(55).fill(1));
  const { client, requests } = auditDatabase(tables);
  const { fetchInventoryAudits } = await loadSource("src/services/inventoryAudits.ts", client);
  const audits = await fetchInventoryAudits();
  assert.equal(audits.length, 50);
  assert.deepEqual(audits.map((audit) => audit.id), tables.inventory_audits.slice(5).reverse().map((audit) => audit.id));
  for (const request of requests.filter((request) => request.table === "inventory_audit_lines")) {
    assert.deepEqual(new Set(request.auditIds), new Set(audits.map((audit) => audit.id)));
  }
});

test("empty history skips detail requests and a failed later page rejects partial history", async () => {
  const empty = auditDatabase(auditFixture([]));
  const first = await loadSource("src/services/inventoryAudits.ts", empty.client);
  assert.deepEqual(await first.fetchInventoryAudits(), []);
  assert.equal(empty.requests.length, 1);
  const failing = auditDatabase(auditFixture([1100]), {
    failPage: ({ table, offset }) => table === "inventory_audit_lines" && offset > 0,
  });
  const second = await loadSource("src/services/inventoryAudits.ts", failing.client);
  await assert.rejects(second.fetchInventoryAudits(), /Audit page unavailable/);
});

test("history preserves deleted-product snapshots and legacy product IDs and barcodes", async () => {
  const tables = auditFixture([2]);
  tables.inventory_audit_lines[0].variant_id = null;
  tables.inventory_audit_lines[0].system_stock = 0;
  const legacy = tables.inventory_audit_lines[1];
  legacy.product_id = legacy.variant_id;
  legacy.ean13 = legacy.sku;
  delete legacy.variant_id;
  delete legacy.sku;
  delete legacy.system_stock;
  const { client } = auditDatabase(tables);
  const { fetchInventoryAudits } = await loadSource("src/services/inventoryAudits.ts", client);
  const [audit] = await fetchInventoryAudits();
  assert.equal(audit.lines[0].productId, null);
  assert.equal(audit.lines[0].productName, "Product 0");
  assert.equal(audit.lines[0].systemStock, 0);
  assert.equal(audit.lines[1].productId, legacy.product_id);
  assert.equal(audit.lines[1].ean13, legacy.ean13);
  assert.equal(audit.lines[1].systemStock, null);
});

test("only complete comparisons are matched; empty or unknown history has a neutral status", async () => {
  const { getInventoryAuditStatus } = await loadSource("src/lib/inventoryAudits.ts");
  const line = { productId: "variant", productName: "Product", ean13: "", counted: 0, systemStock: 0 };
  assert.equal(getInventoryAuditStatus([]), "unknown");
  assert.equal(getInventoryAuditStatus([line], () => 99), "matched", "Historical stock takes precedence over today's stock");
  assert.equal(getInventoryAuditStatus([{ ...line, productId: null }]), "matched", "Deleted products retain their historical comparison");
  assert.equal(getInventoryAuditStatus([{ ...line, counted: 1 }]), "mismatched");
  const unknown = { ...line, productId: null, systemStock: null };
  assert.equal(getInventoryAuditStatus([unknown]), "unknown");
  assert.equal(getInventoryAuditStatus([line, unknown]), "unknown");
  assert.equal(getInventoryAuditStatus([unknown, { ...line, counted: 1 }]), "mismatched");
  assert.equal(getInventoryAuditStatus([{ ...line, systemStock: null }], () => 0), "matched");
});
