import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const sqlFile = async (name) => (await readFile(new URL(`../supabase/${name}`, import.meta.url), "utf8")).replace(/^\uFEFF/, "");

test("HSD groups same dates across receipts and handles business-day boundaries without losing unknown dates", async () => {
  const bundle = await build({ entryPoints: ["src/lib/stockExpiry.ts"], bundle: true, write: false, format: "esm", platform: "node" });
  const { stockExpiryToday, expiryStatus, expiryDaysLeft, groupStockExpiry, summarizeStockExpiry } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  assert.equal(stockExpiryToday(new Date("2026-10-19T17:00:00Z")), "2026-10-20");
  assert.equal(expiryDaysLeft("2028-03-01", "2028-02-28"), 2);
  assert.equal(expiryStatus("2026-12-09", true, 30, "2026-12-10"), "expired");
  assert.equal(expiryStatus("2026-12-10", true, 0, "2026-12-10"), "warning");
  assert.equal(expiryStatus("2027-01-09", true, 30, "2026-12-10"), "warning");
  assert.equal(expiryStatus("2027-01-10", true, 30, "2026-12-10"), "valid");
  const lots = [
    { id: "a", receipt_id: "one", expiry_date: "2026-12-28", remaining_quantity: 8, tracks_expiry: true },
    { id: "b", receipt_id: "two", expiry_date: "2026-12-28", remaining_quantity: 5, tracks_expiry: true },
    { id: "c", expiry_date: null, remaining_quantity: 3, tracks_expiry: true },
    { id: "d", expiry_date: null, remaining_quantity: 4, tracks_expiry: false },
    { id: "empty", expiry_date: "2020-01-01", remaining_quantity: 0, tracks_expiry: true },
  ];
  const before = JSON.stringify(lots);
  const groups = groupStockExpiry(lots, 30, "2026-12-10");
  assert.equal(groups.length, 3);
  assert.equal(groups.find((group) => group.date === "2026-12-28").quantity, 13);
  assert.equal(groups.find((group) => group.date === "2026-12-28").lots.length, 2);
  assert.equal(groups.find((group) => group.status === "pending").quantity, 3);
  assert.equal(groups.find((group) => group.status === "untracked").quantity, 4);
  assert.equal(JSON.stringify(lots), before);
  const summary = summarizeStockExpiry(lots, 1, "2026-12-10");
  assert.equal(summary.status,"valid", "Pending entry cannot hide a known HSD color");
  assert.equal(summary.unknownQuantity,7);
  assert.equal(summary.pending,3);
});

