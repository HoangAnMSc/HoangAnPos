import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// Read SQL without normalizing line endings: Supabase SQL Editor can receive
// CRLF from Windows, including inside dollar-quoted PL/pgSQL bodies.
const rawSql = async (path) => (await readFile(new URL(`../supabase/${path}`, import.meta.url), "utf8")).replace(/^\uFEFF/, "");
const lineEndings = (sql, newline) => sql.replace(/\r?\n/g, newline);

test("attendance migration accepts existing function formatting and SQL Editor line endings", async (t) => {
  const schema = await rawSql("schema.sql");
  const migration = await rawSql("migrations/202611100002_multiple_attendance_shifts.sql");
  const marker = "-- Correct order reversals and allow admins";
  assert.ok(schema.includes(marker));
  const baseline = schema.slice(0, schema.indexOf(marker));
  const cases = [
    { name: "LF function body and CRLF migration reproduce the reported Windows failure", functionNewline: "\n", migrationNewline: "\r\n" },
    { name: "CRLF function body and LF migration preserve history", functionNewline: "\r\n", migrationNewline: "\n" },
    { name: "a previously reformatted clock-in function needs no source-text match", functionNewline: "\r\n", migrationNewline: "\r\n", reindent: true },
  ];
  for (const scenario of cases) await t.test(scenario.name, async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    const employee = randomUUID(), historyId = randomUUID(), openId = randomUUID(), closedSessionId = randomUUID(), deniedEmployee = randomUUID();
    const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
    const one = async (sql, params = []) => (await rows(sql, params))[0];
    async function actor(id) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id, role: "authenticated" })]);
      await db.exec("set role authenticated; set row_security=on");
    }
    try {
      await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth;
        create table auth.users(id uuid primary key,email text,phone text,raw_user_meta_data jsonb default '{}');
        create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
        create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
        grant usage on schema auth to anon,authenticated,service_role;
        grant execute on all functions in schema auth to anon,authenticated,service_role;`);
      await db.exec(baseline);
      const original = await one("select pg_get_functiondef('public.clock_in_attendance(numeric,numeric,numeric)'::regprocedure) as definition");
      let definition = lineEndings(original.definition, "\n");
      if (scenario.reindent) definition = definition.replace(/^ +/gm, "\t").replace(
        "Attendance for today is already completed",
        "Attendance for today is already completed (legacy deployment)",
      );
      await db.exec(lineEndings(definition, scenario.functionNewline));
      await db.query("insert into auth.users(id,email) values($1,'shift@test.invalid'),($2,'denied@test.invalid')", [employee, deniedEmployee]);
      await db.query("update public.profiles set is_active=true,role_id=(select id from public.app_roles where code='staff') where id=$1", [employee]);
      await db.exec("insert into public.app_roles(name,code,permissions) values('No attendance','no-attendance','{}')");
      await db.query("update public.profiles set is_active=true,role_id=(select id from public.app_roles where code='no-attendance') where id=$1", [deniedEmployee]);
      await db.query(`insert into public.attendance_records(id,user_id,clock_in_at,clock_out_at,work_date,clock_in_latitude,clock_in_longitude)
        values($1,$3,now()-interval '2 hours',now()-interval '1 hour',(now() at time zone 'Asia/Ho_Chi_Minh')::date,10,106),
              ($2,$3,now()-interval '1 day',null,((now() at time zone 'Asia/Ho_Chi_Minh')::date)-1,10,106)`, [historyId, openId, employee]);
      await db.query(`insert into public.cash_drawer_sessions(id,cashier_id,cashier_name,status,opened_at,closed_at,counted_cash,expected_cash,variance)
        values($1,$2,'Nhân viên','closed',now()-interval '2 days',now()-interval '1 day',200000,200000,0)`, [closedSessionId, employee]);
      await db.query(`insert into public.cash_drawer_checks(attendance_record_id,employee_id,employee_name,cash_session_id,expected_cash,actual_cash,is_match,checked_at)
        values($1,$2,'Nhân viên',$3,200000,200000,true,now())`, [openId, employee, closedSessionId]);
      const snapshot = async () => ({
        records: await rows("select * from public.attendance_records order by id"),
        checks: await rows("select * from public.cash_drawer_checks order by id"),
        sessions: await rows("select * from public.cash_drawer_sessions order by id"),
      });
      const before = await snapshot();
      const sql = lineEndings(migration, scenario.migrationNewline);
      await db.exec(sql);
      assert.deepEqual(await snapshot(), before, "The first upgrade cannot rewrite attendance, evidence, or cash balances");
      await db.exec(sql);
      assert.deepEqual(await snapshot(), before, "Rerunning the replacement is safe");
      assert.equal((await rows("select 1 from pg_indexes where schemaname='public' and indexname='attendance_records_user_work_date_unique_idx'")).length, 0);
      assert.equal((await rows("select 1 from pg_indexes where schemaname='public' and indexname='attendance_records_one_open_shift_idx'")).length, 1);

      await actor(deniedEmployee);
      await assert.rejects(db.query("select public.clock_in_attendance(10,106,5)"), /Permission denied/);
      await actor(employee);
      await assert.rejects(db.query("select public.clock_in_attendance(null,106,5)"), /Location is required/);
      assert.equal((await one("select * from public.clock_in_attendance(10,106,5)")).id, openId, "Retry uses the existing active shift");
      await db.query("select public.clock_out_attendance($1)", [openId]);
      const newShift = await one("select * from public.clock_in_attendance(10,106,5)");
      assert.notEqual(newShift.id, historyId);
      assert.notEqual(newShift.id, openId);
      assert.equal((await one("select * from public.clock_in_attendance(10,106,5)")).id, newShift.id);
      assert.equal((await rows("select * from public.attendance_records where user_id=$1 and work_date=(now() at time zone 'Asia/Ho_Chi_Minh')::date", [employee])).length, 2);
      const check = await one("select * from public.get_attendance_cash_check($1)", [newShift.id]);
      assert.equal(Number(check.expected_cash), 200000);
      assert.equal(check.checked_at, null);
      await db.exec("reset role");
      const historical = await one("select * from public.cash_drawer_checks where attendance_record_id=$1", [openId]);
      assert.deepEqual(historical, before.checks[0], "The old cash confirmation stays unchanged");
      await assert.rejects(db.query(`insert into public.attendance_records(user_id,clock_in_at,work_date)
        values($1,now()+interval '1 hour',(now() at time zone 'Asia/Ho_Chi_Minh')::date)`, [employee]), /duplicate key/);
    } finally { await db.close(); }
  });
});
