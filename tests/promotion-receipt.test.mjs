import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

test("gift receipts use actual awarded quantities and saved receipts do not duplicate gifts", async () => {
  const result = await build({ entryPoints: ["src/lib/receipt.ts"], bundle: true, write: false, platform: "node", format: "esm" });
  const { printPosReceipt, printSavedReceipt } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
  const oldDocument = globalThis.document, oldWindow = globalThis.window;
  let html = "";
  globalThis.document = {
    body: { appendChild() {} },
    createElement: () => ({ style: {}, setAttribute() {}, contentDocument: { open() {}, write(value) { html = value; }, close() {} } }),
  };
  globalThis.window = { localStorage: { getItem: () => "80mm" }, setTimeout() {} };
  const order = { code: "TEST", created_at: new Date().toISOString(), subtotal: 2500, discount: 0, total: 2500,
    cash_received: 3000, change_amount: 500, points_earned: 0, points_redeemed: 0, print_count: 1 };
  const gift = { variant_id: "gift", product_name: "Gift <script>", variant_name: "Blue", quantity: 1, requested_quantity: 2, warning: "Missing one" };
  const promotions = [{ name: "Buy 10 get 1", discount_amount: 0, gifts: [gift] }];
  try {
    printPosReceipt({ customer: null, order, items: [{ product: { name: "Paid item", price: 100 }, quantity: 25 }], promotions });
    assert.match(html, /Tổng cộng \(26 món\)/);
    assert.equal((html.match(/Gift &lt;script&gt;/g) ?? []).length, 1);
    assert.match(html, /Quà tặng · Buy 10 get 1/);
    assert.doesNotMatch(html, /<script>|-0đ|Missing one/);
    const rows = html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
    assert.equal((rows.match(/<tr>/g) ?? []).length, 2);

    printSavedReceipt({ customer: null, order, promotions, items: [
      { product_name: "Paid item", unit_price: 100, quantity: 25 },
      { product_name: gift.product_name, variant_label: "Blue", unit_price: 0, quantity: 1, is_promotion_gift: true, promotion_name: "Buy 10 get 1" },
    ] });
    assert.match(html, /Tổng cộng \(26 món\)/);
    assert.equal((html.match(/Gift &lt;script&gt;/g) ?? []).length, 1);
    assert.match(html, /Quà tặng \(Buy 10 get 1\)/);
    assert.equal((html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1].match(/<tr>/g) ?? []).length, 2);
  } finally {
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});
