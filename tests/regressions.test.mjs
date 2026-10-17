import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";

let sourceInstance = 0;
async function loadSource(entry, mockSupabase = false, mockAuth = false) {
  const result = await build({
    entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "node",
    define: {
      "import.meta.url": JSON.stringify(pathToFileURL(`${process.cwd()}/${entry}`).href),
      "import.meta.env.CLOUDINARY_CLOUD_NAME": '"test-cloud"',
      "import.meta.env.VITE_CLOUDINARY_CLOUD_NAME": '"test-cloud"',
    },
    plugins: mockSupabase || mockAuth ? [{
      name: "mock-backends",
      setup(builder) {
        if (mockSupabase) builder.onLoad({ filter: /[\\/]lib[\\/]supabase\.ts$/ }, () => ({
          contents: "export const supabase = globalThis.testSupabase; export const isSupabaseConfigured = true; export function requireSupabaseConfig() {}",
          loader: "js",
        }));
        if (mockAuth) builder.onLoad({ filter: /[\\/]api[\\/]_auth\.js$/ }, () => ({
          contents: "export async function authorizeApiRequest() { return globalThis.testApiAuth; } export async function userHasAnyPermission() { return true; }",
          loader: "js",
        }));
      },
    }] : [],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}#${sourceInstance++}`);
}

test("existing Product Engine acceptance scenarios", async () => {
  await loadSource("tests/product-engine.acceptance.ts");
});

test("EAN-13 preserves leading zeros and rejects overlong scans", async () => {
  const { createEan13, isValidEan13, normalizeEan13Input } = await loadSource("src/lib/productDisplay.ts");
  const code = createEan13("001234567890");
  assert.equal(code.length, 13);
  assert.equal(isValidEan13(code), true);
  assert.equal(isValidEan13(`${code}9`), false);
  assert.equal(normalizeEan13Input("001 234 567 890 5"), "0012345678905");
  assert.equal(isValidEan13(code.slice(0, 12) + ((Number(code[12]) + 1) % 10)), false);
});

test("switching a simple SKU to combinations retains identity, barcode and stock once", async () => {
  const { mergeGeneratedVariants } = await loadSource("src/features/products/utils/variants.ts");
  const original = {
    id: "existing-sku", sku: "SKU-1", barcode: "8931234567897", base_price: 50000,
    cost_price: 25000, stock_quantity: 7, shelf_quantity: 7, compare_at_price: null,
    weight: null, is_default: true, is_active: true, value_ids: [],
    image_url: null, cloudinary_public_id: null,
  };
  const attributes = [{ id: "color", sort_order: 0, values: [
    { id: "red", is_active: true, sort_order: 0 },
    { id: "blue", is_active: true, sort_order: 1 },
  ] }];
  const generated = mergeGeneratedVariants(attributes, [original], "SHIRT");
  assert.equal(generated.length, 2);
  assert.equal(generated[0].id, original.id);
  assert.equal(generated[0].barcode, original.barcode);
  assert.equal(generated[0].stock_quantity, 7);
  assert.equal(generated[0].base_price, 50000);
  assert.equal(generated[0].is_default, false);
  assert.deepEqual(generated[0].value_ids, ["red"]);
  assert.equal(generated[1].barcode, null);
  assert.equal(generated[1].stock_quantity, 0);
  assert.deepEqual(mergeGeneratedVariants(attributes, generated, "SHIRT"), generated);
  assert.deepEqual(original.value_ids, []);
});

function barcodeDatabase(rows, rpcCalls = []) {
  return {
    from(table) {
      let columns = "", offset = 0, last = Infinity, codes;
      const query = {
        select(value) { columns = value; return query; },
        not() { return query; }, order() { return query; }, like() { return query; },
        neq() { return query; }, eq() { return query; },
        range(first, end) { offset = first; last = end; return query; },
        in(_column, values) { codes = values; return query; },
        then(resolve, reject) {
          const data = table === "products" ? []
            : rows.filter((row) => !codes || codes.includes(row.barcode))
              .slice(offset, last + 1).map((row) => columns.includes("products(") ? row : {
                id: row.id, product_id: row.product_id, sku: row.sku,
              });
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    rpc: async (_name, args) => { rpcCalls.push(args); return { data: "saved-product", error: null }; },
  };
}

const archivedBarcode = {
  id: "archived-sku", product_id: "archived-product", sku: "ARCHIVED-001", barcode: "4006381333931",
  is_active: false, products: { name: "Sản phẩm đã xóa", deleted_at: "2026-10-16T00:00:00Z" },
};

test("barcode lookup includes deleted products, paginates and identifies the owning SKU", async () => {
  const rows = [archivedBarcode, ...Array.from({ length: 500 }, (_, index) => ({
    ...archivedBarcode, id: `sku-${index}`, barcode: String(index).padStart(13, "0"),
  }))];
  globalThis.testSupabase = barcodeDatabase(rows);
  try {
    const { fetchProductBarcodeReservations, getProductBarcodeConflictMessage } = await loadSource("src/features/products/services/productBarcodes.ts", true);
    const all = await fetchProductBarcodeReservations();
    assert.equal(all.length, 501, "Lookup must not truncate reservations after the first page");
    const matching = await fetchProductBarcodeReservations([archivedBarcode.barcode]);
    assert.equal(matching.length, 1);
    assert.match(getProductBarcodeConflictMessage(archivedBarcode.barcode, matching), /ARCHIVED-001.*Sản phẩm đã xóa.*đã xóa/);
    assert.equal(getProductBarcodeConflictMessage(archivedBarcode.barcode, matching, archivedBarcode.id), null);
    assert.equal(getProductBarcodeConflictMessage("", matching), null);
  } finally { delete globalThis.testSupabase; }
});

test("save checks current barcode data before RPC, including reservations invisible in the product list", async () => {
  const rpcCalls = [];
  globalThis.testSupabase = barcodeDatabase([archivedBarcode], rpcCalls);
  try {
    const { saveProduct } = await loadSource("src/features/products/services/productEngine.ts", true);
    const input = {
      name: "Sản phẩm mới", slug: "san-pham-moi", variant_attributes: [], specifications: [], images: [],
      variants: [{ sku: "NEW-001", barcode: archivedBarcode.barcode }],
    };
    await assert.rejects(saveProduct(input), /ARCHIVED-001.*Sản phẩm đã xóa/);
    assert.equal(rpcCalls.length, 0, "A reserved barcode must not reach the write RPC");
    await assert.rejects(saveProduct({ ...input, variants: [{ sku: "NEW-001", barcode: "4006381333932" }] }), /số kiểm tra hợp lệ/);
    assert.equal(rpcCalls.length, 0);
    await saveProduct({ ...input, variants: [{ sku: "NEW-001", barcode: "001 234 567 890 5" }] });
    assert.equal(rpcCalls[0].payload.variants[0].barcode, "0012345678905");
    await saveProduct({ ...input, id: archivedBarcode.product_id, variants: [{ id: archivedBarcode.id, sku: archivedBarcode.sku, barcode: archivedBarcode.barcode }] });
    assert.equal(rpcCalls[1].payload.variants[0].id, archivedBarcode.id, "Editing an existing SKU may keep its own barcode");
  } finally { delete globalThis.testSupabase; }
});

test("Cloudinary deletion keeps the actual API error and uses the known public ID", async () => {
  let fallbackCalls = 0;
  globalThis.testSupabase = {
    auth: { getSession: async () => ({ data: { session: { access_token: "mock-token" } } }) },
    functions: { invoke: async () => { fallbackCalls++; return { error: new Error("Missing function") }; } },
  };
  const { deleteCloudinaryProductImage, getCloudinaryPublicId } = await loadSource("src/lib/cloudinary.ts", true);
  assert.equal(getCloudinaryPublicId("https://evil-cloudinary.com/image/upload/v1/photo.webp"), null);
  assert.equal(getCloudinaryPublicId("https://res.cloudinary.com/test/image/upload/q_20/v123/hoang-an-pos/products/a.webp"), "hoang-an-pos/products/a");
  const originalFetch = globalThis.fetch;
  try {
    let sentId;
    globalThis.fetch = async (_url, init) => {
      sentId = JSON.parse(init.body).publicId;
      return Response.json({ ok: false, message: "Invalid Cloudinary credentials" }, { status: 403 });
    };
    await assert.rejects(deleteCloudinaryProductImage("https://images.example/photo", { publicId: "known-id" }), /Invalid Cloudinary credentials/);
    assert.equal(sentId, "known-id");
    assert.equal(fallbackCalls, 0);
    globalThis.fetch = async () => new Response("Not found", { status: 404 });
    await assert.rejects(deleteCloudinaryProductImage("https://images.example/photo", { publicId: "known-id" }), /API xóa ảnh/);
    assert.equal(fallbackCalls, 1);
    globalThis.fetch = async () => Response.json({ ok: true, result: "not found" });
    const result = await deleteCloudinaryProductImage("https://images.example/photo", { publicId: "known-id" });
    assert.equal(result.ok, true, "Deletion must be retryable after Cloudinary already deleted the asset");
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.testSupabase;
  }
});

test("Cloudinary record permission failures are not hidden as missing tables", async () => {
  let databaseError;
  globalThis.testSupabase = { from: () => ({ select: () => ({ order: async () => ({ data: null, error: databaseError }) }) }) };
  const { fetchCloudinaryImageRecords } = await loadSource("src/services/cloudinaryImages.ts", true);
  databaseError = { code: "42501", message: "permission denied for table cloudinary_images" };
  await assert.rejects(fetchCloudinaryImageRecords(), (error) => error === databaseError);
  databaseError = { code: "PGRST205", message: "Could not find cloudinary_images in schema cache" };
  assert.deepEqual(await fetchCloudinaryImageRecords(), []);
  delete globalThis.testSupabase;
});

test("fresh schema and upgrade remove the obsolete products.image_url update", async () => {
  for (const file of ["supabase/schema.sql", "supabase/migrations/202610170001_fix_cloudinary_image_cleanup.sql"]) {
    const sql = await readFile(file, "utf8");
    const cleanup = sql.match(/(?:create(?: or replace)? function) public\.clear_products_image_url[\s\S]*?\$\$;/i)?.[0];
    assert.ok(cleanup, file);
    assert.doesNotMatch(cleanup, /update public\.products\b/i);
    assert.match(cleanup, /delete from public\.product_images/i);
    assert.match(cleanup, /update public\.product_variant_values/i);
    assert.match(cleanup, /has_permission\('cloudinary-images.delete'\)/);
  }
});

test("local Cloudinary API honors the query-string scope and checks deletion authorization", async () => {
  const { default: handler } = await loadSource("api/cloudinary-images.js", false, true);
  const previousEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  process.env.CLOUDINARY_API_KEY = "test-key";
  process.env.CLOUDINARY_API_SECRET = "test-secret";
  globalThis.testApiAuth = { ok: true, admin: {}, user: {} };
  let externalCalls = 0;
  globalThis.fetch = async () => {
    externalCalls++;
    return Response.json({ resources: [
      { public_id: "hoang-an-pos/products/a" },
      { public_id: "hoang-an-pos/payment-qr/b" },
    ] });
  };
  const call = async (request) => {
    let body;
    const response = { statusCode: 200, setHeader() {}, end(value) { body = JSON.parse(value); } };
    await handler(request, response);
    return { status: response.statusCode, body };
  };
  try {
    const qr = await call({ method: "GET", url: "/api/cloudinary-images?scope=payment-qr" });
    assert.equal(qr.status, 200);
    assert.deepEqual(qr.body.resources, [{ public_id: "hoang-an-pos/payment-qr/b" }]);
    const invalid = await call({ method: "GET", url: "/api/cloudinary-images?scope=private" });
    assert.equal(invalid.status, 400);
    assert.equal(externalCalls, 1);
    globalThis.testApiAuth = { ok: false, status: 403, message: "Permission denied" };
    const denied = await call({ method: "POST", body: { publicId: "hoang-an-pos/products/a" } });
    assert.equal(denied.status, 403);
    assert.equal(externalCalls, 1, "Forbidden deletion must never reach Cloudinary");
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
    delete globalThis.testApiAuth;
  }
});
