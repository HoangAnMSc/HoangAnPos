import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const marker = "-- Granular HSD actions and a single permission for creating inventory audits.";
const readSql = async (name) => (await readFile(new URL(`../supabase/${name}`, import.meta.url), "utf8")).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

test("role settings expose five HSD rights and one complete inventory creation right", async () => {
  const bundle = await build({ entryPoints: ["src/lib/permissions.ts"], bundle: true, write: false, format: "esm", platform: "node" });
  const { normalizeRolePermissions: normalize, permissionGroups, allRolePermissionKeys, superAdminPermissionKeys } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  const actions = permissionGroups.find((group) => group.key === "warehouse").actions;
  assert.deepEqual(actions.filter((action) => action.key.startsWith("warehouse.expiry.")).map((action) => action.key),["warehouse.expiry.view","warehouse.expiry.create","warehouse.expiry.update","warehouse.expiry.delete","warehouse.expiry.settings"]);
  assert.deepEqual(actions.filter((action) => action.key.startsWith("inventory")).map((action) => action.key),["inventory"]);
  for (const old of ["inventory.count","inventory.submit","warehouse.expiry.manage"]) assert.ok(!allRolePermissionKeys.includes(old));
  assert.deepEqual(normalize(["inventory.count","inventory.submit"]),["warehouse","inventory"]);
  assert.ok(!normalize(["warehouse"]).includes("warehouse.expiry.view"),"New warehouse roles do not implicitly gain HSD viewing");
  for (const action of ["create","update","delete","settings"]) {
    const permissions = normalize([`warehouse.expiry.${action}`]);
    assert.deepEqual(permissions,["warehouse","warehouse.expiry.view",`warehouse.expiry.${action}`]);
    assert.deepEqual(normalize(permissions),permissions);
    assert.ok(superAdminPermissionKeys.includes(`warehouse.expiry.${action}`));
  }
  const legacy = normalize(["warehouse.expiry.manage"]);
  assert.deepEqual(legacy,["warehouse","warehouse.expiry.view","warehouse.expiry.create","warehouse.expiry.update","warehouse.expiry.delete"]);
});