test("PostgreSQL expiry upgrade preserves data and accounts for receipts, sales, returns, conversion and edits", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const admin = randomUUID(), viewer = randomUUID(), manager = randomUUID(), cashier = randomUUID();
  const product = randomUUID(), otherProduct = randomUUID(), box = randomUUID(), pack = randomUUID(), mismatch = randomUUID();
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
  const one = async (sql, params = []) => (await rows(sql, params))[0];
  const upgrade = await sqlFile("migrations/202610200003_stock_expiry.sql");
  const cancellationUpgrade = await sqlFile("migrations/202610200004_cancel_order_deleted_products.sql");
  const managementUpgrade = await sqlFile("migrations/202610200005_stock_expiry_management.sql");
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key,email text,phone text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
      grant usage on schema auth to anon,authenticated,service_role;
      grant execute on all functions in schema auth to anon,authenticated,service_role;`);
    const schema = await sqlFile("schema.sql");
    assert.ok(schema.includes(upgrade), "Fresh installs include exactly the tested expiry upgrade");
    assert.ok(schema.includes(cancellationUpgrade), "Fresh installs include exactly the tested cancellation upgrade");
    assert.ok(schema.endsWith(managementUpgrade), "Fresh installs include exactly the tested HSD management upgrade");
    await db.exec(schema.slice(0, schema.indexOf("-- Stock expiry feature: additive migration for fresh installations.")));
    for (const [id, role] of [[admin,"admin"],[viewer,"expiry-view"],[manager,"expiry-manage"],[cashier,"expiry-cashier"]]) {
      await db.query("insert into auth.users(id,email) values($1,$2)", [id,`${role}@test.invalid`]);
    }
    await db.exec(`insert into public.app_roles(name,code,permissions) values
      ('Expiry viewer','expiry-view',array['warehouse']),
      ('Expiry manager','expiry-manage',array['warehouse','warehouse.expiry.manage']),
      ('Expiry cashier','expiry-cashier',array['warehouse','pos.checkout','products.receive-stock']);`);
    for (const [id, role] of [[admin,"admin"],[viewer,"expiry-view"],[manager,"expiry-manage"],[cashier,"expiry-cashier"]]) {
      await db.query("update public.profiles set is_active=true,role_id=(select id from public.app_roles where code=$2) where id=$1", [id,role]);
    }
    async function actor(id = admin) {
      await db.exec("reset role; set local row_security=on");
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({sub:id,role:"authenticated"})]);
      await db.exec("set local role authenticated");
    }
    async function scenario(id, work) { await db.exec("begin"); try { await actor(id); await work(); } finally { await db.exec("rollback; reset role"); } }
    async function fails(sql, params, pattern) {
      await db.exec("savepoint rejected_expiry");
      try { await assert.rejects(db.query(sql,params),pattern); }
      finally { await db.exec("rollback to savepoint rejected_expiry; release savepoint rejected_expiry"); }
    }
    const originalState = async () => ({
      products: await rows("select * from public.products order by id"),
      variants: await rows("select * from public.product_variants order by id"),
      batches: await rows("select * from public.product_batches order by id"),
      orders: await rows("select * from public.orders order by id"),
      roles: await rows("select * from public.app_roles order by id"),
    });
    const state = async () => ({...await originalState(),
      receipts: await rows("select * from public.stock_expiry_receipts order by id"),
      lots: await rows("select * from public.stock_expiry_lots order by id"),
      allocations: await rows("select * from public.stock_expiry_allocations order by id"),
      movements: await rows("select * from public.stock_movements order by id"),
      items: await rows("select * from public.order_items order by id"),
      customers: await rows("select * from public.customers order by id"),
      audit: await rows("select * from public.order_audit_events order by id"),
    });
    const date = async (days) => (await one("select ((now() at time zone 'Asia/Bangkok')::date+$1::integer)::text as d",[days])).d;
    const stock = async (id) => (await one("select stock_quantity from public.product_variants where id=$1",[id])).stock_quantity;
    const balance = async (id) => Number((await one("select coalesce(sum(remaining_quantity),0) as total from public.stock_expiry_lots where variant_id=$1",[id])).total);
    const pendingLot = async (id) => one("select l.* from public.stock_expiry_lots l join public.stock_expiry_receipts r on r.id=l.receipt_id where l.variant_id=$1 and r.tracks_expiry and l.expiry_date is null and l.remaining_quantity>0 order by r.created_at desc,l.id limit 1",[id]);
    const receiveSql = "select public.receive_stock_with_expiry($1::jsonb,$2) as count";
    const assignSql = "select public.assign_stock_expiry($1,$2,$3::jsonb,$4) as id";
    const receive = async (id, qty, tracked = true, request = randomUUID()) => one(receiveSql,[JSON.stringify([{variant_id:id,quantity:qty,has_expiry:tracked}]),request]);
    const assign = async (lot, parts, request = randomUUID()) => one(assignSql,[lot.id,lot.updated_at,JSON.stringify(parts),request]);
    const listed = async (id) => one("select * from public.list_stock_expiry() where variant_id=$1",[id]);
    const targets = (lots) => JSON.stringify(lots.map(({ id,updated_at }) => ({ id,updated_at })));
    const setSql = "select public.set_stock_expiry($1,$2::jsonb,$3::jsonb,$4) as quantity";
    const clearSql = "select public.clear_stock_expiry($1,$2::jsonb,$3) as quantity";
    const setDates = async (id,lots,parts,request = randomUUID()) => one(setSql,[id,targets(lots),JSON.stringify(parts),request]);
    const clearDates = async (id,lots,request = randomUUID()) => one(clearSql,[id,targets(lots),request]);
    const sell = async (id, qty) => one("select * from public.create_pos_order($1,1000000,$2,null,0,$3::jsonb,null,'cash',null,null)",[admin,randomUUID(),JSON.stringify([{variant_id:id,quantity:qty}])]);
    async function assertBalanced() {
      const bad = await rows("select v.id from public.product_variants v left join public.stock_expiry_lots l on l.variant_id=v.id group by v.id,v.stock_quantity having coalesce(sum(l.remaining_quantity),0)<>v.stock_quantity");
      assert.deepEqual(bad, []);
    }

    await db.exec("begin"); await actor();
    await db.query("insert into public.products(id,name,slug,status) values($1,'Sữa thử HSD','expiry-milk','active'),($2,'Hàng cũ','expiry-other','active')",[product,otherProduct]);
    await db.query(`insert into public.product_variants(id,product_id,sku,stock_quantity,cost_price,base_price,is_active)
      values($1,$4,'BOX',10,10,100,true),($2,$4,'PACK',0,1,10,true),($3,$5,'MISMATCH',4,1,10,true)`,[box,pack,mismatch,product,otherProduct]);
    await db.query("insert into public.product_batches(variant_id,quantity,import_date,expiry_date) values($1,10,current_date,$2),($3,6,current_date,$4)",[box,await date(5),mismatch,await date(10)]);
    await db.exec("reset role");
    await db.query("insert into public.orders(code,subtotal,total) values('EXISTING-HSD-ORDER',100,100)");
    await db.exec("commit; reset role");
    const beforeUpgrade = await originalState();
    await db.exec(upgrade);
    await db.exec(cancellationUpgrade);
    await db.exec(managementUpgrade);
    assert.deepEqual(await originalState(),beforeUpgrade);
    await assertBalanced();
    const seeded = await state();
    await db.exec(upgrade);
    await db.exec(managementUpgrade);
    assert.deepEqual(await state(),seeded);

    await t.test("legacy batch mismatch becomes unknown without overwriting old stock or expiry dates", async () => {
      const unknown = await pendingLot(mismatch);
      assert.equal(unknown.remaining_quantity,4);
      assert.equal(unknown.expiry_date,null);
      assert.equal((await one("select quantity from public.product_batches where variant_id=$1",[mismatch])).quantity,6);
    });

    await t.test("read, allocation, settings and receipt permissions remain independent; internal writes are denied", () => scenario(viewer,async () => {
      assert.ok((await rows("select * from public.list_stock_expiry()")).length);
      await fails(receiveSql,[JSON.stringify([{variant_id:box,quantity:1,has_expiry:true}]),randomUUID()],/không có quyền nhập/);
      const lot = await pendingLot(mismatch);
      await fails(assignSql,[lot.id,lot.updated_at,JSON.stringify([{expiry_date:await date(20),quantity:4}]),randomUUID()],/không có quyền/);
      await fails("select public.save_stock_expiry_settings(10,now())",[],/không có quyền/);
      await fails("update public.stock_expiry_lots set remaining_quantity=0",[],/permission denied/i);
      await fails("select public._stock_expiry_add($1,1,true,null,'fake')",[box],/permission denied/i);
      await fails("select public.prepare_stock_expiry($1)",[box],/không có quyền/);
      await fails(setSql,[box,'[]','[]',randomUUID()],/không có quyền/);
      await fails(clearSql,[box,'[]',randomUUID()],/không có quyền/);
      await fails("select public._stock_expiry_move_part($1,1,null,false)",[lot.id],/permission denied/i);
    }));

    await t.test("receipt retries and invalid bulk lines cannot duplicate or partly add stock", () => scenario(admin,async () => {
      const request = randomUUID();
      await receive(box,20,true,request);
      assert.equal(await stock(box),30);
      await receive(box,20,true,request);
      assert.equal(await stock(box),30);
      await fails(receiveSql,[JSON.stringify([{variant_id:box,quantity:21,has_expiry:true}]),request],/đã dùng/);
      const before = await state();
      await fails(receiveSql,[null,randomUUID()],/Hãy chọn/);
      await fails(receiveSql,[JSON.stringify([{variant_id:box,quantity:1,has_expiry:true},{variant_id:pack,quantity:-1}]),randomUUID()],/greater than zero/);
      assert.deepEqual(await state(),before);
      await assertBalanced();
    }));

    await t.test("deferred HSD allocation splits each receipt, groups repeat dates and never adds stock", () => scenario(admin,async () => {
      await receive(pack,20);
      const first = await pendingLot(pack), request = randomUUID();
      const parts = [{expiry_date:await date(18),quantity:8},{expiry_date:await date(20),quantity:12}];
      const before = await originalState();
      await assign(first,parts,request);
      await assign(first,parts,request);
      assert.deepEqual(await originalState(),before);
      await receive(pack,12);
      await assign(await pendingLot(pack),[{expiry_date:await date(18),quantity:5},{expiry_date:await date(20),quantity:7}]);
      const grouped = await rows("select expiry_date::text as date,sum(remaining_quantity)::integer as qty,count(distinct receipt_id)::integer as receipts from public.stock_expiry_lots where variant_id=$1 and remaining_quantity>0 group by expiry_date order by expiry_date",[pack]);
      assert.deepEqual(grouped.map((row) => [row.qty,row.receipts]),[[13,2],[19,2]]);
      assert.equal(await stock(pack),32); await assertBalanced();
    }));

    await t.test("allocation rejects stale stock, incomplete totals and invalid dates atomically", () => scenario(admin,async () => {
      await receive(pack,12);
      const lot = await pendingLot(pack), before = await state();
      await fails(assignSql,[lot.id,lot.updated_at,null,randomUUID()],/ít nhất một HSD/);
      await fails(assignSql,[lot.id,lot.updated_at,JSON.stringify([{expiry_date:await date(20),quantity:11}]),randomUUID()],/Tổng phân bổ/);
      await fails(assignSql,[lot.id,lot.updated_at,JSON.stringify([{expiry_date:null,quantity:12}]),randomUUID()],/ngày hợp lệ/);
      assert.deepEqual(await state(),before);
      await sell(pack,1);
      await fails(assignSql,[lot.id,lot.updated_at,JSON.stringify([{expiry_date:await date(20),quantity:12}]),randomUUID()],/đã thay đổi/);
    }));

    await t.test("POS keeps one item while consuming FEFO and cancellation restores the original dates", () => scenario(admin,async () => {
      await receive(box,6);
      await assign(await pendingLot(box),[{expiry_date:await date(1),quantity:3},{expiry_date:await date(20),quantity:3}]);
      const beforeLots = await rows("select id,remaining_quantity from public.stock_expiry_lots where variant_id=$1 order by id",[box]);
      const sale = await sell(box,5);
      assert.equal((await rows("select * from public.order_items where order_id=$1",[sale.id])).length,1);
      const allocation = await rows("select expiry_date_snapshot::text as expiry,-quantity_delta as qty from public.stock_expiry_allocations where order_id=$1 and quantity_delta<0 order by id",[sale.id]);
      assert.deepEqual(allocation.map((entry) => entry.qty),[3,2]);
      assert.deepEqual(allocation.map((entry) => entry.expiry),[await date(1),await date(5)]);
      await db.query("select public.cancel_pos_order($1,'Test return')",[sale.id]);
      assert.deepEqual(await rows("select id,remaining_quantity from public.stock_expiry_lots where variant_id=$1 order by id",[box]),beforeLots);
      await db.query("select public.cancel_pos_order($1,'Retry return')",[sale.id]);
      await assertBalanced();
      await db.query("select public.restore_cancelled_orders($1::uuid[])",[[sale.id]]);
      assert.equal(await stock(box),11); await assertBalanced();
    }));

    await t.test("expired quantities cannot be sold but can be issued for disposal", () => scenario(admin,async () => {
      await receive(pack,5);
      await assign(await pendingLot(pack),[{expiry_date:await date(-1),quantity:5}]);
      const before = await state();
      await fails("select * from public.create_pos_order($1,1000000,$2,null,0,$3::jsonb,null,'cash',null,null)",[admin,randomUUID(),JSON.stringify([{variant_id:pack,quantity:1}])],/Không đủ hàng còn hạn/);
      assert.deepEqual(await state(),before);
      await db.query("select public.issue_variant_stock($1,2,'Hàng hết hạn')",[pack]);
      assert.equal(await stock(pack),3); await assertBalanced();
    }));

    await t.test("conversion retains multiple dates and reverse conversion combines same-date receipts only", () => scenario(admin,async () => {
      await receive(box,1);
      await assign(await pendingLot(box),[{expiry_date:await date(20),quantity:1}]);
      const setting = await one("select * from public.save_stock_conversion($1,$2,1,$3,12,null,null)",[product,box,pack]);
      await db.query("select public.execute_stock_conversion($1,false,11,$2,$3,'')",[setting.id,randomUUID(),setting.updated_at]);
      const groups = await rows("select expiry_date::text,sum(remaining_quantity)::integer as qty from public.stock_expiry_lots where variant_id=$1 and remaining_quantity>0 group by expiry_date order by expiry_date",[pack]);
      assert.deepEqual(groups.map((group) => group.qty),[120,12]);
      await db.query("select public.execute_stock_conversion($1,true,12,$2,$3,'')",[setting.id,randomUUID(),setting.updated_at]);
      assert.equal(await stock(box),1); await assertBalanced();
    }));

    await t.test("settings enforce bounds, versioning and separate permission", () => scenario(admin,async () => {
      const settings = await one("select * from public.stock_expiry_settings");
      const updated = await one("select * from public.save_stock_expiry_settings(7,$1)",[settings.updated_at]);
      assert.equal(updated.warning_days,7);
      await fails("select public.save_stock_expiry_settings(30,$1)",[settings.updated_at],/đã thay đổi/);
      await fails("select public.save_stock_expiry_settings(-1,$1)",[updated.updated_at],/0 đến 3650/);
      await actor(manager);
      await fails("select public.save_stock_expiry_settings(10,$1)",[updated.updated_at],/không có quyền/);
    }));

    await t.test("packaging rejects mixed dates but combines the same date across separate receipts", () => scenario(admin,async () => {
      const setting = await one("select * from public.save_stock_conversion($1,$2,1,$3,12,null,null)",[product,box,pack]);
      await receive(pack,6);
      await assign(await pendingLot(pack),[{expiry_date:await date(18),quantity:6}]);
      await receive(pack,6);
      await assign(await pendingLot(pack),[{expiry_date:await date(20),quantity:6}]);
      const before = await state();
      await fails("select public.execute_stock_conversion($1,true,12,$2,$3,'')",[setting.id,randomUUID(),setting.updated_at],/Không gộp các HSD khác nhau/);
      assert.deepEqual(await state(),before);
      await receive(pack,6);
      await assign(await pendingLot(pack),[{expiry_date:await date(18),quantity:6}]);
      await db.query("select public.execute_stock_conversion($1,true,12,$2,$3,'')",[setting.id,randomUUID(),setting.updated_at]);
      const converted = await one("select l.expiry_date::text from public.stock_expiry_lots l join public.stock_expiry_receipts r on r.id=l.receipt_id where r.origin='conversion' and l.variant_id=$1 and l.remaining_quantity>0",[box]);
      assert.equal(converted.expiry_date,await date(18));
      await assertBalanced();
    }));

    await t.test("editing the unsold part cannot change expiry of a later cancelled sale", () => scenario(admin,async () => {
      await receive(pack,12);
      const sale = await sell(pack,4);
      await assign(await pendingLot(pack),[{expiry_date:await date(20),quantity:8}]);
      await db.query("select public.cancel_pos_order($1,'Return after expiry entry')",[sale.id]);
      assert.equal((await pendingLot(pack)).remaining_quantity,4);
      assert.equal((await one("select sum(remaining_quantity)::integer as qty from public.stock_expiry_lots where variant_id=$1 and expiry_date=$2",[pack,await date(20)])).qty,8);
      await assertBalanced();
    }));

    await t.test("opening stock can sell in the same transaction and the legacy receipt API retains its date", () => scenario(admin,async () => {
      const id = randomUUID();
      await db.query("insert into public.product_variants(id,product_id,sku,stock_quantity,cost_price,base_price,is_active) values($1,$2,$3,5,1,10,true)",[id,product,`OPEN-${id}`]);
      await sell(id,2);
      assert.equal(await stock(id),3); await assertBalanced();
      await db.query("update public.product_variants set is_active=false where product_id=$1 and id<>$2",[otherProduct,mismatch]);
      await db.query("select public.receive_product_stock($1,3,current_date,$2)",[otherProduct,await date(15)]);
      assert.equal((await one("select sum(remaining_quantity)::integer as qty from public.stock_expiry_lots where variant_id=$1 and expiry_date=$2",[mismatch,await date(15)])).qty,3);
      await assertBalanced();
    }));

    await t.test("sold-out expiry groups disappear from the list, retain history and reappear on cancellation", () => scenario(admin,async () => {
      await receive(pack,12);
      await assign(await pendingLot(pack),[{expiry_date:await date(10),quantity:5},{expiry_date:await date(20),quantity:7}]);
      const sold = await sell(pack,5);
      let listed = await one("select * from public.list_stock_expiry() where variant_id=$1",[pack]);
      assert.equal(listed.stock_quantity,7);
      assert.deepEqual(listed.lots.map((lot) => [lot.expiry_date,lot.remaining_quantity]),[[await date(20),7]]);
      const consumed = await one("select * from public.stock_expiry_lots where variant_id=$1 and expiry_date=$2",[pack,await date(10)]);
      assert.equal(consumed.initial_quantity,5);
      assert.equal(consumed.remaining_quantity,0);
      await db.query("select public.cancel_pos_order($1,'Restore sold-out expiry')",[sold.id]);
      listed = await one("select * from public.list_stock_expiry() where variant_id=$1",[pack]);
      assert.deepEqual(listed.lots.map((lot) => [lot.expiry_date,lot.remaining_quantity]),[[await date(10),5],[await date(20),7]]);
      await sell(pack,12);
      listed = await one("select * from public.list_stock_expiry() where variant_id=$1",[pack]);
      assert.equal(listed.stock_quantity,0);
      assert.deepEqual(listed.lots,[]);
      assert.equal((await rows("select * from public.stock_expiry_lots where variant_id=$1 and expiry_date is not null",[pack])).length,2);
      await assertBalanced();
    }));

    await t.test("deleting a stocked product is rejected; deleting a sold-out product hides it and preserves HSD history", () => scenario(admin,async () => {
      await receive(pack,2);
      await assign(await pendingLot(pack),[{expiry_date:await date(20),quantity:2}]);
      const beforeRejection = await state();
      await fails("select public.soft_delete_product($1)",[product],/PRODUCT_HAS_STOCK/);
      assert.deepEqual(await state(),beforeRejection);
      await sell(box,10);
      const sold = await sell(pack,2);
      const historyBefore = {
        receipts: await rows("select * from public.stock_expiry_receipts order by id"),
        lots: await rows("select * from public.stock_expiry_lots order by id"),
        allocations: await rows("select * from public.stock_expiry_allocations order by id"),
        orders: await rows("select * from public.orders order by id"),
        items: await rows("select * from public.order_items order by id"),
      };
      await db.query("select public.soft_delete_product($1)",[product]);
      assert.ok((await one("select deleted_at from public.products where id=$1",[product])).deleted_at);
      assert.equal((await rows("select * from public.list_stock_expiry() where variant_id in (select id from public.product_variants where product_id=$1)",[product])).length,0);
      assert.deepEqual({
        receipts: await rows("select * from public.stock_expiry_receipts order by id"),
        lots: await rows("select * from public.stock_expiry_lots order by id"),
        allocations: await rows("select * from public.stock_expiry_allocations order by id"),
        orders: await rows("select * from public.orders order by id"),
        items: await rows("select * from public.order_items order by id"),
      },historyBefore);
      assert.equal((await one("select * from public.list_stock_expiry() where variant_id=$1",[mismatch])).stock_quantity,4);
      const beforeCancellation = await state();
      await fails("select public.cancel_pos_order($1,'Return after product deletion')",[sold.id],/Không thể hủy hóa đơn vì sản phẩm "Sữa thử HSD" đã bị xóa/);
      assert.deepEqual(await state(),beforeCancellation);
      assert.equal(await stock(pack),0);
      assert.equal((await one("select remaining_quantity from public.stock_expiry_lots where variant_id=$1 and expiry_date=$2",[pack,await date(20)])).remaining_quantity,0);
      await assertBalanced();
    }));

    await t.test("a deleted product blocks every line of a mixed order and prevents paid-order deletion from bypassing the guard", () => scenario(admin,async () => {
      const customer = randomUUID();
      await db.query("insert into public.customers(id,name,points) values($1,'Khách thử hoàn hàng',100)",[customer]);
      const mixed = await one("select * from public.create_pos_order($1,1000000,$2,$3,0,$4::jsonb,null,'cash',null,null)",[admin,randomUUID(),customer,JSON.stringify([{variant_id:mismatch,quantity:1},{variant_id:box,quantity:1}])]);
      const valid = await sell(mismatch,1);
      await db.query("select public.issue_variant_stock($1,9,'Clear stock before product deletion')",[box]);
      await db.query("select public.soft_delete_product($1)",[product]);
      const before = await state();
      await fails("select public.cancel_pos_order($1,'Cannot return deleted product')",[mixed.id],/Không thể hủy hóa đơn.*đã bị xóa/);
      assert.deepEqual(await state(),before);
      assert.equal(await stock(box),0);
      assert.equal(await stock(mismatch),2);
      assert.equal((await one("select status from public.orders where id=$1",[mixed.id])).status,'paid');
      await fails("select public.delete_pos_orders($1::uuid[],'Cannot bypass cancellation guard')",[[valid.id,mixed.id]],/Không thể hủy hóa đơn.*đã bị xóa/);
      assert.deepEqual(await state(),before);
      await assertBalanced();
    }));

    await t.test("inactive products can still be cancelled, and retrying an already-cancelled order after deletion returns no extra stock", () => scenario(admin,async () => {
      const sale = await sell(box,10);
      await db.query("update public.products set status='inactive' where id=$1",[product]);
      await db.query("update public.product_variants set is_active=false where id=$1",[box]);
      await db.query("select public.cancel_pos_order($1,'Inactive is not deleted')",[sale.id]);
      assert.equal(await stock(box),10);
      assert.equal((await one("select status from public.orders where id=$1",[sale.id])).status,'cancelled');
      assert.equal((await one("select sum(remaining_quantity)::integer as qty from public.stock_expiry_lots where variant_id=$1 and expiry_date=$2",[box,await date(5)])).qty,10);
      await db.query("update public.product_variants set is_active=true where id=$1",[box]);
      await db.query("select public.issue_variant_stock($1,10,'Clear returned stock')",[box]);
      await db.query("select public.soft_delete_product($1)",[product]);
      const beforeRetry = await state();
      await db.query("select public.cancel_pos_order($1,'Retry after deletion')",[sale.id]);
      assert.deepEqual(await state(),beforeRetry);
      await assertBalanced();
    }));

    await t.test("opening stock without HSD can be prepared repeatedly and assigned partially across dates without receiving stock again", () => scenario(admin,async () => {
      const id = randomUUID();
      await db.query("insert into public.product_variants(id,product_id,sku,stock_quantity,cost_price,base_price,is_active) values($1,$2,$3,15,1,10,true)",[id,product,`NEW-${id}`]);
      const original = await originalState();
      const prepared = (await one("select public.prepare_stock_expiry($1) as value",[id])).value;
      await db.query("select public.prepare_stock_expiry($1)",[id]);
      assert.deepEqual(await originalState(),original);
      assert.equal(prepared.lots.length,1);
      assert.equal(prepared.lots[0].tracks_expiry,false);
      const request = randomUUID(), parts = [{expiry_date:await date(18),quantity:6},{expiry_date:await date(20),quantity:4}];
      await setDates(id,prepared.lots,parts,request);
      const saved = await state();
      await setDates(id,prepared.lots,parts,request);
      assert.deepEqual(await state(),saved);
      await fails(setSql,[id,targets(prepared.lots),JSON.stringify([{expiry_date:await date(18),quantity:7}]),request],/đã dùng/);
      const current = await listed(id);
      assert.equal(current.stock_quantity,15);
      assert.deepEqual(current.lots.map((lot) => [lot.expiry_date,lot.remaining_quantity,lot.tracks_expiry]),[[await date(18),6,true],[await date(20),4,true],[null,5,true]]);
      assert.deepEqual(await originalState(),original);
      await assertBalanced();
    }));

    await t.test("clearing one HSD across receipts stops tracking only that quantity and preserves pending stock and all other dates", () => scenario(admin,async () => {
      await receive(pack,20);
      await setDates(pack,(await listed(pack)).lots,[{expiry_date:await date(10),quantity:5},{expiry_date:await date(20),quantity:5}]);
      await receive(pack,3,false);
      const received = (await listed(pack)).lots.filter((lot) => !lot.expiry_date && !lot.tracks_expiry);
      await setDates(pack,received,[{expiry_date:await date(10),quantity:3}]);
      const firstDate = await date(10), otherDate = await date(20);
      const selection = (await listed(pack)).lots.filter((lot) => lot.expiry_date===firstDate);
      assert.equal(selection.length,2);
      const before = await originalState(), receipts = await rows("select * from public.stock_expiry_receipts order by id");
      const request = randomUUID();
      assert.equal((await clearDates(pack,selection,request)).quantity,8);
      const afterClear = await state();
      await clearDates(pack,selection,request);
      assert.deepEqual(await state(),afterClear);
      assert.deepEqual(await originalState(),before);
      assert.deepEqual(await rows("select * from public.stock_expiry_receipts order by id"),receipts);
      const current = await listed(pack);
      assert.equal(current.stock_quantity,23);
      assert.equal(current.lots.filter((lot) => lot.expiry_date===firstDate).length,0);
      assert.equal(current.lots.filter((lot) => lot.expiry_date===otherDate).reduce((sum,lot) => sum+lot.remaining_quantity,0),5);
      assert.equal(current.lots.filter((lot) => !lot.expiry_date && lot.tracks_expiry).reduce((sum,lot) => sum+lot.remaining_quantity,0),10);
      const untracked = current.lots.filter((lot) => !lot.expiry_date && !lot.tracks_expiry);
      assert.equal(untracked.reduce((sum,lot) => sum+lot.remaining_quantity,0),8);
      await setDates(pack,untracked,[{expiry_date:firstDate,quantity:8}]);
      assert.equal((await listed(pack)).lots.filter((lot) => lot.expiry_date===firstDate).reduce((sum,lot) => sum+lot.remaining_quantity,0),8);
      assert.deepEqual(await originalState(),before);
      await assertBalanced();
    }));

    await t.test("bulk HSD updates reject excessive, duplicated, invalid, foreign and stale inputs without partial changes", () => scenario(admin,async () => {
      await fails("select public.prepare_stock_expiry($1)",[pack],/chưa có tồn kho/);
      await receive(pack,12);
      const source = (await listed(pack)).lots, parts = [{expiry_date:await date(10),quantity:13}];
      const before = await state();
      await fails(setSql,[pack,targets(source),JSON.stringify(parts),randomUUID()],/không được vượt/);
      await fails(setSql,[pack,targets([...source,...source]),JSON.stringify([{expiry_date:await date(10),quantity:1}]),randomUUID()],/không hợp lệ/);
      await fails(setSql,[pack,targets(source),JSON.stringify([{expiry_date:'infinity',quantity:1}]),randomUUID()],/ngày hợp lệ/);
      await fails(setSql,[box,targets(source),JSON.stringify([{expiry_date:await date(10),quantity:1}]),randomUUID()],/đã thay đổi/);
      await fails(clearSql,[pack,targets(source),randomUUID()],/chưa có HSD/);
      assert.deepEqual(await state(),before);
      await setDates(pack,source,[{expiry_date:await date(10),quantity:6}]);
      const known = (await listed(pack)).lots.filter((lot) => lot.expiry_date);
      await sell(pack,1);
      const afterSale = await state();
      await fails(clearSql,[pack,targets(known),randomUUID()],/đã thay đổi/);
      await fails(setSql,[pack,targets(known),JSON.stringify([{expiry_date:await date(20),quantity:6}]),randomUUID()],/đã thay đổi/);
      assert.deepEqual(await state(),afterSale);
      await assertBalanced();
    }));

    await t.test("clearing the unsold part preserves original sold-date allocations for a later cancellation", () => scenario(admin,async () => {
      await receive(pack,10);
      await setDates(pack,(await listed(pack)).lots,[{expiry_date:await date(10),quantity:10}]);
      const sale = await sell(pack,4);
      await clearDates(pack,(await listed(pack)).lots);
      await db.query("select public.cancel_pos_order($1,'Return after clearing HSD')",[sale.id]);
      const current = await listed(pack), originalDate = await date(10);
      assert.equal(current.stock_quantity,10);
      assert.equal(current.lots.filter((lot) => lot.expiry_date===originalDate).reduce((sum,lot) => sum+lot.remaining_quantity,0),4);
      assert.equal(current.lots.filter((lot) => !lot.expiry_date && !lot.tracks_expiry).reduce((sum,lot) => sum+lot.remaining_quantity,0),6);
      await assertBalanced();
    }));

    await t.test("conversion of cleared stock remains untracked and rerunning the management migration preserves cleared history", () => scenario(admin,async () => {
      await clearDates(box,(await listed(box)).lots);
      const setting = await one("select * from public.save_stock_conversion($1,$2,1,$3,12,null,null)",[product,box,pack]);
      await db.query("select public.execute_stock_conversion($1,false,2,$2,$3,'')",[setting.id,randomUUID(),setting.updated_at]);
      const current = await listed(pack);
      assert.equal(current.stock_quantity,24);
      assert.ok(current.lots.every((lot) => !lot.expiry_date && !lot.tracks_expiry));
      const before = await state();
      await db.exec("reset role");
      await db.exec(managementUpgrade.replace(/^begin;\r?$/m,"").replace(/^commit;\r?$/m,""));
      await actor();
      assert.deepEqual(await state(),before);
      await assertBalanced();
    }));

    await t.test("cleared tracking stays off on direct stock adjustments and conversion ignores pending units it did not consume", () => scenario(admin,async () => {
      await clearDates(box,(await listed(box)).lots);
      await db.query("update public.product_variants set stock_quantity=stock_quantity+1 where id=$1",[box]);
      await db.exec("set constraints stock_expiry_balance immediate; set constraints stock_expiry_balance deferred");
      assert.ok((await listed(box)).lots.every((lot) => !lot.expiry_date && !lot.tracks_expiry));
      await receive(box,1,true);
      // The opening receipt predates the new pending receipt. The pending unit
      // is not consumed, so it must not change the target tracking choice.
      const pending = (await listed(box)).lots.find((lot) => lot.tracks_expiry);
      const setting = await one("select * from public.save_stock_conversion($1,$2,1,$3,12,null,null)",[product,box,pack]);
      await db.query("select public.execute_stock_conversion($1,false,1,$2,$3,'')",[setting.id,randomUUID(),setting.updated_at]);
      assert.ok((await listed(pack)).lots.every((lot) => !lot.expiry_date && !lot.tracks_expiry));
      assert.equal((await listed(box)).lots.find((lot) => lot.id===pending.id).remaining_quantity,1);
      await assertBalanced();
    }));

    await t.test("unlogged stock changes reconcile at commit and upgrade remains repeatable with history", async () => {
      await db.exec("begin"); await actor();
      await db.query("update public.product_variants set stock_quantity=stock_quantity+2 where id=$1",[box]);
      await db.exec("commit; reset role");
      await assertBalanced();
      const before = await state();
      await db.exec(upgrade);
      await db.exec(cancellationUpgrade);
      await db.exec(managementUpgrade);
      assert.deepEqual(await state(),before);
    });
  } finally { await db.close(); }
});
