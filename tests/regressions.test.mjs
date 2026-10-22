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

test("variant display values retain units, slash-containing labels and real color metadata", async () => {
  const { getVariantDisplayValues, getVariantLabel } = await loadSource("src/features/products/utils/variants.ts");
  const attributes = [
    { display_type: "color_circle", values: [{ id: "green", label: "Xanh rêu", metadata: { hex: " #596842 " } }] },
    { display_type: "text_button", unit: "ml", values: [{ id: "volume", label: "1.200 ml", metadata: { hex: "#000000" } }] },
    { display_type: "text_button", values: [{ id: "pattern", label: "Sọc xanh / trắng", metadata: {} }] },
    { display_type: "color", values: [{ id: "invalid-color", label: "Màu khác", metadata: { hex: "invalid" } }] },
    { display_type: "text_button", unit: "g", values: [{ id: "weight", label: "500", metadata: {} }] },
  ];
  const variant = { value_ids: ["green", "volume", "pattern", "invalid-color", "weight", "missing"] };
  assert.deepEqual(getVariantDisplayValues(variant, attributes), [
    { id: "green", label: "Xanh rêu", color: "#596842" },
    { id: "volume", label: "1.200 ml" },
    { id: "pattern", label: "Sọc xanh / trắng" },
    { id: "invalid-color", label: "Màu khác" },
    { id: "weight", label: "500 g" },
  ]);
  assert.equal(getVariantLabel(variant, attributes), "Xanh rêu / 1.200 ml / Sọc xanh / trắng / Màu khác / 500 g");
  assert.deepEqual(getVariantDisplayValues({ value_ids: [] }, attributes), []);
  assert.equal(getVariantLabel({ value_ids: [] }, attributes), "Mặc định");
});

