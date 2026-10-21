import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const migrationMarker = "-- Separate inventory audit history viewing from warehouse access.";
const readSql = async (name) => (await readFile(new URL(`../supabase/${name}`, import.meta.url), "utf8")).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

test("roles can grant inventory history viewing without count, submit or deletion rights", async () => {
  const bundle = await build({ entryPoints: ["src/lib/permissions.ts"], bundle: true, write: false, format: "esm", platform: "node" });
  const { normalizeRolePermissions, permissionLabelByKey, superAdminPermissionKeys } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  assert.equal(permissionLabelByKey.get("warehouse.audit.view"), "Xem lịch sử kiểm kê");
  const viewing = normalizeRolePermissions(["warehouse.audit.view"]);
  assert.deepEqual(viewing, ["warehouse", "warehouse.audit.view"]);
  assert.deepEqual(normalizeRolePermissions(viewing), viewing);
  assert.ok(superAdminPermissionKeys.includes("warehouse.audit.view"));
  for (const permissions of [["warehouse"], ["inventory", "inventory.count", "inventory.submit"], ["warehouse.audit.delete"]]) {
    assert.ok(!normalizeRolePermissions(permissions).includes("warehouse.audit.view"));
  }
});

test("PostgreSQL independently enforces inventory history viewing and preserves existing audits", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const ids = Object.fromEntries(["admin", "warehouse", "counter", "deleter", "viewer", "manager", "inactive", "inactiveRole"].map((key) => [key, randomUUID()]));
  const product = randomUUID(), variant = randomUUID();
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
  const one = async (sql, params = []) => (await rows(sql, params))[0];
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key,email text,phone text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
      grant usage on schema auth to anon,authenticated,service_role;
      grant execute on all functions in schema auth to anon,authenticated,service_role;`);
    const schema = await readSql("schema.sql"), upgrade = await readSql("migrations/202610210001_inventory_audit_view_permission.sql");
    assert.ok(schema.includes(upgrade.trim()), "Fresh installs include the tested history permission upgrade");
    await db.exec(schema.slice(0, schema.lastIndexOf(migrationMarker)));
    for (const [code, id] of Object.entries(ids)) await db.query("insert into auth.users(id,email) values($1,$2)", [id, `${code}@test.invalid`]);
    for (const [code, permissions, active] of [
      ["warehouse", ["warehouse"], true],
      ["counter", ["inventory", "inventory.count", "inventory.submit"], true],
      ["deleter", ["warehouse.audit.delete"], true],
      ["viewer", ["warehouse.audit.view"], true],
      ["manager", ["warehouse.audit.view", "warehouse.audit.delete"], true],
      ["inactive", ["warehouse.audit.view"], true],
      ["inactiveRole", ["warehouse.audit.view"], false],
    ]) await db.query("insert into public.app_roles(name,code,permissions,is_active) values($1,$1,$2,$3)", [code, permissions, active]);
    for (const [code, id] of Object.entries(ids)) await db.query("update public.profiles set is_active=$3,role_id=(select id from public.app_roles where code=$2) where id=$1", [id, code, code !== "inactive"]);
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
    async function fails(sql, params, pattern) {
      await db.exec("savepoint rejected_audit");
      try { await assert.rejects(db.query(sql, params), pattern); }
      finally { await db.exec("rollback to savepoint rejected_audit; release savepoint rejected_audit"); }
    }
    const payload = JSON.stringify([{ variant_id: variant, product_name: "Original product", counted: 5 }]);
    await db.exec("begin"); await actor(ids.admin);
    await db.query("insert into public.products(id,name,slug,status) values($1,'Original product','audit-permission-product','active')", [product]);
    await db.query("insert into public.product_variants(id,product_id,sku,is_active) values($1,$2,'AUDIT-PERMISSION-SKU',true)", [variant, product]);
    const auditId = (await one("select public.submit_inventory_audit('Original auditor',$1::jsonb) as id", [payload])).id;
    await db.exec("commit; reset role");
    const state = async () => ({
      audits: await rows("select * from public.inventory_audits order by id"),
      lines: await rows("select * from public.inventory_audit_lines order by id"),
      products: await rows("select * from public.products order by id"),
      variants: await rows("select * from public.product_variants order by id"),
      roles: await rows("select * from public.app_roles order by id"),
    });
    await scenario(ids.warehouse, async () => assert.equal((await rows("select * from public.inventory_audits")).length, 1));
    const before = await state();
    await db.exec(upgrade); await db.exec(upgrade);
    assert.deepEqual(await state(), before, "The repeatable upgrade changes policies without modifying data or assigned rights");

    for (const code of ["warehouse", "counter", "deleter", "inactive", "inactiveRole"]) {
      await t.test(`${code} cannot read sessions or line snapshots without active view permission`, () => scenario(ids[code], async () => {
        assert.deepEqual(await rows("select * from public.inventory_audits"), []);
        assert.deepEqual(await rows("select * from public.inventory_audit_lines"), []);
      }));
    }
    for (const code of ["viewer", "admin"]) {
      await t.test(`${code} can read complete audit snapshots`, () => scenario(ids[code], async () => {
        assert.equal((await rows("select * from public.inventory_audits"))[0].id, auditId);
        const line = (await rows("select * from public.inventory_audit_lines"))[0];
        assert.equal(line.counted, 5); assert.equal(line.system_stock, 0); assert.equal(line.variant_id, variant);
      }));
    }
    await t.test("view permission does not allow deleting, editing, inserting or submitting audits", () => scenario(ids.viewer, async () => {
      assert.equal((await db.query("delete from public.inventory_audits where id=$1", [auditId])).affectedRows, 0);
      assert.equal((await db.query("update public.inventory_audit_lines set counted=9 where audit_id=$1", [auditId])).affectedRows, 0);
      await fails("insert into public.inventory_audits(created_by,staff_name) values($1,'Denied')", [ids.viewer], /row-level security/i);
      await fails("select public.submit_inventory_audit('Denied',$1::jsonb)", [payload], /Permission denied/i);
    }));
    await t.test("counting can still submit without reading history", () => scenario(ids.counter, async () => {
      const result = await one("select public.submit_inventory_audit('Counter',$1::jsonb) as id", [payload]);
      assert.ok(result.id);
      assert.deepEqual(await rows("select * from public.inventory_audits"), []);
      assert.deepEqual(await rows("select * from public.inventory_audit_lines"), []);
      await db.exec("reset role");
      assert.equal((await rows("select * from public.inventory_audits where id=$1", [result.id])).length, 1);
    }));
    await t.test("view and delete together retain deletion and child cleanup", () => scenario(ids.manager, async () => {
      assert.equal((await db.query("delete from public.inventory_audits where id=$1", [auditId])).affectedRows, 1);
      assert.deepEqual(await rows("select * from public.inventory_audit_lines where audit_id=$1", [auditId]), []);
      await db.exec("reset role");
      assert.deepEqual(await rows("select * from public.inventory_audit_lines where audit_id=$1", [auditId]), []);
    }));
    await t.test("delete permission alone cannot bypass the restrictive select policy", () => scenario(ids.deleter, async () => {
      assert.equal((await db.query("delete from public.inventory_audits where id=$1", [auditId])).affectedRows, 0);
    }));
    await t.test("unauthenticated requests cannot read audit data", () => scenario(null, async () => {
      assert.deepEqual(await rows("select * from public.inventory_audits"), []);
      assert.deepEqual(await rows("select * from public.inventory_audit_lines"), []);
      await db.exec("set local role anon");
      await fails("select * from public.inventory_audits", [], /permission denied/i);
    }));
    assert.deepEqual(await state(), before);
  } finally { await db.close(); }
});
