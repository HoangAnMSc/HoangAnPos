import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

async function loadSource(entry, backend) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "node",
    plugins: backend ? [{ name: "payroll-backend", setup(builder) {
      builder.onLoad({ filter: /[\\/]lib[\\/]supabase\.ts$/ }, () => ({
        contents: "export const supabase = globalThis.payrollTestBackend; export function requireSupabaseConfig() {}", loader: "js",
      }));
    } }] : [],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

const { createPayrollSlip, downloadPayrollPng } = await loadSource("src/lib/payrollExport.ts");
const attendance = (day, user = "employee-1", extra = {}) => ({
  id: `${user}-${day}`, user_id: user, work_date: day,
  clock_in_at: `${day}T02:00:00Z`, clock_out_at: `${day}T05:00:00Z`, ...extra,
});
const input = (extra = {}) => ({ employeeId: "employee-1", employeeName: "Mỹ Tiên", monthKey: "2026-10", dailyRate: 200000,
  deductions: [], records: [], ...extra });

test("monthly payroll matches the reference with 16 unique days, named deductions and correct net pay", () => {
  const records = Array.from({ length: 16 }, (_, day) => attendance(`2026-10-${day + 16}`));
  records.push(attendance("2026-10-16", "employee-1", { id: "second-shift", clock_in_at: "2026-10-16T07:00:00Z" }));
  records.push(attendance("2026-10-31", "employee-1", { id: "overnight", clock_out_at: "2026-11-01T01:00:00Z" }));
  records.push(attendance("2026-10-15", "someone-else"), attendance("2026-11-01"), attendance("2026-09-30"));
  const before = JSON.stringify(records);
  const slip = createPayrollSlip(input({ records, deductions: [{ name: "Tạm ứng lần 1", amount: 600000 }, { name: "Tạm ứng lần 2", amount: 200000 }] }));
  assert.equal(slip.workDays, 16);
  assert.equal(slip.periodStart, "2026-10-01");
  assert.equal(slip.periodEnd, "2026-10-31");
  assert.equal(slip.grossPay, 3200000);
  assert.equal(slip.totalDeductions, 800000);
  assert.equal(slip.netPay, 2400000);
  assert.deepEqual(slip.deductions.map((item) => item.name), ["Tạm ứng lần 1", "Tạm ứng lần 2"]);
  assert.equal(JSON.stringify(records), before);
});

test("an open shift and completed shifts on the same business date count as one day", () => {
  const slip = createPayrollSlip(input({ records: [attendance("2026-10-01"), attendance("2026-10-01", "employee-1", { id: "open", clock_out_at: null })] }));
  assert.equal(slip.workDays, 1);
  assert.equal(slip.netPay, 200000);
});

test("payroll periods handle leap days and December without including adjacent months", () => {
  const leap = createPayrollSlip(input({ monthKey: "2028-02", records: [attendance("2028-02-29"), attendance("2028-03-01")] }));
  assert.equal(leap.periodEnd, "2028-02-29");
  assert.equal(leap.workDays, 1);
  assert.equal(createPayrollSlip(input({ monthKey: "2027-02" })).periodEnd, "2027-02-28");
  assert.equal(createPayrollSlip(input({ monthKey: "2026-12" })).periodEnd, "2026-12-31");
});

test("edited daily rate, zero amounts and deductions exceeding wages are not silently changed", () => {
  const slip = createPayrollSlip(input({ dailyRate: 250000, records: [attendance("2026-10-01")], deductions: [{ name: "Ứng lương", amount: 300000 }] }));
  assert.equal(slip.grossPay, 250000);
  assert.equal(slip.netPay, -50000);
  const zero = createPayrollSlip(input({ dailyRate: 0, deductions: [{ name: "Không trừ", amount: 0 }] }));
  assert.equal(zero.netPay, 0);
  assert.deepEqual(zero.deductions, [{ name: "Không trừ", amount: 0 }]);
});

test("invalid payroll inputs fail before an image can be exported", () => {
  for (const monthKey of ["", "2026-00", "2026-13", "2026-1", "not-a-month"]) {
    assert.throws(() => createPayrollSlip(input({ monthKey })), /tháng lương/);
  }
  for (const dailyRate of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createPayrollSlip(input({ dailyRate })), /lương\/ngày/);
  }
  assert.throws(() => createPayrollSlip(input({ employeeId: "" })), /nhân viên/);
  assert.throws(() => createPayrollSlip(input({ deductions: [{ name: "  ", amount: 100 }] })), /tên/);
  assert.throws(() => createPayrollSlip(input({ deductions: [{ name: "Khoản trừ", amount: -100 }] })), /số tiền/);
  assert.throws(() => createPayrollSlip(input({ deductions: [{ name: "Khoản trừ", amount: NaN }] })), /số tiền/);
  assert.throws(() => createPayrollSlip(input({ dailyRate: Number.MAX_SAFE_INTEGER, records: [attendance("2026-10-01"), attendance("2026-10-02")] })), /quá lớn/);
  assert.throws(() => createPayrollSlip(input({ deductions: [{ name: "Một", amount: Number.MAX_SAFE_INTEGER }, { name: "Hai", amount: 1 }] })), /quá lớn/);
});

test("PNG download uses the displayed image and a safe filename for the employee and month", () => {
  const previous = globalThis.document;
  let clicked = false, removed = false;
  const link = { click() { clicked = true; }, remove() { removed = true; } };
  globalThis.document = { createElement: () => link, body: { appendChild() {} } };
  try {
    const slip = createPayrollSlip(input({ employeeName: "Mỹ Tiên / A" }));
    downloadPayrollPng("data:image/png;base64,test", slip);
    assert.equal(link.href, "data:image/png;base64,test");
    assert.equal(link.download, "phieu-luong-2026-10-my-tien-a-employee.png");
    assert.ok(clicked && removed);
  } finally { globalThis.document = previous; }
});

test("payroll fetch reads every attendance page and propagates errors instead of paying a partial dataset", async () => {
  const records = Array.from({ length: 5 }, (_, index) => attendance(`2026-10-0${index + 1}`));
  const filters = [], ranges = [];
  let failOnSecondPage = false;
  globalThis.payrollTestBackend = { from(table) {
    assert.equal(table, "attendance_records");
    const query = {
      select() { return query; },
      in(column, value) { filters.push([column, value]); return query; },
      gte(column, value) { filters.push([column, value]); return query; },
      lt(column, value) { filters.push([column, value]); return query; },
      order() { return query; },
      range(start, end) {
        ranges.push([start, end]);
        if (failOnSecondPage && start > 0) return Promise.resolve({ data: null, error: new Error("Network unavailable") });
        // Simulate a server response limit smaller than the requested page.
        return Promise.resolve({ data: records.slice(start, Math.min(end + 1, start + 2)), error: null });
      },
    };
    return query;
  } };
  try {
    const { fetchAttendanceRecordsForExport } = await loadSource("src/services/attendance.ts", true);
    assert.deepEqual(await fetchAttendanceRecordsForExport("2026-10", ["employee-1"]), records);
    assert.deepEqual(ranges.map(([start]) => start), [0, 2, 4, 5]);
    assert.ok(filters.some(([key, value]) => key === "work_date" && value === "2026-10-01"));
    assert.ok(filters.some(([key, value]) => key === "work_date" && value === "2026-11-01"));
    assert.deepEqual(await fetchAttendanceRecordsForExport("2026-10", []), []);
    failOnSecondPage = true;
    await assert.rejects(fetchAttendanceRecordsForExport("2026-10", ["employee-1"]), /Network unavailable/);
  } finally { delete globalThis.payrollTestBackend; }
});