function catalogDatabase(tables, requests, rpcCalls) {
  return {
    from(table) {
      let first = 0, last = 499;
      const filters = [], order = [];
      const query = {
        select() { return query; },
        is(column, value) { filters.push((row) => row[column] === value); return query; },
        eq(column, value) { filters.push((row) => row[column] === value); return query; },
        in(column, values) { filters.push((row) => values.includes(row[column])); return query; },
        order(column, options) { order.push([column, options?.ascending !== false]); return query; },
        range(start, end) { first = start; last = end; return query; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        then(resolve, reject) {
          requests.push({ table, first, last });
          const rows = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
          rows.sort((a, b) => {
            for (const [column, ascending] of order) {
              const delta = a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0;
              if (delta) return ascending ? delta : -delta;
            }
            return 0;
          });
          // Simulate a deployment with a response cap below the requested page size.
          return Promise.resolve({ data: rows.slice(first, Math.min(last + 1, first + 137)), error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: { id: "order-1" }, error: null }; },
  };
}

test("large catalog preserves every SKU barcode through POS mapping, refresh and checkout", async () => {
  const { createEan13 } = await loadSource("src/lib/productDisplay.ts");
  const products = Array.from({ length: 1001 }, (_, index) => ({
    id: `product-${String(index).padStart(4, "0")}`, name: `Product ${index}`, slug: `p-${index}`,
    status: "active", deleted_at: null, created_at: "2026-01-01", product_type_id: null, category_id: null,
  }));
  const multiId = products.at(-1).id;
  const variants = [
    ...products.slice(0, -1).map((product, index) => ({
      id: `simple-${index}`, product_id: product.id, sku: `S-${index}`, barcode: createEan13(String(index)),
      is_default: true, is_active: true, base_price: 100, cost_price: 50, stock_quantity: 5,
    })),
    ...Array.from({ length: 1005 }, (_, index) => ({
      id: `variant-${String(index).padStart(4, "0")}`, product_id: multiId, sku: `V-${index}`,
      barcode: createEan13(String(index + 1000)), is_default: false, is_active: index !== 1003,
      base_price: 200 + index, cost_price: 70, stock_quantity: index === 1002 ? 0 : 3,
    })),
  ];
  const target = variants.at(-1);
  const tables = {
    products: [...products, { id: "deleted", deleted_at: "2026-01-01" }],
    product_variants: [...variants, { id: "deleted-sku", product_id: "deleted" }],
    product_variant_attributes: [{ id: "size", product_id: multiId, name: "Size", sort_order: 0 }],
    product_variant_values: variants.slice(1000).map((variant) => ({
      id: `value-${variant.id}`, variant_attribute_id: "size", label: variant.sku, sort_order: 0, metadata: {}, is_active: true,
    })),
    variant_value_links: variants.slice(1000).map((variant) => ({ variant_id: variant.id, variant_value_id: `value-${variant.id}` })),
    product_images: [{ id: "image", product_id: multiId, variant_id: target.id, is_primary: true, image_url: "https://example.test/target.jpg", sort_order: 0 }],
  };
  const requests = [], rpcCalls = [];
  globalThis.testSupabase = catalogDatabase(tables, requests, rpcCalls);
  try {
    const engine = await loadSource("src/features/products/services/productEngine.ts", true);
    const catalog = await engine.fetchProducts();
    assert.equal(catalog.length, 1001);
    const multi = catalog.find((row) => row.id === multiId);
    assert.equal(multi.variants.length, 1005);
    assert.equal(multi.variant_attributes[0].values.length, 1005);
    assert.equal(multi.variants.find((row) => row.id === target.id).image_url, tables.product_images[0].image_url);
    assert.ok(requests.some((request) => request.table === "products" && request.first >= 1000));
    const before = requests.length;
    const { fetchProducts } = await loadSource("src/services/products.ts", true);
    const { fetchProductSettings } = await loadSource("src/services/productSettings.ts", true);
    const posProducts = await fetchProducts(catalog);
    const settings = await fetchProductSettings(catalog);
    assert.equal(requests.length, before, "Mapping and settings must reuse the loaded catalog");
    assert.equal(settings.customAttributes[0].options.length, 1005);
    const { buildPosBarcodeIndex, findCartVariantById } = await loadSource("src/lib/posBarcode.ts");
    const index = buildPosBarcodeIndex(posProducts);
    const match = index.get(target.barcode);
    assert.equal(match.product.id, multiId);
    assert.equal(match.variant.id, target.id);
    assert.equal(match.variant.key, target.id);
    assert.equal(match.variant.linked_values.price, String(target.base_price));
    assert.equal(match.variant.image_url, tables.product_images[0].image_url);
    assert.equal(match.variant.stock, 3);
    assert.deepEqual(match.variant.values, { size: target.sku });
    assert.equal(index.has(variants.at(-2).barcode), false, "Retired SKUs cannot be scanned");
    assert.equal(index.get(variants.at(-3).barcode).variant.stock, 0, "Zero stock must not fall back to sibling inventory");
    assert.deepEqual(findCartVariantById(match.product, target.id), match.variant);
    assert.equal(findCartVariantById(match.product, "retired"), null);
    const { createSale } = await loadSource("src/services/orders.ts", true);
    const previousWindow = globalThis.window;
    globalThis.window = { dispatchEvent() {}, localStorage: { setItem() {} } };
    try {
      await createSale({ cart: [{ product: match.product, variant: match.variant, quantity: 1 }], cashReceived: 5000, paymentMethod: "cash" });
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
    assert.equal(rpcCalls.at(-1).args.items_input[0].variant_id, target.id);
    assert.equal(rpcCalls.at(-1).args.items_input[0].quantity, 1);
  } finally { delete globalThis.testSupabase; }
});

test("barcode index distinguishes sibling SKUs and rejects ambiguous or invented engine codes", async () => {
  const { buildPosBarcodeIndex } = await loadSource("src/lib/posBarcode.ts");
  const { createEan13, createInternalEan13FromId } = await loadSource("src/lib/productDisplay.ts");
  const code = createEan13("001234567890");
  const product = { id: "p", sku: code, is_active: true, attributes: { _variants: [{
    values: { color: "Red" }, stock: 4, linked_values: { _variant_id: "red", barcode: code },
  }] } };
  assert.equal(buildPosBarcodeIndex([product]).get(code).variant.id, "red");
  assert.equal(buildPosBarcodeIndex([product]).has(createInternalEan13FromId("p")), false);
  const duplicate = { ...product, id: "other" };
  assert.equal(buildPosBarcodeIndex([product, duplicate]).get(code), null);
  assert.equal(buildPosBarcodeIndex([{ ...product, attributes: { _variants: [] } }]).has(code), false);
  assert.equal(buildPosBarcodeIndex([{ ...product, is_active: false }]).get(code).product.is_active, false);
});

test("catalog pagination propagates errors instead of returning a partial stock list", async () => {
  const { fetchAllRows, fetchRowsForIds } = await loadSource("src/lib/catalogData.ts");
  await assert.rejects(fetchAllRows(async (first) => first === 0
    ? { data: [{ id: 1 }], error: null }
    : { data: null, error: { message: "Network failed" } }), /Network failed/);
  assert.deepEqual(await fetchRowsForIds([], () => { throw new Error("Unexpected request"); }), []);
});

test("product thumbnails resize unsigned originals without altering signed or external URLs", async () => {
  const { productThumbnailUrl } = await loadSource("src/lib/productImage.ts");
  const original = "https://res.cloudinary.com/shop/image/upload/v123/products/a.jpg";
  assert.equal(productThumbnailUrl(original, 384), "https://res.cloudinary.com/shop/image/upload/c_limit,w_384,h_384/f_auto/q_auto/v123/products/a.jpg");
  for (const source of [
    "https://example.test/a.jpg", "blob:preview", "/image.png",
    "https://res.cloudinary.com/shop/image/upload/s--signature--/v123/a.jpg",
    "https://res.cloudinary.com/shop/image/upload/c_fill,w_200/v123/a.jpg",
    `${original}?token=private`,
  ]) assert.equal(productThumbnailUrl(source), source);
});

test("product drafts recover legacy data and remain separate by product and account", async () => {
  const values = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  } };
  try {
    const drafts = await loadSource("src/lib/productEditorDraft.ts");
    const account = "product-editor-draft:account-a";
    const newDraft = { form: { name: "Đang nhập", slug: "dang-nhap", specifications: [], variant_attributes: [], variants: [], images: [] },
      editorTab: "seo", hasVariants: false, dirtyDimensions: false, open: true };
    values.set(account, JSON.stringify(newDraft));
    assert.deepEqual(drafts.readProductEditorDraft(account), newDraft, "Old single-key drafts must remain recoverable");
    drafts.writeProductEditorDraft(account, newDraft);
    const edited = { ...newDraft, form: { ...newDraft.form, id: "product-a", name: "Đang sửa" }, open: false };
    drafts.writeProductEditorDraft(account, edited);
    assert.deepEqual(drafts.findProductEditorDraft(account), newDraft);
    assert.deepEqual(drafts.findProductEditorDraft(account, "product-a"), edited);
    assert.equal(drafts.findProductEditorDraft(account, "product-b"), null);
    assert.equal(drafts.findProductEditorDraft("product-editor-draft:account-b", "product-a"), null);
    assert.deepEqual(drafts.readProductEditorDraft(account), edited);
    assert.equal(JSON.parse(values.get(account)).form, undefined, "The active-editor key should not duplicate the full form");
    drafts.clearProductEditorDraft(account, "product-a");
    assert.equal(values.has(account), false, "Saving/cancelling the active editor removes its resume pointer");
    assert.deepEqual(drafts.findProductEditorDraft(account), newDraft, "Clearing an edited product must preserve the new-product draft");
    drafts.writeProductEditorDraft(account, edited);
    drafts.clearProductEditorDraft(account);
    assert.deepEqual(drafts.readProductEditorDraft(account), edited, "Clearing another draft must not close the active editor");
    values.set(account, "{broken-json");
    assert.equal(drafts.readProductEditorDraft(account), null);
    values.set(account, JSON.stringify({ ...newDraft, form: { name: "Incomplete" } }));
    assert.equal(drafts.readProductEditorDraft(account), null);
    values.set(account, JSON.stringify({ targetKey: "product-editor-draft:account-b:new" }));
    assert.equal(drafts.readProductEditorDraft(account), null, "A pointer cannot restore another account's draft");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
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

test("product image library keeps usable sources, deduplicates assets and reports loading failures", async () => {
  const prefix = "hoang-an-pos/products/";
  const imageUrl = `https://res.cloudinary.com/test/image/upload/v1/${prefix}a.webp`;
  let records = [{ url: imageUrl.replace("/upload/", "/upload/q_20/"), public_id: `${prefix}a`, folder: "hoang-an-pos/products" },
    { url: "https://res.cloudinary.com/test/image/upload/v1/hoang-an-pos/payment-qr/private.webp", public_id: "hoang-an-pos/payment-qr/private", folder: "hoang-an-pos/payment-qr" }];
  let recordError = null;
  let apiError = false;
  let resources = [{ secure_url: imageUrl, public_id: `${prefix}a` },
    { url: imageUrl.replace("a.webp", "b.webp"), public_id: `${prefix}b` }];
  const originalFetch = globalThis.fetch;
  globalThis.testSupabase = {
    auth: { getSession: async () => ({ data: { session: { access_token: "mock-token" } } }) },
    from: () => ({ select: () => ({ order: async () => ({ data: records, error: recordError }) }) }),
  };
  globalThis.fetch = async () => apiError
    ? Response.json({ ok: false, message: "Cloudinary unavailable" }, { status: 503 })
    : Response.json({ ok: true, resources });
  try {
    const { fetchProductImageLibrary } = await loadSource("src/services/cloudinaryImages.ts", true);
    const complete = await fetchProductImageLibrary();
    assert.deepEqual(complete.images, [imageUrl, resources[1].url]);
    assert.equal(complete.warning, "");
    apiError = true;
    const fallback = await fetchProductImageLibrary();
    assert.deepEqual(fallback.images, [records[0].url]);
    assert.match(fallback.warning, /Cloudinary unavailable/);
    recordError = { message: "permission denied for cloudinary_images" };
    const failed = await fetchProductImageLibrary();
    assert.deepEqual(failed.images, []);
    assert.match(failed.warning, /Cloudinary unavailable/);
    assert.match(failed.warning, /permission denied/);
    apiError = false;
    const cloudOnly = await fetchProductImageLibrary();
    assert.deepEqual(cloudOnly.images, complete.images);
    assert.match(cloudOnly.warning, /permission denied/);
    recordError = null;
    records = []; resources = [];
    assert.deepEqual(await fetchProductImageLibrary(), { images: [], warning: "" });
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.testSupabase;
  }
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
  globalThis.fetch = async (url) => {
    externalCalls++;
    assert.equal(new URL(url).searchParams.get("prefix"), "hoang-an-pos/payment-qr/", "List only the authorized folder upstream");
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

test("Cloudinary library paginates its folder and keeps credential failures separate from user authentication", async () => {
  const { default: handler } = await loadSource("api/cloudinary-images.js", false, true);
  const previousEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  process.env.CLOUDINARY_API_KEY = "test-key";
  process.env.CLOUDINARY_API_SECRET = "test-secret";
  globalThis.testApiAuth = { ok: true, admin: {}, user: {} };
  const call = async (request) => {
    let body;
    const response = { statusCode: 200, setHeader() {}, end(value) { body = JSON.parse(value); } };
    await handler(request, response);
    return { status: response.statusCode, body };
  };
  try {
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      const params = new URL(url).searchParams;
      assert.equal(params.get("prefix"), "hoang-an-pos/products/");
      assert.ok(init.signal instanceof AbortSignal);
      calls++;
      if (calls === 1) return Response.json({ resources: [{ public_id: "hoang-an-pos/products/a" }], next_cursor: "page-2" });
      assert.equal(params.get("next_cursor"), "page-2");
      return Response.json({ resources: [{ public_id: "hoang-an-pos/products/b" }, { public_id: "private/hidden" }] });
    };
    const library = await call({ method: "GET", url: "/api/cloudinary-images?scope=products" });
    assert.equal(calls, 2);
    assert.deepEqual(library.body.resources.map((image) => image.public_id), ["hoang-an-pos/products/a", "hoang-an-pos/products/b"]);
    globalThis.fetch = async () => Response.json({ error: { message: "unknown api_key" } }, { status: 401 });
    for (const request of [
      { method: "GET", url: "/api/cloudinary-images?scope=products" },
      { method: "POST", body: { publicId: "hoang-an-pos/products/a" } },
    ]) {
      const failure = await call(request);
      assert.equal(failure.status, 502, "Upstream credentials must not trigger a Supabase token refresh");
      assert.equal(failure.body.ok, false);
      assert.match(failure.body.message, /Cấu hình Cloudinary không hợp lệ/);
    }
    process.env.CLOUDINARY_API_KEY = "your-api-key";
    globalThis.fetch = async () => { throw new Error("Sample credentials must never reach Cloudinary"); };
    const unconfigured = await call({ method: "GET", url: "/api/cloudinary-images?scope=products" });
    assert.equal(unconfigured.status, 500);
    assert.match(unconfigured.body.message, /Chưa cấu hình kết nối Cloudinary/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
    delete globalThis.testApiAuth;
  }
});
