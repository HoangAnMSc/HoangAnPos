import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const sqlFile = async (path) => (await readFile(new URL(`../supabase/${path}`, import.meta.url), "utf8")).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

test("order reversals, live drawer adjustments and multiple attendance shifts", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const admin = randomUUID(), employee = randomUUID(), deleter = randomUUID(), manager = randomUUID();
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const one = async (sql, args = []) => (await rows(sql, args))[0];
  const balance = async () => Number((await one("select expected_opening_cash as amount from public.get_cash_drawer_handover()")).amount);
  async function actor(id) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
    await db.exec("set local role authenticated; set local row_security=on");
  }
  async function scenario(work) {
    await db.exec("begin");
    try { await actor(admin); await work(); }
    finally { await db.exec("rollback; reset role"); }
  }
  async function rejected(sql, args, pattern) {
    await db.exec("savepoint expected_failure");
    try { await assert.rejects(db.query(sql, args), pattern); }
    finally { await db.exec("rollback to savepoint expected_failure; release savepoint expected_failure"); }
  }
  async function product(stock = 20) {
    const id = randomUUID(), variant = randomUUID();
    await db.query("select public.save_product_engine($1::jsonb)", [JSON.stringify({
      id, name: "Return test", slug: id, status: "active", specifications: [], variant_attributes: [], images: [],
      variants: [{ id: variant, sku: id, base_price: 100000, cost_price: 100, stock_quantity: stock,
        shelf_quantity: stock, is_default: true, is_active: true, value_ids: [] }],
    })]);
    return { id, variant, stock };
  }
  async function sale(p, quantity = 2, method = "cash", user = admin) {
    return one("select * from public.create_pos_order($1,1000000,$2,null,0,$3::jsonb,null,$4,null,$5)",
      [user, randomUUID(), JSON.stringify([{ variant_id: p.variant, quantity }]), method, method === "transfer" ? "Test transfer" : null]);
  }
  const stock = async (p) => Number((await one("select stock_quantity from public.product_variants where id=$1", [p.variant])).stock_quantity);
  const cancel = (order) => db.query("select public.cancel_pos_order($1,'Return test')", [order.id]);
  async function open(cash = 0) { return one("select * from public.open_cash_drawer($1,'{}')", [cash]); }
  async function close(session, amount) {
    const result = await one("select * from public.close_cash_drawer($1,$2,'{}')", [session.id, amount]);
    // Each real RPC commits independently. Give successive closes distinct
    // timestamps even though these scenarios roll back a single transaction.
    await db.exec("reset role");
    await db.query("update public.cash_drawer_sessions set closed_at=clock_timestamp() where id=$1", [session.id]);
    await db.exec("set local role authenticated");
    return result;
  }

  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key,email text,phone text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
      grant usage on schema auth to anon,authenticated,service_role;
      grant execute on all functions in schema auth to anon,authenticated,service_role;`);
    const schema = await sqlFile("schema.sql");
    const upgrade = await sqlFile("migrations/202611100001_order_returns_and_open_drawer.sql");
    const attendanceUpgrade = await sqlFile("migrations/202611100002_multiple_attendance_shifts.sql");
    assert.ok(schema.includes(upgrade));
    assert.ok(schema.includes(attendanceUpgrade));
    await db.exec(schema.slice(0, schema.indexOf("-- Correct order reversals and allow admins")));
    for (const id of [admin, employee, deleter, manager]) await db.query("insert into auth.users(id,email) values($1,$2)", [id, `${id}@test.invalid`]);
    await db.exec(`insert into public.app_roles(name,code,permissions) values
      ('Shift employee','test-shift',array['attendance','attendance.clock','attendance.history.view','pos.checkout','orders','cash-management','cash-management.reconciliation.required','cash-management.session.open','cash-management.session.close']),
      ('Order deleter','test-deleter',array['orders','orders.delete']),
      ('Fund manager','test-manager',array['cash-management','cash-management.balance.adjust']);`);
    for (const [id, role] of [[admin, "admin"], [employee, "test-shift"], [deleter, "test-deleter"], [manager, "test-manager"]]) {
      await db.query("update public.profiles set is_active=true,role_id=(select id from public.app_roles where code=$2) where id=$1", [id, role]);
    }
    await db.exec(upgrade);
    await db.exec(attendanceUpgrade);

    await t.test("upgrades can be reapplied without rewriting orders, stock, checks or handover balances", async () => {
      await db.exec("begin");
      await actor(admin);
      const p = await product();
      await open();
      await sale(p);
      await db.exec("commit; reset role");
      const state = async () => ({
        orders: await rows("select * from public.orders order by id"),
        variants: await rows("select * from public.product_variants order by id"),
        sessions: await rows("select * from public.cash_drawer_sessions order by id"),
        allocations: await rows("select * from public.stock_expiry_allocations order by id"),
      });
      const before = await state();
      await db.exec(upgrade); await db.exec(attendanceUpgrade);
      assert.deepEqual(await state(), before);
    });

    await t.test("cash refund uses the paid total, and cancel/delete retries restore each unit only once", () => scenario(async () => {
      const initial = await balance(), p = await product();
      const order = await sale(p, 3);
      assert.equal(await balance(), initial + 300000);
      await cancel(order); await cancel(order);
      assert.equal(await balance(), initial);
      assert.equal(await stock(p), 20);
      await db.query("select public.delete_pos_orders($1::uuid[],'Delete cancelled')", [[order.id, order.id]]);
      assert.equal(await balance(), initial);
      assert.equal(await stock(p), 20);
      assert.equal((await rows("select * from public.stock_movements where reference_id=$1 and movement_type='return'", [order.id])).length, 1);
    }));

    await t.test("paid units and a same-SKU gift return once across cancel/restore/delete cycles", () => scenario(async () => {
      const p = await product(30), before = await balance();
      await db.query(`insert into public.promotions(name,trigger_type,discount_type,discount_value,buy_variant_id)
        values('Return gift','automatic','buy_x_get_y',0,$1)`, [p.variant]);
      const order = await sale(p, 10);
      assert.equal(await stock(p), 19);
      assert.equal((await rows("select * from public.order_items where order_id=$1 and is_promotion_gift", [order.id])).length, 1);
      await cancel(order);
      assert.equal(await stock(p), 30);
      assert.equal(await balance(), before);
      await db.query("select public.restore_cancelled_orders($1::uuid[])", [[order.id]]);
      assert.equal(await stock(p), 19);
      await db.query("select public.delete_pos_orders($1::uuid[],'Delete restored')", [[order.id, order.id]]);
      assert.equal(await stock(p), 30);
      assert.equal(await balance(), before);
      const lots = await one("select sum(remaining_quantity) as amount from public.stock_expiry_lots where variant_id=$1", [p.variant]);
      assert.equal(Number(lots.amount), 30);
    }));

    await t.test("refund and restore of a closed-session invoice change the current drawer once", () => scenario(async () => {
      const p = await product(), original = await sale(p);
      const oldSession = (await rows("select * from public.cash_drawer_sessions where status='open'"))[0];
      await close(oldSession, await balance());
      const opening = await balance(), current = await open(opening);
      await cancel(original);
      assert.equal(await balance(), opening - Number(original.total));
      await db.query("select public.restore_cancelled_orders($1::uuid[])", [[original.id, original.id]]);
      assert.equal(await balance(), opening);
      await cancel(original);
      assert.equal(await balance(), opening - Number(original.total));
      await close(current, await balance());
      assert.equal(await balance(), opening - Number(original.total));
    }));

    await t.test("refund without an open drawer carries into the next handover", () => scenario(async () => {
      const p = await product(), order = await sale(p);
      const session = (await rows("select * from public.cash_drawer_sessions where status='open'"))[0];
      await close(session, await balance());
      const before = await balance();
      await cancel(order);
      assert.equal(await balance(), before - Number(order.total));
      await open(await balance());
      assert.equal(await balance(), before - Number(order.total));
    }));

    await t.test("transfer cancellations change net transfer sales and leave cash untouched after closing", () => scenario(async () => {
      const p = await product(), order = await sale(p, 2, "transfer");
      const before = await balance();
      const session = (await rows("select * from public.cash_drawer_sessions where status='open'"))[0];
      await close(session, before);
      await cancel(order);
      assert.equal(await balance(), before);
      assert.equal(Number((await one("select transfer_sales from public.list_cash_drawer_sessions(500) where id=$1", [session.id])).transfer_sales), 0);
    }));

    await t.test("delete permission alone can reverse a paid invoice but cannot call cancellation or private helpers", () => scenario(async () => {
      const p = await product(), order = await sale(p), before = await balance();
      await actor(deleter);
      await rejected("select public.cancel_pos_order($1,'Disallowed')", [order.id], /Permission denied/);
      await rejected("select public._cancel_pos_order($1,'Disallowed')", [order.id], /permission denied/i);
      await db.query("select public.delete_pos_orders($1::uuid[],'Delete paid')", [[order.id, order.id]]);
      await actor(admin);
      assert.equal(await stock(p), 20);
      assert.equal(await balance(), before - Number(order.total));
    }));

    await t.test("missing SKU and a mixed bulk cancellation fail atomically", () => scenario(async () => {
      const p = await product(), good = await sale(p), broken = await sale(p);
      await db.query("update public.order_items set variant_id=null where order_id=$1", [broken.id]);
      const before = await balance(), quantity = await stock(p);
      await rejected("select public.cancel_pos_orders($1::uuid[],'Atomic bulk')", [[good.id, broken.id]], /thiếu thông tin SKU/);
      assert.equal(await balance(), before);
      assert.equal(await stock(p), quantity);
      assert.equal((await one("select status from public.orders where id=$1", [good.id])).status, "paid");
    }));

    await t.test("admin adjusts an employee's live drawer; later sales and closing use that amount", () => scenario(async () => {
      const p = await product();
      const previous = (await rows("select * from public.cash_drawer_sessions where status='open'"))[0];
      await close(previous, await balance());
      await actor(employee);
      const attendance = await one("select * from public.clock_in_attendance(10,106,5)");
      await db.query("select public.submit_attendance_cash_check($1,$2,'{}')", [attendance.id, await balance()]);
      const session = (await rows("select * from public.cash_drawer_sessions where status='open'"))[0];
      await actor(manager);
      await rejected("select public.adjust_cash_drawer_balance(500000)", [], /Only an admin/);
      await actor(admin);
      await db.query("select public.adjust_cash_drawer_balance(500000)");
      await db.query("select public.adjust_cash_drawer_balance(500000)");
      assert.equal(await balance(), 500000);
      await actor(employee);
      await sale(p, 1, "cash", employee);
      assert.equal(await balance(), 600000);
      await close(session, 600000);
      assert.equal(await balance(), 600000);
    }));

    await t.test("one day supports several completed shifts, one active shift, and separate cash checks", () => scenario(async () => {
      const previous = (await rows("select * from public.cash_drawer_sessions where status='open'"))[0];
      await close(previous, await balance());
      await actor(employee);
      const first = await one("select * from public.clock_in_attendance(10,106,5)");
      assert.equal((await one("select * from public.clock_in_attendance(10,106,5)")).id, first.id);
      await db.query("select public.submit_attendance_cash_check($1,$2,'{}')", [first.id, await balance()]);
      const firstDrawer = (await rows("select * from public.cash_drawer_sessions where status='open'"))[0];
      await close(firstDrawer, await balance());
      await db.query("select public.clock_out_attendance($1)", [first.id]);
      const second = await one("select * from public.clock_in_attendance(10,106,5)");
      assert.notEqual(second.id, first.id);
      assert.deepEqual(second.work_date, first.work_date);
      assert.equal((await rows("select * from public.attendance_records where user_id=$1", [employee])).length, 2);
      await actor(admin);
      assert.equal((await rows("select * from public.cash_drawer_checks where employee_id=$1", [employee])).length, 2);
    }));
  } finally { await db.close(); }
});
