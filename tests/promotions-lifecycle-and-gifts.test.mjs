import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const admin = "11111111-1111-4111-8111-111111111111";
const reader = "22222222-2222-4222-8222-222222222222";
const readSql = async (path) => (await readFile(new URL(path, import.meta.url), "utf8")).replace(/^\uFEFF/, "");

test("Promotion lifecycle and gift checkout against PostgreSQL", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, phone text, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$
        select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
      $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
      $$;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on all functions in schema auth to anon, authenticated, service_role;
    `);
    const schema = await readSql("../supabase/schema.sql");
    // Upgrade an existing installation as well as testing the final fresh schema
    // (the existing product lifecycle suite loads that complete schema).
    await db.exec(schema.split("-- Promotion lifecycle and gift rules (202610190001).")[0]);
    const legacyPromotion = randomUUID(), legacyOrder = randomUUID();
    await db.query("insert into public.promotions(id,name,trigger_type,discount_type,discount_value,is_active) values($1,'Legacy promotion','automatic','percentage',10,false)", [legacyPromotion]);
    await db.query("insert into public.orders(id,code,subtotal,total) values($1,$2,100,90)", [legacyOrder, legacyOrder]);
    await db.query("insert into public.promotion_redemptions(promotion_id,order_id,discount_amount) values($1,$2,10)", [legacyPromotion, legacyOrder]);
    const upgrade = await readSql("../supabase/migrations/202610190001_promotion_lifecycle_and_gifts.sql");
    await db.exec(upgrade);
    await db.exec(upgrade);
    await t.test("upgrade preserves existing orders and usage and can run twice", async () => {
      const history = (await db.query("select * from public.promotion_redemptions where promotion_id=$1", [legacyPromotion])).rows[0];
      assert.equal(history.promotion_name, "Legacy promotion");
      assert.equal(Number(history.discount_amount), 10);
      assert.deepEqual(history.gifts, []);
      assert.equal(Number((await db.query("select total from public.orders where id=$1", [legacyOrder])).rows[0].total), 90);
    });
    await db.query("insert into auth.users(id,email) values ($1,'admin@test.invalid'),($2,'reader@test.invalid')", [admin, reader]);
    await db.exec("insert into public.app_roles(name,code,permissions) values ('Promotion reader','promotion-reader',array['promotions'])");
    for (const [id, role] of [[admin, "admin"], [reader, "promotion-reader"]]) {
      await db.query("update public.profiles set is_active=true,role_id=(select id from public.app_roles where code=$2) where id=$1", [id, role]);
    }
    const query = async (sql, params = []) => (await db.query(sql, params)).rows;
    async function actor(id = admin) {
      await db.exec("reset role; set local row_security=on");
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
      await db.exec("set local role authenticated");
    }
    async function scenario(work) {
      await db.exec("begin");
      try { await actor(); await work(); }
      finally { await db.exec("rollback"); }
    }
    async function fails(sql, params, pattern) {
      await db.exec("savepoint expected_failure");
      try { await assert.rejects(db.query(sql, params), pattern); }
      finally { await db.exec("rollback to savepoint expected_failure; release savepoint expected_failure"); }
    }
    async function promotion(values = {}) {
      const id = randomUUID();
      const row = { name: "Test promotion", trigger_type: "automatic", discount_type: "percentage", discount_value: 10, ...values, id };
      const keys = Object.keys(row);
      await db.query(`insert into public.promotions(${keys.join(",")}) values(${keys.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(row));
      return id;
    }
    async function product({ stock = 100, price = 100, secondVariant = false, isReward = false } = {}) {
      const id = randomUUID(), variantId = randomUUID(), secondId = randomUUID();
      const variant = { id: variantId, sku: `SKU-${variantId}`, base_price: price, cost_price: 25,
        stock_quantity: stock, shelf_quantity: stock, is_default: true, is_active: true, value_ids: [] };
      const variants = secondVariant ? [variant, { ...variant, id: secondId, sku: `SKU-${secondId}`, is_default: false }] : [variant];
      await db.query("select public.save_product_engine($1::jsonb)", [JSON.stringify({ id, name: `Product ${id}`, slug: `p-${id}`, status: "active",
        is_reward: isReward, reward_points_cost: isReward ? 10 : 0, specifications: [], variant_attributes: [], variants, images: [] })]);
      return { id, variantId, secondId, price };
    }
    const item = (p, quantity, variantId = p.variantId) => ({ product_id: p.id, variant_id: variantId, quantity, unit_price: p.price });
    const benefits = async (items, customer = null, code = null) => query("select * from public.evaluate_promotion_benefits($1::jsonb,$2,$3)", [JSON.stringify(items), customer, code]);
    const stockOf = async (id) => (await query("select stock_quantity,shelf_quantity from public.product_variants where id=$1", [id]))[0];
    const sale = async (items, extra = {}) => (await query("select * from public.create_pos_order($1,1000000,$2,null,0,$3::jsonb,null,'cash',null,null)", [admin, randomUUID(), JSON.stringify(items.map((line) => ({ ...line, ...extra }))) ]))[0];
    const giftPromotion = (p, values = {}) => promotion({ discount_type: "buy_x_get_y", discount_value: 0, buy_variant_id: p.variantId, ...values });

    await t.test("gift counts at 9/10/20/25 and once-per-order; gift lines never count as purchases", () => scenario(async () => {
      const p = await product();
      const id = await giftPromotion(p);
      for (const [qty, expected] of [[9, 0], [10, 1], [20, 2], [25, 2]]) {
        const result = await benefits([item(p, qty)]);
        assert.equal(result[0]?.gifts[0].quantity ?? 0, expected);
      }
      await db.query("update public.promotions set repeat_gift=false where id=$1", [id]);
      assert.equal((await benefits([item(p, 25)]))[0].gifts[0].quantity, 1);
    }));

    await t.test("separate SKUs and unrelated items do not combine toward the threshold", () => scenario(async () => {
      const p = await product({ secondVariant: true });
      const other = await product();
      await giftPromotion(p);
      assert.equal((await benefits([item(p, 6), item(p, 6, p.secondId), item(other, 30)])).length, 0);
      assert.equal((await benefits([item(p, 6), item(p, 4)]))[0].gifts[0].quantity, 1);
    }));

    await t.test("different gift SKU is capped by remaining stock after paid quantities", () => scenario(async () => {
      const p = await product(), gift = await product({ stock: 2 });
      await giftPromotion(p, { gift_variant_id: gift.variantId });
      const result = (await benefits([item(p, 25), item(gift, 1)]))[0];
      assert.equal(result.gifts[0].quantity, 1);
      assert.equal(result.gifts[0].requested_quantity, 2);
      assert.match(result.gifts[0].warning, /thiếu 1 quà/);
      assert.deepEqual(await stockOf(gift.variantId), { stock_quantity: 2, shelf_quantity: 2 }, "preview must not mutate inventory");
    }));

    await t.test("same-SKU gift reserves paid stock first and permits checkout without gifts", () => scenario(async () => {
      const p = await product({ stock: 10 });
      await giftPromotion(p);
      const order = await sale([item(p, 10)]);
      assert.equal(Number(order.total), 1000);
      assert.equal(order.promotion_snapshot[0].gifts[0].quantity, 0);
      assert.match(order.promotion_snapshot[0].gifts[0].warning, /thiếu 1 quà/);
      assert.deepEqual(await stockOf(p.variantId), { stock_quantity: 0, shelf_quantity: 0 });
      assert.equal((await query("select * from public.order_items where order_id=$1", [order.id])).length, 1);
      assert.equal((await query("select * from public.promotion_redemptions where order_id=$1", [order.id])).length, 0);
    }));

    await t.test("same-SKU checkout adds exactly two gifts for twenty paid units", () => scenario(async () => {
      const p = await product();
      await giftPromotion(p);
      const order = await sale([item(p, 20)]);
      assert.equal(Number(order.total), 2000);
      assert.deepEqual(await stockOf(p.variantId), { stock_quantity: 78, shelf_quantity: 78 });
      const lines = await query("select * from public.order_items where order_id=$1", [order.id]);
      assert.equal(lines.filter((line) => !line.is_promotion_gift)[0].quantity, 20);
      assert.equal(lines.filter((line) => line.is_promotion_gift)[0].quantity, 2);
    }));

    await t.test("promotion gifts do not redeem loyalty points and respect reward items already in the cart", () => scenario(async () => {
      const p = await product(), gift = await product({ stock: 2, isReward: true });
      await giftPromotion(p, { gift_variant_id: gift.variantId });
      const preview = await benefits([item(p, 25), { ...item(gift, 1), is_reward: true }]);
      assert.equal(preview[0].gifts[0].quantity, 1);
      const order = await sale([item(p, 25), item(gift, 1)]);
      assert.equal(order.points_redeemed, 0);
      assert.equal(Number(order.total), 2600);
      const giftLine = (await query("select * from public.order_items where order_id=$1 and is_promotion_gift", [order.id]))[0];
      assert.equal(giftLine.reward_points_cost, 0);
      assert.deepEqual(await stockOf(gift.variantId), { stock_quantity: 0, shelf_quantity: 0 });
    }));

    await t.test("checkout stores actual gift snapshot, zero-priced line, stock movement and usage", () => scenario(async () => {
      const p = await product(), gift = await product({ stock: 1 });
      const id = await giftPromotion(p, { gift_variant_id: gift.variantId });
      const order = await sale([item(p, 25)]);
      assert.equal(Number(order.total), 2500);
      const lines = await query("select * from public.order_items where order_id=$1", [order.id]);
      const giftLine = lines.find((line) => line.is_promotion_gift);
      assert.equal(giftLine.variant_id, gift.variantId);
      assert.equal(giftLine.quantity, 1);
      assert.equal(Number(giftLine.unit_price), 0);
      assert.equal(Number(giftLine.line_total), 0);
      assert.equal(giftLine.promotion_id, id);
      assert.deepEqual(await stockOf(p.variantId), { stock_quantity: 75, shelf_quantity: 75 });
      assert.deepEqual(await stockOf(gift.variantId), { stock_quantity: 0, shelf_quantity: 0 });
      const redemption = (await query("select * from public.promotion_redemptions where order_id=$1", [order.id]))[0];
      assert.equal(redemption.gifts[0].quantity, 1);
      assert.match(redemption.gifts[0].warning, /thiếu 1 quà/);
      assert.equal(order.promotion_snapshot[0].gifts[0].quantity, 1);
      assert.equal((await query("select * from public.stock_movements where reference_id=$1 and variant_id=$2", [order.id, gift.variantId]))[0].quantity, -1);
      await db.query("update public.promotions set name='Renamed later' where id=$1", [id]);
      assert.equal((await query("select promotion_name from public.promotion_redemptions where order_id=$1", [order.id]))[0].promotion_name, "Test promotion");
      await db.query("select public.delete_promotion($1)", [id]);
      assert.equal((await benefits([item(p, 25)])).length, 0);
      assert.equal((await query("select * from public.order_items where order_id=$1 and is_promotion_gift", [order.id])).length, 1);
      await db.query("select public.cancel_pos_order($1,'Test cancellation')", [order.id]);
      assert.deepEqual(await stockOf(p.variantId), { stock_quantity: 100, shelf_quantity: 100 });
      assert.deepEqual(await stockOf(gift.variantId), { stock_quantity: 1, shelf_quantity: 1 });
      await db.query("select public.restore_cancelled_orders(array[$1::uuid])", [order.id]);
      assert.deepEqual(await stockOf(gift.variantId), { stock_quantity: 0, shelf_quantity: 0 });
    }));

    await t.test("gift stock is shared across stackable programs without double allocation", () => scenario(async () => {
      const p = await product(), gift = await product({ stock: 1 });
      await giftPromotion(p, { gift_variant_id: gift.variantId, is_stackable: true, priority: 10 });
      await giftPromotion(p, { gift_variant_id: gift.variantId, is_stackable: true });
      const result = await benefits([item(p, 10)]);
      assert.equal(result.reduce((sum, b) => sum + b.gifts[0].quantity, 0), 1);
      const order = await sale([item(p, 10)]);
      assert.equal((await query("select sum(quantity)::integer as qty from public.order_items where order_id=$1 and is_promotion_gift", [order.id]))[0].qty, 1);
    }));

    await t.test("coupon, time window, total usage and customer limits apply to gift programs", () => scenario(async () => {
      const p = await product();
      const id = await giftPromotion(p, { trigger_type: "coupon", code: "GIFT10", total_usage_limit: 1 });
      assert.equal((await benefits([item(p, 10)])).length, 0);
      assert.equal((await benefits([item(p, 10)], null, "gift10"))[0].gifts[0].quantity, 1);
      await db.query("update public.promotions set start_at=now()+interval '1 day' where id=$1", [id]);
      assert.equal((await benefits([item(p, 10)], null, "gift10")).length, 0);
      await db.query("update public.promotions set start_at=null,usage_per_customer=1 where id=$1", [id]);
      assert.equal((await benefits([item(p, 10)], null, "gift10")).length, 0);
      await db.query("update public.promotions set usage_per_customer=null where id=$1", [id]);
      await sale([item(p, 10)], { coupon_code: "GIFT10" });
      assert.equal((await benefits([item(p, 10)], null, "gift10")).length, 0);
    }));

    await t.test("existing monetary discount still works with gift programs", () => scenario(async () => {
      const p = await product();
      const discountId = await promotion({ is_stackable: true, priority: 10 });
      await db.query("insert into public.promotion_scopes(promotion_id,scope_type) values($1,'all')", [discountId]);
      await giftPromotion(p);
      const order = await sale([item(p, 10)]);
      assert.equal(Number(order.discount), 100);
      assert.equal(Number(order.total), 900);
      assert.equal(order.promotion_snapshot.find((b) => b.gifts.length).gifts[0].quantity, 1);
    }));

    await t.test("unused promotion and child scopes/conditions can be deleted", () => scenario(async () => {
      const id = await promotion();
      await db.query("insert into public.promotion_scopes(promotion_id,scope_type) values($1,'all')", [id]);
      await db.query("insert into public.promotion_conditions(promotion_id,condition_type,operator,value) values($1,'quantity','gte','1')", [id]);
      assert.equal((await query("select public.delete_promotion($1) as result", [id]))[0].result, "deleted");
      assert.equal((await query("select * from public.promotions where id=$1", [id])).length, 0);
      assert.equal((await query("select * from public.promotion_scopes where promotion_id=$1", [id])).length, 0);
      assert.equal((await query("select * from public.promotion_conditions where promotion_id=$1", [id])).length, 0);
    }));

    await t.test("used promotion is archived, history survives and reactivation is rejected", () => scenario(async () => {
      const id = await promotion();
      await db.exec("reset role");
      const order = randomUUID();
      await db.query("insert into public.orders(id,code,subtotal,total) values($1,$2,100,90)", [order, order]);
      await db.query("insert into public.promotion_redemptions(promotion_id,order_id,discount_amount) values($1,$2,10)", [id, order]);
      await actor();
      const before = await query("select * from public.promotion_redemptions where promotion_id=$1", [id]);
      assert.equal((await query("select public.delete_promotion($1) as result", [id]))[0].result, "archived");
      const archived = (await query("select * from public.promotions where id=$1", [id]))[0];
      assert.ok(archived.deleted_at);
      assert.equal(archived.is_active, false);
      assert.deepEqual(await query("select * from public.promotion_redemptions where promotion_id=$1", [id]), before);
      await fails("update public.promotions set is_active=true where id=$1", [id], /đã xóa/);
      assert.equal((await query("select public.delete_promotion($1) as result", [id]))[0].result, "archived");
    }));

    await t.test("read-only role cannot delete a promotion", () => scenario(async () => {
      const id = await promotion();
      await actor(reader);
      await fails("select public.delete_promotion($1)", [id], /không có quyền/);
      assert.equal((await query("select * from public.promotions where id=$1", [id])).length, 1);
    }));

    await t.test("update permission cannot bypass deletion permission through a direct update", () => scenario(async () => {
      const id = await promotion();
      await db.exec("reset role");
      await db.exec("update public.app_roles set permissions=array['promotions','promotions.update'] where code='promotion-reader'");
      await actor(reader);
      await fails("update public.promotions set deleted_at=now() where id=$1", [id], /không có quyền/);
      assert.equal((await query("select deleted_at from public.promotions where id=$1", [id]))[0].deleted_at, null);
    }));
  } finally { await db.close(); }
});
