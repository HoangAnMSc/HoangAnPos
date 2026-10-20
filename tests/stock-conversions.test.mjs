import assert from "node:assert/strict";
import { randomUUID, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const readSql = async (path) => (await readFile(new URL(path, import.meta.url), "utf8")).replace(/^\uFEFF/, "");

test("stock conversion preview requires complete units and matches database integer bounds", async () => {
  const bundle = await build({ entryPoints: ["src/lib/stockConversions.ts"], bundle: true, write: false, format: "esm", platform: "node" });
  const { getConversionQuantity } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  assert.equal(getConversionQuantity(2, 1, 12), 24);
  assert.equal(getConversionQuantity(12, 12, 1), 1);
  assert.equal(getConversionQuantity(24, 12, 1), 2);
  assert.equal(getConversionQuantity(6, 3, 10), 20);
  for (const args of [[1, 12, 1], [13, 12, 1], [0, 1, 12], [-1, 1, 12], [1.5, 1, 12], [1, 0, 12], [2_147_483_647, 1, 12]]) {
    assert.equal(getConversionQuantity(...args), null);
  }
});

test("conversion requests work on browsers without crypto.randomUUID and keep valid unique UUIDs", async () => {
  const bundle = await build({ entryPoints: ["src/lib/stockConversions.ts"], bundle: true, write: false, format: "esm", platform: "node" });
  const { createStockConversionRequestId } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) } });
    const ids = Array.from({ length: 1000 }, () => createStockConversionRequestId());
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every((id) => /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(id)));
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
    assert.throws(createStockConversionRequestId, /Trình duyệt không hỗ trợ/);
  } finally {
    if (original) Object.defineProperty(globalThis, "crypto", original);
    else delete globalThis.crypto;
  }
});

