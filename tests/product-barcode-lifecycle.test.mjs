import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const admin = "11111111-1111-4111-8111-111111111111";
const deleter = "22222222-2222-4222-8222-222222222222";
const reader = "33333333-3333-4333-8333-333333333333";
const barcode = "8936181537719";
const readSql = async (path) => (await readFile(new URL(path, import.meta.url), "utf8")).replace(/^\uFEFF/, "");

test("PostgreSQL product deletion and EAN-13 reuse", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    // Supabase Auth helpers are the only platform stubs. Application tables,
    // policies, constraints, triggers, functions and seed run from schema.sql.
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
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
    try { await db.exec(await readSql("../supabase/schema.sql")); }
    catch (error) { throw new Error(`Canonical schema failed: ${error.message}`); }
    await db.query("insert into auth.users(id,email) values ($1,'admin@test.invalid'),($2,'deleter@test.invalid'),($3,'reader@test.invalid')", [admin, deleter, reader]);
    await db.exec(`
      insert into public.app_roles(name,code,permissions)
      values ('Delete test','delete-test',array['products','products.delete']),
             ('Read test','read-test',array['products']);
    `);
    for (const [id, role] of [[admin, "admin"], [deleter, "delete-test"], [reader, "read-test"]]) {
      await db.query("update public.profiles set is_active=true,role_id=(select id from public.app_roles where code=$2) where id=$1", [id, role]);
    }

    async function actor(id) {
      await db.exec("reset role; set local row_security = on");
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
      await db.exec("set local role authenticated");
    }
    async function scenario(work) {
      await db.exec("begin");
      try { await actor(admin); await work(); }
      finally { await db.exec("rollback"); }
    }
    async function fails(sql, params, pattern) {
      await db.exec("savepoint rejected_operation");
      try { await assert.rejects(db.query(sql, params), pattern); }
      finally { await db.exec("rollback to savepoint rejected_operation; release savepoint rejected_operation"); }
    }
    async function createProduct({ code = barcode, stock = 0, status = "active", secondCode } = {}) {
      const id = randomUUID(), variantId = randomUUID();
      const variants = [{ id: variantId, sku: `SKU-${variantId}`, barcode: code, base_price: 50000,
        cost_price: 20000, stock_quantity: stock, shelf_quantity: stock, is_default: true, is_active: true, value_ids: [] }];
      if (secondCode) variants.push({ ...variants[0], id: randomUUID(), sku: `SKU-${randomUUID()}`, barcode: secondCode, stock_quantity: 0, shelf_quantity: 0, is_default: false });
      const payload = { id, name: "Barcode lifecycle test", slug: `test-${id}`, status,
        specifications: [], variant_attributes: [], variants, images: [] };
      await db.query("select public.save_product_engine($1::jsonb)", [JSON.stringify(payload)]);
      return { id, variantId, payload };
    }
    const getVariant = async (id) => (await db.query("select * from public.product_variants where id=$1", [id])).rows[0];
    const getProduct = async (id) => (await db.query("select * from public.products where id=$1", [id])).rows[0];

    await t.test("delete, release, recreate with the same barcode and preserve linked history", () => scenario(async () => {
      const old = await createProduct();
      const orderId = randomUUID();
      // Historical rows are fixtures; production creates orders through its RPC.
      await db.exec("reset role");
      await db.query("insert into public.orders(id,code,subtotal,total) values($1,$2,50000,50000)", [orderId, `ORDER-${orderId}`]);
      await db.query(`insert into public.order_items(order_id,product_id,variant_id,product_name,sku,quantity,unit_price,final_price,line_total)
        values($1,$2,$3,'Historical product','Historical SKU',1,50000,50000,50000)`, [orderId, old.id, old.variantId]);
      await db.query("insert into public.stock_movements(variant_id,movement_type,quantity,actor_name) values($1,'sale',-1,'Historical cashier')", [old.variantId]);
      await actor(admin);
      const ordersBefore = (await db.query("select * from public.order_items where order_id=$1", [orderId])).rows;
      const stockBefore = (await db.query("select * from public.stock_movements where variant_id=$1", [old.variantId])).rows;
      const skuBefore = await getVariant(old.variantId);
      await db.query("select public.soft_delete_product($1)", [old.id]);
      const archived = await getVariant(old.variantId);
      assert.equal(archived.barcode, null);
      assert.equal(archived.archived_barcode, barcode);
      assert.equal(archived.sku, skuBefore.sku);
      assert.equal(archived.base_price, skuBefore.base_price);
      assert.equal(archived.is_active, false);
      assert.equal(archived.is_default, false);
      assert.ok((await getProduct(old.id)).deleted_at);
      const replacement = await createProduct();
      assert.equal((await getVariant(replacement.variantId)).barcode, barcode);
      assert.notEqual(replacement.variantId, old.variantId);
      assert.deepEqual((await db.query("select * from public.order_items where order_id=$1", [orderId])).rows, ordersBefore);
      assert.deepEqual((await db.query("select * from public.stock_movements where variant_id=$1", [old.variantId])).rows, stockBefore);
    }));

    await t.test("a stocked product cannot be deleted or release any sibling barcode", () => scenario(async () => {
      const product = await createProduct({ stock: 4, secondCode: "4006381333931" });
      const variantsBefore = (await db.query("select * from public.product_variants where product_id=$1 order by id", [product.id])).rows;
      await fails("select public.soft_delete_product($1)", [product.id], /PRODUCT_HAS_STOCK/);
      assert.equal((await getProduct(product.id)).deleted_at, null);
      assert.deepEqual((await db.query("select * from public.product_variants where product_id=$1 order by id", [product.id])).rows, variantsBefore);
    }));

    await t.test("inactive products retain their codes and uniqueness still blocks reuse", () => scenario(async () => {
      const product = await createProduct({ status: "inactive" });
      const duplicate = { ...product.payload, id: randomUUID(), slug: `other-${randomUUID()}`,
        variants: [{ ...product.payload.variants[0], id: randomUUID(), sku: `NEW-${randomUUID()}` }] };
      await fails("select public.save_product_engine($1::jsonb)", [JSON.stringify(duplicate)], /product_variants_barcode_key/);
      assert.equal((await getVariant(product.variantId)).barcode, barcode);
    }));

    await t.test("a stale editor cannot reclaim a released barcode on a deleted product", () => scenario(async () => {
      const product = await createProduct();
      await db.query("select public.soft_delete_product($1)", [product.id]);
      await fails("select public.save_product_engine($1::jsonb)", [JSON.stringify(product.payload)], /PRODUCT_DELETED/);
      assert.equal((await getVariant(product.variantId)).barcode, null);
      assert.equal((await getVariant(product.variantId)).archived_barcode, barcode);
      const replacement = await createProduct();
      assert.equal((await getVariant(replacement.variantId)).barcode, barcode);
    }));

    await t.test("delete permission alone can retire SKUs and release codes", () => scenario(async () => {
      const product = await createProduct();
      await actor(deleter);
      assert.equal((await db.query("select public.has_permission('products.update') as allowed")).rows[0].allowed, false);
      await db.query("select public.soft_delete_product($1)", [product.id]);
      assert.equal((await getVariant(product.variantId)).barcode, null);
      await fails("update public.product_variants set base_price=999 where id=$1", [product.variantId], /Permission denied/);
      await fails("update public.product_variants set stock_quantity=1,shelf_quantity=1 where id=$1", [product.variantId], /Permission denied/);
    }));

    await t.test("read-only, anonymous and service-role sessions cannot use the narrow release rule", () => scenario(async () => {
      const product = await createProduct();
      await actor(reader);
      await fails("select public.soft_delete_product($1)", [product.id], /Permission denied/);
      assert.equal((await getVariant(product.variantId)).barcode, barcode);
      await db.exec("reset role; set local role anon");
      await db.query("select set_config('request.jwt.claims','{}',true)");
      await fails("select public.soft_delete_product($1)", [product.id], /Permission denied/);
      await actor(admin);
      await db.query("select public.soft_delete_product($1)", [product.id]);
      await db.exec("reset role; set local role service_role");
      await db.query("select set_config('request.jwt.claims','{}',true)");
      await fails("update public.product_variants set barcode=null,archived_barcode=archived_barcode,is_active=false,is_default=false where id=$1", [product.variantId], /Permission denied/);
    }));

    await t.test("a missing or already deleted product fails without changing its saved barcode", () => scenario(async () => {
      await fails("select public.soft_delete_product($1)", [randomUUID()], /Product not found/);
      const product = await createProduct();
      await db.query("select public.soft_delete_product($1)", [product.id]);
      await fails("select public.soft_delete_product($1)", [product.id], /Product not found/);
      assert.equal((await getVariant(product.variantId)).archived_barcode, barcode);
    }));

    await t.test("upgrade repairs legacy deleted products, skips stocked siblings and is repeatable", async () => {
      await db.exec(await readSql("fixtures/product-barcodes-before-release.sql"));
      await db.exec("alter table public.product_variants drop column archived_barcode");
      await db.exec("begin");
      await actor(admin);
      const deleted = await createProduct();
      await db.query("select public.soft_delete_product($1)", [deleted.id]);
      const inactive = await createProduct({ code: "4006381333931", status: "inactive" });
      const stocked = await createProduct({ code: "0012345678905", stock: 2, secondCode: "8931234567897" });
      await db.query("update public.products set deleted_at=now(),status='inactive' where id=$1", [stocked.id]);
      await db.exec("commit; reset role");
      const stockedBefore = (await db.query("select id,barcode,is_active,stock_quantity from public.product_variants where product_id=$1 order by id", [stocked.id])).rows;
      assert.equal((await getVariant(deleted.variantId)).barcode, barcode, "Legacy delete reproduces the reported reservation");
      const migration = await readSql("../supabase/migrations/202610170002_release_deleted_product_barcodes.sql");
      try { await db.exec(migration); }
      catch (error) { throw new Error(`Barcode migration failed: ${error.message}`); }
      const repaired = await getVariant(deleted.variantId);
      assert.equal(repaired.barcode, null);
      assert.equal(repaired.archived_barcode, barcode);
      assert.equal((await getVariant(inactive.variantId)).barcode, "4006381333931");
      assert.deepEqual((await db.query("select id,barcode,is_active,stock_quantity from public.product_variants where product_id=$1 order by id", [stocked.id])).rows, stockedBefore);
      await db.exec(migration);
      assert.deepEqual(await getVariant(deleted.variantId), repaired);
      await scenario(async () => {
        const replacement = await createProduct();
        assert.equal((await getVariant(replacement.variantId)).barcode, barcode);
        await actor(deleter);
        await db.query("select public.soft_delete_product($1)", [replacement.id]);
        assert.equal((await getVariant(replacement.variantId)).archived_barcode, barcode);
        await actor(admin);
        await fails("select public.save_product_engine($1::jsonb)", [JSON.stringify(deleted.payload)], /PRODUCT_DELETED/);
      });
    });
  } finally { await db.close(); }
});