test("warehouse permission upgrade preserves data and enforces each HSD operation and merged inventory creation", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const ids = Object.fromEntries(["admin","legacy-view","legacy-manage","legacy-inventory","legacy-settings","view","create","update","delete","settings","inventory","warehouse","old-submit","inactive","no-view"].map((code) => [code,randomUUID()]));
  const product = randomUUID(), variant = randomUUID();
  const rows = async (sql,params=[]) => (await db.query(sql,params)).rows;
  const one = async (sql,params=[]) => (await rows(sql,params))[0];
  const targets = (lots) => JSON.stringify(lots.map(({id,updated_at}) => ({id,updated_at})));
  const setSql="select public.set_stock_expiry($1,$2::jsonb,$3::jsonb,$4) as quantity";
  const assignSql="select public.assign_stock_expiry($1,$2,$3::jsonb,$4) as id";
  const clearSql="select public.clear_stock_expiry($1,$2::jsonb,$3) as quantity";
  const parts=JSON.stringify([{expiry_date:"2028-12-31",quantity:1}]);
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text,phone text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'' )::jsonb,'{}'::jsonb) $$;
      grant usage on schema auth to anon,authenticated,service_role;
      grant execute on all functions in schema auth to anon,authenticated,service_role;`);
    const schema=await readSql("schema.sql"), upgrade=await readSql("migrations/202610210002_warehouse_action_permissions.sql");
    assert.equal(schema.slice(schema.lastIndexOf(marker)).trim(),upgrade.trim());
    await db.exec(schema.slice(0,schema.lastIndexOf(marker)));
    for(const [code,id] of Object.entries(ids))await db.query("insert into auth.users(id,email) values($1,$2)",[id,`${code}@test.invalid`]);
    const role = async (code,permissions) => db.query("insert into public.app_roles(code,name,permissions) values($1,$1,$2)",[code,permissions]);
    await role("legacy-view",["warehouse"]);
    await role("legacy-manage",["warehouse","warehouse.expiry.manage","orders"]);
    await role("legacy-inventory",["inventory","inventory.count","inventory.submit","pos"]);
    await role("legacy-settings",["warehouse.expiry.settings"]);
    for(const [code,id] of Object.entries(ids))if(code==="admin"||code.startsWith("legacy-"))await db.query("update public.profiles set is_active=true,role_id=(select id from public.app_roles where code=$2) where id=$1",[id,code]);
    async function actor(id){await db.exec("reset role;set local row_security=on");await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id,role:"authenticated"})]);await db.exec("set local role authenticated")}
    async function scenario(code,work){await db.exec("begin");try{await actor(ids[code]??null);await work()}finally{await db.exec("rollback;reset role")}}
    async function fails(sql,params,pattern=/không có quyền|Permission denied|permission denied/i){await db.exec("savepoint denied_action");try{await assert.rejects(db.query(sql,params),pattern)}finally{await db.exec("rollback to savepoint denied_action;release savepoint denied_action")}}
    const state=async()=>({
      products:await rows("select * from public.products order by id"),variants:await rows("select * from public.product_variants order by id"),
      lots:await rows("select * from public.stock_expiry_lots order by id"),receipts:await rows("select * from public.stock_expiry_receipts order by id"),
      audits:await rows("select * from public.inventory_audits order by id"),lines:await rows("select * from public.inventory_audit_lines order by id"),
      settings:await rows("select * from public.stock_expiry_settings"),requests:await rows("select * from public.stock_expiry_requests order by id")
    });
    await db.exec("begin");await actor(ids.admin);
    await db.query("insert into public.products(id,name,slug,status) values($1,'Expiry permission test','expiry-permission-test','active')",[product]);
    await db.query("insert into public.product_variants(id,product_id,sku,stock_quantity,is_active) values($1,$2,'PERMISSIONS-SKU',2,true)",[variant,product]);
    const entry=await one("select public.prepare_stock_expiry($1) as value",[variant]);
    await db.query(setSql,[variant,targets(entry.value.lots),JSON.stringify([{expiry_date:"2028-01-01",quantity:1}]),randomUUID()]);
    await db.query("select public.submit_inventory_audit('Before migration',$1::jsonb)",[JSON.stringify([{variant_id:variant,product_name:"Expiry permission test",counted:2}])]);
    await db.exec("commit;reset role");
    const before=await state();
    await db.exec(upgrade);
    assert.deepEqual(await state(),before);
    const permissions=async(code)=>(await one("select permissions from public.app_roles where code=$1",[code])).permissions;
    assert.deepEqual(await permissions("legacy-view"),["warehouse","warehouse.expiry.view"]);
    assert.deepEqual(await permissions("legacy-manage"),["warehouse","orders","warehouse.expiry.view","warehouse.expiry.create","warehouse.expiry.update","warehouse.expiry.delete"]);
    assert.deepEqual(await permissions("legacy-inventory"),["inventory","pos","warehouse"]);
    assert.deepEqual(await permissions("legacy-settings"),["warehouse.expiry.settings","warehouse","warehouse.expiry.view"]);
    await db.query("update public.app_roles set permissions=array['warehouse'] where code='legacy-view'");
    const rolesBefore=await rows("select * from public.app_roles order by id");await db.exec(upgrade);
    assert.deepEqual(await rows("select * from public.app_roles order by id"),rolesBefore,"Retry cannot restore revoked HSD viewing or duplicate rights");
    assert.deepEqual(await state(),before);
    for(const code of ["view","create","update","delete","settings","inventory","warehouse","old-submit","inactive","no-view"]){
      const permissions=code==="warehouse"?["warehouse"]:code==="inventory"?["warehouse","inventory"]:code==="old-submit"?["warehouse","inventory.submit"]:code==="no-view"?["warehouse","warehouse.expiry.create","warehouse.expiry.update","warehouse.expiry.delete","warehouse.expiry.settings"]:["warehouse","warehouse.expiry.view",...(code==="view"||code==="inactive"?[]:[`warehouse.expiry.${code}`])];
      await role(code,permissions);await db.query("update public.profiles set is_active=$3,role_id=(select id from public.app_roles where code=$2) where id=$1",[ids[code],code,code!=="inactive"]);
    }
    const allLots=(await rows("select id,updated_at,expiry_date from public.stock_expiry_lots where variant_id=$1 and remaining_quantity>0 order by id",[variant]));
    const undated=allLots.filter(l=>!l.expiry_date),dated=allLots.filter(l=>l.expiry_date);
    for(const code of ["warehouse","old-submit","inactive","no-view"]){await t.test(`${code} has no HSD read or action access`,()=>scenario(code,async()=>{
      await fails("select * from public.list_stock_expiry()",[]);
      for(const table of ["stock_expiry_settings","stock_expiry_receipts","stock_expiry_lots","stock_expiry_allocations"])assert.deepEqual(await rows(`select * from public.${table}`),[]);
      await fails(setSql,[variant,targets(undated),parts,randomUUID()]);
      await fails(clearSql,[variant,targets(dated),randomUUID()]);
      await fails("select public.save_stock_expiry_settings(20,now())",[]);
    }))}
    await t.test("viewer sees dates but cannot prepare, add, edit, delete or configure",()=>scenario("view",async()=>{
      assert.equal((await rows("select * from public.list_stock_expiry() where variant_id=$1",[variant])).length,1);
      await fails("select public.prepare_stock_expiry($1)",[variant]);
      await fails(setSql,[variant,targets(undated),parts,randomUUID()]);await fails(setSql,[variant,targets(dated),parts,randomUUID()]);
      await fails(clearSql,[variant,targets(dated),randomUUID()]);await fails("select public.save_stock_expiry_settings(20,now())",[]);
      await fails("select public._stock_expiry_require_write($1::jsonb)",[targets(undated)]);
      await fails("update public.stock_expiry_lots set expiry_date='2029-01-01'",[]);
    }));
    await t.test("create can date undated stock but not edit dated sources through either RPC",()=>scenario("create",async()=>{
      await db.query("select public.prepare_stock_expiry($1)",[variant]);
      await fails(setSql,[variant,targets(dated),parts,randomUUID()],/sửa HSD/);
      await fails(setSql,[variant,targets(allLots),parts,randomUUID()],/sửa HSD/);
      await fails(assignSql,[dated[0].id,dated[0].updated_at,parts,randomUUID()],/sửa HSD/);
      await fails(clearSql,[variant,targets(dated),randomUUID()]);
      const request=randomUUID();await db.query(setSql,[variant,targets(undated),parts,request]);await db.query(setSql,[variant,targets(undated),parts,request]);
    }));
    await t.test("update can change dated stock but cannot date undated or mixed sources",()=>scenario("update",async()=>{
      await db.query("select public.prepare_stock_expiry($1)",[variant]);
      await fails(setSql,[variant,targets(undated),parts,randomUUID()],/thêm HSD/);
      await fails(setSql,[variant,targets(allLots),parts,randomUUID()],/thêm HSD/);
      await fails(assignSql,[undated[0].id,undated[0].updated_at,parts,randomUUID()],/thêm HSD/);
      await fails(clearSql,[variant,targets(dated),randomUUID()]);
      const request=randomUUID();await db.query(setSql,[variant,targets(dated),parts,request]);await db.query(setSql,[variant,targets(dated),parts,request]);
      await db.exec("reset role");await db.query("update public.app_roles set permissions=array['warehouse','warehouse.expiry.view','warehouse.expiry.create'] where code='update'");await actor(ids.update);
      await fails(setSql,[variant,targets(dated),parts,request],/sửa HSD/);
    }));
    for(const [code,lots] of [["create",undated],["update",dated]])await t.test(`${code} legacy assignment applies the same date-based permission`,()=>scenario(code,async()=>{await db.query(assignSql,[lots[0].id,lots[0].updated_at,parts,randomUUID()])}));
    await t.test("delete only clears dated units and cannot add, edit or configure",()=>scenario("delete",async()=>{
      await fails(setSql,[variant,targets(undated),parts,randomUUID()]);await fails(setSql,[variant,targets(dated),parts,randomUUID()]);
      await fails("select public.prepare_stock_expiry($1)",[variant]);await fails("select public.save_stock_expiry_settings(20,now())",[]);
      const request=randomUUID();await db.query(clearSql,[variant,targets(dated),request]);await db.query(clearSql,[variant,targets(dated),request]);
      const result=(await one("select * from public.list_stock_expiry() where variant_id=$1",[variant]));assert.equal(result.stock_quantity,2);assert.ok(result.lots.every(l=>!l.expiry_date));
    }));
    await t.test("settings right changes the warning threshold without granting stock-date writes",()=>scenario("settings",async()=>{
      const current=await one("select * from public.stock_expiry_settings");await db.query("select public.save_stock_expiry_settings(20,$1)",[current.updated_at]);
      await fails(setSql,[variant,targets(undated),parts,randomUUID()]);await fails(clearSql,[variant,targets(dated),randomUUID()]);
    }));
    for(const code of ["inventory","legacy-inventory"])await t.test(`${code} can submit with the single inventory right and does not gain history viewing`,()=>scenario(code,async()=>{
      const result=await one("select public.submit_inventory_audit('Single right',$1::jsonb) as id",[JSON.stringify([{variant_id:variant,product_name:"Expiry permission test",counted:0}])]);assert.ok(result.id);
      assert.deepEqual(await rows("select * from public.inventory_audits"),[]);
    }));
    for(const code of ["warehouse","old-submit","view"])await t.test(`${code} cannot submit without the merged inventory right`,()=>scenario(code,async()=>{await fails("select public.submit_inventory_audit('Denied','[]'::jsonb)",[])}));
    assert.deepEqual(await state(),before);
  }finally{await db.close()}
});