test("stock conversion upgrade, permissions, atomic inventory and idempotent retries against PostgreSQL", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const admin = randomUUID(), configurer = randomUUID(), operator = randomUUID(), viewer = randomUUID(), otherOperator = randomUUID();
  const product = randomUUID(), otherProduct = randomUUID(), a = randomUUID(), b = randomUUID(), foreignVariant = randomUUID(), foreignVariantB = randomUUID();
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
  const one = async (sql, params = []) => (await rows(sql, params))[0];
  const migration = await readSql("../supabase/migrations/202610200001_stock_conversions.sql");
  const managementUpgrade = await readSql("../supabase/migrations/202610200002_stock_conversion_management.sql");
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key,email text,phone text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$
        select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
      $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
      $$;
      grant usage on schema auth to anon,authenticated,service_role;
      grant execute on all functions in schema auth to anon,authenticated,service_role;
    `);
    const schema = await readSql("../supabase/schema.sql");
    assert.ok(schema.includes(migration), "Fresh installations include the original conversion upgrade");
    assert.ok(schema.includes(managementUpgrade), "Fresh installations include exactly the tested management upgrade");
    // Start with the old database, insert real existing data, then apply the upgrade.
    const conversionStart = schema.indexOf("-- Stock conversion feature: additive migration for fresh installations.");
    assert.ok(conversionStart > 0);
    await db.exec(schema.slice(0, conversionStart));
    for (const [id, name] of [[admin,"admin"],[configurer,"configurer"],[operator,"operator"],[viewer,"viewer"],[otherOperator,"other-operator"]]) {
      await db.query("insert into auth.users(id,email) values($1,$2)", [id, `${name}@example.invalid`]);
    }
    await db.exec(`insert into public.app_roles(name,code,permissions) values
      ('Conversion configuration','conversion-config',array['warehouse','warehouse.conversion.configure']),
      ('Conversion execution','conversion-execute',array['warehouse','warehouse.conversion.execute']),
      ('Warehouse viewer','conversion-view',array['warehouse']);`);
    for (const [id, role] of [[admin,"admin"],[configurer,"conversion-config"],[operator,"conversion-execute"],[otherOperator,"conversion-execute"],[viewer,"conversion-view"]]) {
      await db.query("update public.profiles set role='staff',is_active=true,role_id=(select id from public.app_roles where code=$2) where id=$1", [id, role]);
    }
    async function actor(id) {
      await db.exec("reset role; set local row_security=on");
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
      await db.exec("set local role authenticated");
    }
    async function scenario(id, work) {
      await db.exec("begin");
      try { await actor(id); await work(); }
      finally { await db.exec("rollback; reset role"); }
    }
    async function rejected(sql, params, pattern) {
      await db.exec("savepoint rejected_conversion");
      try { await assert.rejects(db.query(sql, params), pattern); }
      finally { await db.exec("rollback to savepoint rejected_conversion; release savepoint rejected_conversion"); }
    }
    async function stock() {
      return rows("select id,stock_quantity,shelf_quantity,cost_price,base_price,barcode from public.product_variants order by id");
    }
    async function state() {
      return {
        variants: await stock(), batches: await rows("select * from public.product_batches order by id"),
        movements: await rows("select * from public.stock_movements order by id"),
        events: await rows("select * from public.stock_conversion_events order by id"),
      };
    }
    const saveSql = "select * from public.save_stock_conversion($1,$2,$3,$4,$5,$6,$7)";
    const executeSql = "select * from public.execute_stock_conversion($1,$2,$3,$4,$5,$6)";
    const deleteSql = "select public.delete_stock_conversion($1,$2) as id";
    await db.exec("begin"); await actor(admin);
    await db.query("insert into public.products(id,name,slug,status) values($1,'Sữa kiểm thử','conversion-milk','active'),($2,'Sản phẩm khác','conversion-other','active')", [product,otherProduct]);
    await db.query(`insert into public.product_variants(id,product_id,sku,barcode,stock_quantity,cost_price,base_price,is_active)
      values($1,$4,'THUNG','8936181537719',10,120000,150000,true),
            ($2,$4,'LOC','4006381333931',2,10000,15000,true),
            ($3,$5,'OTHER',null,7,5000,9000,true)`, [a,b,foreignVariant,product,otherProduct]);
    await db.query("insert into public.product_variants(id,product_id,sku,stock_quantity,cost_price,base_price,is_active) values($1,$2,'OTHER-PACK',0,1000,2000,true)", [foreignVariantB,otherProduct]);
    await db.query("insert into public.product_batches(variant_id,quantity,import_date,expiry_date) values($1,10,'2026-10-01','2027-01-01'),($2,2,'2026-10-02','2027-02-01')", [a,b]);
    await db.exec("reset role");
    await db.query("insert into public.orders(code,subtotal,total) values('CONVERSION-EXISTING-ORDER',50000,50000)");
    await db.exec("commit; reset role");
    const productsBefore = await rows("select * from public.products order by id");
    const stockBefore = await stock();
    const ordersBefore = await rows("select * from public.orders order by id");
    const rolesBefore = await rows("select * from public.app_roles order by id");
    await db.exec(migration);
    await db.exec(migration);
    assert.deepEqual(await rows("select * from public.products order by id"), productsBefore);
    assert.deepEqual(await stock(), stockBefore);
    assert.deepEqual(await rows("select * from public.orders order by id"), ordersBefore);
    assert.deepEqual(await rows("select * from public.app_roles order by id"), rolesBefore);

    await db.exec("begin"); await actor(configurer);
    const setting = await one(saveSql, [product,a,1,b,12,null,null]);
    await db.exec("commit; reset role");
    const configuredBeforeUpgrade = await rows("select * from public.stock_conversions order by id");
    await db.exec(managementUpgrade);
    await db.exec(managementUpgrade);
    assert.deepEqual(await rows("select * from public.stock_conversions order by id"), configuredBeforeUpgrade);
    assert.deepEqual(await stock(), stockBefore);
    assert.deepEqual(await rows("select * from public.orders order by id"), ordersBefore);
    assert.deepEqual(await rows("select * from public.app_roles order by id"), rolesBefore);

    await t.test("configuration permission does not grant execution and execution does not grant configuration", async () => {
      await scenario(configurer, async () => {
        await rejected(executeSql, [setting.id,false,1,randomUUID(),setting.updated_at,""], /không có quyền thực hiện/);
      });
      await scenario(operator, async () => {
        await rejected(saveSql, [product,a,1,b,12,setting.id,setting.updated_at], /không có quyền thiết lập/);
        await rejected("update public.stock_conversions set quantity_b=99", [], /permission denied/i);
        await rejected(deleteSql, [setting.id,setting.updated_at], /không có quyền xóa/);
        await rejected("delete from public.stock_conversions where id=$1", [setting.id], /permission denied/i);
        assert.equal((await rows("update public.product_variants set stock_quantity=999 where id=$1 returning id", [a])).length,0);
        assert.equal((await one("select stock_quantity from public.product_variants where id=$1",[a])).stock_quantity,10);
      });
      await scenario(viewer, async () => {
        assert.equal((await rows("select * from public.stock_conversions")).length,0);
        await rejected(executeSql, [setting.id,false,1,randomUUID(),setting.updated_at,""], /không có quyền/);
        await rejected(deleteSql, [setting.id,setting.updated_at], /không có quyền xóa/);
      });
      await db.exec("begin; set local role anon");
      try {
        await rejected(executeSql,[setting.id,false,1,randomUUID(),setting.updated_at,""], /permission denied/i);
        await rejected(deleteSql,[setting.id,setting.updated_at], /permission denied/i);
      }
      finally { await db.exec("rollback; reset role"); }
    });

    await t.test("same-product active variants, distinct pairs and positive ratios are enforced on the server", () => scenario(configurer, async () => {
      await rejected(saveSql,[product,a,1,foreignVariant,12,null,null],/cùng sản phẩm/);
      await rejected(saveSql,[product,a,1,a,12,null,null],/khác nhau/);
      await rejected(saveSql,[product,a,0,b,12,null,null],/lớn hơn 0/);
      await rejected(saveSql,[product,b,12,a,1,null,null],/đã có thiết lập/);
      await rejected(saveSql,[otherProduct,a,1,b,12,setting.id,setting.updated_at],/cùng sản phẩm/);
    }));

    await t.test("changing a setting product retains its identity and historical product snapshots without moving stock", () => scenario(operator, async () => {
      const event = await one(executeSql,[setting.id,false,1,randomUUID(),setting.updated_at,"Before product change"]);
      const before = await state();
      await actor(configurer);
      const changed = await one(saveSql,[otherProduct,foreignVariant,1,foreignVariantB,6,setting.id,setting.updated_at]);
      assert.equal(changed.id,setting.id);
      assert.equal(changed.product_id,otherProduct);
      assert.deepEqual(await state(),before);
      assert.equal((await one("select product_id from public.stock_conversion_events where id=$1",[event.id])).product_id,product);
      await rejected(saveSql,[product,a,1,b,12,setting.id,setting.updated_at],/đã thay đổi/);
      await actor(operator);
      await rejected(executeSql,[setting.id,false,1,randomUUID(),setting.updated_at,""],/đã thay đổi/);
      const next = await one(executeSql,[changed.id,false,1,randomUUID(),changed.updated_at,""]);
      assert.equal(next.product_id,otherProduct);
      assert.equal(next.source_stock_after,6);
      assert.equal(next.target_stock_after,6);
    }));

    await t.test("deleting a setting preserves stocks, batches, movements and historical snapshots", () => scenario(operator, async () => {
      const event = await one(executeSql,[setting.id,false,1,randomUUID(),setting.updated_at,"Before deletion"]);
      await actor(configurer);
      const before = await state();
      await rejected(deleteSql,[setting.id,"2000-01-01T00:00:00Z"],/đã thay đổi/);
      assert.equal((await one(deleteSql,[setting.id,setting.updated_at])).id,setting.id);
      assert.equal((await rows("select id from public.stock_conversions where id=$1",[setting.id])).length,0);
      const after = await state();
      assert.deepEqual(after.variants,before.variants);
      assert.deepEqual(after.batches,before.batches);
      assert.deepEqual(after.movements,before.movements);
      assert.deepEqual(after.events,before.events.map((item) => ({...item,conversion_id:null})));
      assert.equal((await one("select product_name from public.stock_conversion_events where id=$1",[event.id])).product_name,"Sữa kiểm thử");
      assert.equal((await one(deleteSql,[setting.id,setting.updated_at])).id,setting.id);
      await actor(operator);
      await rejected(executeSql,[setting.id,false,1,randomUUID(),setting.updated_at,""],/không còn tồn tại/);
      assert.deepEqual(await state(),after);
    }));

    await t.test("forward and reverse conversions preserve prices and unrelated stock and carry expiry", () => scenario(operator, async () => {
      const request = randomUUID();
      const forward = await one(executeSql,[setting.id,false,2,request,setting.updated_at,"Tách thùng"]);
      assert.equal(forward.source_stock_after,8); assert.equal(forward.target_stock_after,26);
      assert.equal(forward.target_quantity,24);
      assert.equal(Number((await one("select cost_price from public.product_variants where id=$1",[a])).cost_price),120000);
      assert.equal(Number((await one("select base_price from public.product_variants where id=$1",[b])).base_price),15000);
      assert.equal((await one("select stock_quantity from public.product_variants where id=$1",[foreignVariant])).stock_quantity,7);
      const batch = await one("select * from public.product_batches where variant_id=$1 and quantity=24",[b]);
      assert.equal(new Date(batch.expiry_date).toISOString().slice(0,10),"2027-01-01");
      const movements = await rows("select quantity,reference_id from public.stock_movements where reference_type='stock_conversion' order by quantity");
      assert.deepEqual(movements.map((row) => row.quantity),[-2,24]);
      assert.ok(movements.every((row) => row.reference_id===request));
      const reverse = await one(executeSql,[setting.id,true,12,randomUUID(),setting.updated_at,"Ghép lại"]);
      assert.equal(reverse.source_stock_after,14); assert.equal(reverse.target_stock_after,9);
      assert.equal(reverse.target_quantity,1);
    }));

    await t.test("insufficient, fractional, excessive and stale requests leave all stock and history untouched", () => scenario(operator, async () => {
      const before = await state();
      await rejected(executeSql,[setting.id,false,11,randomUUID(),setting.updated_at,""],/Không đủ tồn/);
      await rejected(executeSql,[setting.id,true,1,randomUUID(),setting.updated_at,""],/bội số/);
      await rejected(executeSql,[setting.id,false,0,randomUUID(),setting.updated_at,""],/lớn hơn 0/);
      await rejected(executeSql,[setting.id,false,2147483647,randomUUID(),setting.updated_at,""],/vượt giới hạn/);
      await rejected(executeSql,[setting.id,false,1,randomUUID(),"2000-01-01T00:00:00Z",""],/đã thay đổi/);
      assert.deepEqual(await state(),before);
    }));

    await t.test("retrying one request cannot deduct stock twice or reuse another payload", () => scenario(operator, async () => {
      const request = randomUUID();
      const params = [setting.id,false,2,request,setting.updated_at,"Retry"];
      const first = await one(executeSql,params);
      const afterFirst = await state();
      const retry = await one(executeSql,params);
      assert.equal(retry.id,first.id);
      assert.deepEqual(await state(),afterFirst);
      await rejected(executeSql,[setting.id,false,3,request,setting.updated_at,"Retry"],/đã được sử dụng/);
      await actor(otherOperator);
      await rejected(executeSql,params,/đã được sử dụng/);
    }));

    await t.test("a late history failure rolls back both variants and all batch changes", () => scenario(admin, async () => {
      await db.exec("reset role");
      await db.exec(`create function public.fail_test_conversion() returns trigger language plpgsql as $$
        begin if new.note='force rollback' then raise exception 'forced history failure'; end if; return new; end $$;
        create trigger fail_test_conversion before insert on public.stock_conversion_events for each row execute function public.fail_test_conversion();`);
      await actor(operator);
      const before = await state();
      await rejected(executeSql,[setting.id,false,1,randomUUID(),setting.updated_at,"force rollback"],/forced history failure/);
      assert.deepEqual(await state(),before);
    }));

    await t.test("deactivated products, variants and revoked roles cannot execute saved settings", () => scenario(admin, async () => {
      await db.query("update public.product_variants set is_active=false where id=$1",[b]);
      await actor(operator);
      await rejected(executeSql,[setting.id,false,1,randomUUID(),setting.updated_at,""],/không còn hoạt động/);
      await actor(admin);
      await db.query("update public.product_variants set is_active=true where id=$1",[b]);
      await db.query("update public.products set status='inactive' where id=$1",[product]);
      await actor(operator);
      await rejected(executeSql,[setting.id,false,1,randomUUID(),setting.updated_at,""],/không còn hoạt động/);
      await actor(admin);
      await db.query("update public.app_roles set is_active=false where code='conversion-execute'");
      await actor(operator);
      await rejected(executeSql,[setting.id,false,1,randomUUID(),setting.updated_at,""],/không có quyền/);
    }));

    await t.test("upgrade is repeatable after settings and history exist without losing data", async () => {
      await db.exec("begin"); await actor(operator);
      await one(executeSql,[setting.id,false,1,randomUUID(),setting.updated_at,""]);
      await db.exec("commit; reset role");
      const before = await state();
      const settingsBefore = await rows("select * from public.stock_conversions order by id");
      await db.exec(managementUpgrade);
      assert.deepEqual(await state(),before);
      assert.deepEqual(await rows("select * from public.stock_conversions order by id"),settingsBefore);
      assert.deepEqual(await rows("select * from public.orders order by id"),ordersBefore);
      assert.deepEqual(await rows("select * from public.products order by id"),productsBefore);
      assert.deepEqual(await rows("select * from public.app_roles order by id"),rolesBefore);
    });
  } finally { await db.close(); }
});
