import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const sqlFile = async (name) => (await readFile(new URL(`../supabase/${name}`, import.meta.url), "utf8")).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

test("product saves cannot overwrite inventory changed by orders", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const admin = randomUUID();
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
  const save = async (payload) => db.query("select public.save_product_engine($1::jsonb)", [JSON.stringify(payload)]);
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key,email text,phone text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
      grant usage on schema auth to anon,authenticated,service_role;
      grant execute on all functions in schema auth to anon,authenticated,service_role;`);
    const schema = await sqlFile("schema.sql");
    const upgrade = await sqlFile("migrations/202610230001_product_stock_concurrency.sql");
    const marker = "-- Protect product editor saves from overwriting concurrent stock movements.";
    assert.ok(schema.includes(upgrade), "Fresh installations include the tested stock guard");
    await db.exec(schema.slice(0,schema.indexOf(marker)));
    await db.query("insert into auth.users(id,email) values($1,'stock-admin@test.invalid')", [admin]);
    await db.query("update public.profiles set is_active=true,role_id=(select id from public.app_roles where code='admin') where id=$1", [admin]);

    async function actor() {
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({sub:admin,role:"authenticated"})]);
      await db.exec("set local role authenticated; set local row_security=on");
    }
    async function scenario(work) {
      await db.exec("begin");
      try { await actor(); await work(); }
      finally { await db.exec("rollback; reset role"); }
    }
    async function createProduct(stocks = [10,4,11,11]) {
      const id = randomUUID();
      const payload = {id, name:"Stock concurrency",slug:`stock-${id}`,status:"active",specifications:[],variant_attributes:[],images:[],
        variants:stocks.map((stock,index) => ({id:randomUUID(),sku:`${id}-${index}`,base_price:100,cost_price:10,
          stock_quantity:stock,shelf_quantity:stock,is_default:index===0,is_active:true,value_ids:[]}))};
      await save(payload);
      return payload;
    }
    async function editor(payload) {
      const variants = await rows("select id,stock_quantity from public.product_variants where product_id=$1",[payload.id]);
      return {...payload,variants:payload.variants.map((v) => {
        const stock = variants.find((stored) => stored.id===v.id).stock_quantity;
        return {...v,stock_quantity:stock,shelf_quantity:stock,expected_stock_quantity:stock};
      })};
    }
    const stock = async (payload) => {
      const variants = await rows("select id,stock_quantity from public.product_variants where product_id=$1",[payload.id]);
      return payload.variants.map((v) => variants.find((stored) => stored.id===v.id).stock_quantity);
    };
    const sell = async (payload,quantity=2) => (await rows("select * from public.create_pos_order($1,1000000,$2,null,0,$3::jsonb,null,'cash',null,null)",
      [admin,randomUUID(),JSON.stringify(payload.variants.map((v)=>({variant_id:v.id,quantity})))]))[0];
    const cancel = async (order) => db.query("select public.cancel_pos_order($1,'Test return')",[order.id]);
    const ledger = async (payload) => ({
      lots:await rows("select l.* from public.stock_expiry_lots l join public.product_variants v on v.id=l.variant_id where v.product_id=$1 order by l.id",[payload.id]),
      movements:await rows("select * from public.stock_movements where variant_id=any($1::uuid[]) order by id",[payload.variants.map((v)=>v.id)]),
      allocations:await rows("select * from public.stock_expiry_allocations where variant_id=any($1::uuid[]) order by id",[payload.variants.map((v)=>v.id)]),
    });
    async function fails(payload,pattern) {
      await db.exec("savepoint rejected_save");
      try { await assert.rejects(save(payload),pattern); }
      finally { await db.exec("rollback to savepoint rejected_save; release savepoint rejected_save"); }
    }

    await t.test("the additive upgrade preserves existing orders, returned stock and history on repeated runs", async () => {
      await db.exec("begin");
      await actor();
      const product=await createProduct([5]);
      const order=await sell(product);
      await cancel(order);
      await db.exec("commit; reset role");
      const state=async()=>({
        product:await rows("select * from public.products where id=$1",[product.id]),
        variants:await rows("select * from public.product_variants where product_id=$1",[product.id]),
        order:await rows("select * from public.orders where id=$1",[order.id]),
        ledger:await ledger(product),
      });
      const before=await state();
      await db.exec(upgrade);
      assert.deepEqual(await state(),before);
      await db.exec(upgrade);
      assert.deepEqual(await state(),before);
    });

    await t.test("saving an unchanged stock field after cancellation preserves all eight returned units and their lots", () => scenario(async () => {
      const product = await createProduct();
      for (const variant of product.variants) {
        const lots=await rows("select id,updated_at from public.stock_expiry_lots where variant_id=$1 and remaining_quantity>0",[variant.id]);
        await db.query("select public.set_stock_expiry($1,$2::jsonb,$3::jsonb,$4)",[variant.id,JSON.stringify(lots),
          JSON.stringify([{expiry_date:'2099-12-31',quantity:variant.stock_quantity}]),randomUUID()]);
      }
      const order = await sell(product);
      const stale = await editor(product);
      assert.deepEqual(stale.variants.map((v)=>v.stock_quantity),[8,2,9,9]);
      await cancel(order);
      const returned = await ledger(product);
      await save({...stale,name:"New name after cancellation"});
      await db.exec("set constraints stock_expiry_balance immediate");
      assert.deepEqual(await stock(product),[10,4,11,11]);
      assert.deepEqual(await ledger(product),returned,"A metadata edit must not create stock adjustments or change HSD lots");
      await db.query("select public.restore_cancelled_orders($1::uuid[])",[[order.id]]);
      assert.deepEqual(await stock(product),[8,2,9,9],"Restoring the order deducts only the original sale");
    }));

    await t.test("a stale editor also preserves stock consumed by a later sale", () => scenario(async () => {
      const product = await createProduct([5]);
      const stale = await editor(product);
      await sell(product);
      const sold = await ledger(product);
      await save({...stale,description:"Metadata only"});
      assert.deepEqual(await stock(product),[3]);
      assert.deepEqual(await ledger(product),sold);
    }));

    await t.test("an intentional stock edit with a stale baseline rejects the whole multi-SKU save", () => scenario(async () => {
      const product = await createProduct();
      const order = await sell(product);
      const stale = await editor(product);
      stale.variants.at(-1).stock_quantity=1;
      await cancel(order);
      const before = await ledger(product);
      await fails({...stale,name:"Must roll back"},/STOCK_CHANGED/);
      assert.deepEqual(await stock(product),[10,4,11,11]);
      assert.deepEqual(await ledger(product),before);
      assert.equal((await rows("select name from public.products where id=$1",[product.id]))[0].name,product.name);
    }));

    await t.test("deliberate stock edits use a current baseline and record the correct delta", () => scenario(async () => {
      const product = await createProduct([5]);
      const edited = await editor(product);
      edited.variants[0].stock_quantity=7;
      await save(edited);
      assert.deepEqual(await stock(product),[7]);
      const current = await editor(product);
      current.variants[0].stock_quantity=4;
      await save(current);
      assert.deepEqual(await stock(product),[4]);
      const movements=(await ledger(product)).movements;
      assert.deepEqual(movements.map((m)=>m.quantity).sort((a,b)=>a-b),[-3,2,5]);
      const unchanged=await ledger(product);
      await save(current);
      assert.deepEqual(await ledger(product),unchanged,"Retrying an already-applied quantity must not add another adjustment");
    }));

    await t.test("older clients or drafts without a baseline cannot change existing stock", () => scenario(async () => {
      const product = await createProduct([5]);
      await save({...product,name:"Compatible metadata edit"});
      const order=await sell(product);
      const stale=await editor(product);
      delete stale.variants[0].expected_stock_quantity;
      await cancel(order);
      const before=await ledger(product);
      await fails(stale,/STOCK_CHANGED/);
      assert.deepEqual(await stock(product),[5]);
      assert.deepEqual(await ledger(product),before);
    }));

    await t.test("a current baseline cannot bypass stock permissions", () => scenario(async () => {
      const product=await createProduct([5]);
      const edited=await editor(product);
      await db.exec("reset role");
      const restricted=randomUUID();
      await db.query("insert into public.app_roles(name,code,permissions) values('Metadata editor',$1,array['products','products.create','products.update'])",[restricted]);
      await db.query("insert into auth.users(id,email) values($1,'metadata@test.invalid')",[restricted]);
      await db.query("update public.profiles set is_active=true,role_id=(select id from public.app_roles where code=$2) where id=$1",[restricted,restricted]);
      await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:restricted,role:'authenticated'})]);
      await db.exec("set local role authenticated");
      edited.variants[0].stock_quantity=7;
      await fails(edited,/STOCK_PERMISSION_DENIED/);
      edited.variants[0].stock_quantity=3;
      await fails(edited,/STOCK_PERMISSION_DENIED/);
      assert.deepEqual(await stock(product),[5]);
      await save({...edited,variants:[{...edited.variants[0],stock_quantity:5}],name:'Metadata remains editable'});
      assert.deepEqual(await stock(product),[5]);
    }));
  } finally { await db.close(); }
});
