import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, CalendarDays, Download, Printer, ReceiptText, TrendingUp } from "lucide-react";
import { Button } from "../components/ui/Button";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { PageContainer, PageToolbar } from "../components/ui/Page";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { getErrorMessage } from "../lib/errors";
import { formatCurrency } from "../lib/format";
import { fetchOrders, type OrderWithItems } from "../services/orders";

type RevenueOrder = OrderWithItems & {
  customers?: { name: string } | null;
  order_items?: Array<{ product_name: string; quantity: number }> | null;
};

function localDateInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function money(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function SummaryCard({ icon: Icon, label, value, tone = "moss" }: { icon: typeof Banknote; label: string; value: string; tone?: "moss" | "blue" | "amber" | "slate" }) {
  const tones = {
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    moss: "bg-moss-50 text-moss-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span><p className="mt-3 text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 truncate text-xl font-black tabular-nums text-slate-950" title={value}>{value}</p></div>;
}

export function RevenuePage() {
  const { canAccess } = useAuth();
  const [orders, setOrders] = useState<RevenueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [quickPeriod, setQuickPeriod] = useState<"" | "today" | "first-half" | "second-half">("today");
  const canExport = canAccess("revenue.export");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      setOrders((await fetchOrders()) as RevenueOrder[]);
    } catch (error) {
      setErrorNotice({ title: "Không tải được doanh thu", message: getErrorMessage(error, "Không tải được dữ liệu hóa đơn.") });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const availableYears = useMemo(() => [...new Set([
    new Date().getFullYear(),
    ...orders.map((order) => new Date(order.created_at).getFullYear()),
  ])].sort((a, b) => b - a), [orders]);
  const availableDays = useMemo(() => selectedMonth
    ? Array.from({ length: new Date(Number(selectedYear), Number(selectedMonth), 0).getDate() }, (_, index) => index + 1)
    : [], [selectedMonth, selectedYear]);

  const filteredOrders = useMemo(() => orders.filter((order) => {
    if (order.status !== "paid") return false;
    const createdAt = new Date(order.created_at);
    const year = createdAt.getFullYear();
    const month = createdAt.getMonth() + 1;
    const day = createdAt.getDate();
    const today = new Date();
    if (quickPeriod === "today") return localDateInput(createdAt) === localDateInput(today);
    if (year !== Number(selectedYear)) return false;
    if (quickPeriod === "first-half") return month <= 6;
    if (quickPeriod === "second-half") return month >= 7;
    if (selectedMonth && month !== Number(selectedMonth)) return false;
    if (selectedDay && day !== Number(selectedDay)) return false;
    return true;
  }).sort((a, b) => a.created_at.localeCompare(b.created_at)), [orders, quickPeriod, selectedDay, selectedMonth, selectedYear]);

  const totals = useMemo(() => {
    const revenue = filteredOrders.reduce((sum, order) => sum + Number(order.total), 0);
    const cash = filteredOrders.filter((order) => order.payment_method === "cash").reduce((sum, order) => sum + Number(order.total), 0);
    const transfer = revenue - cash;
    return { revenue, cash, transfer, average: filteredOrders.length ? revenue / filteredOrders.length : 0 };
  }, [filteredOrders]);

  const dailyRows = useMemo(() => {
    const grouped = new Map<string, { count: number; revenue: number }>();
    filteredOrders.forEach((order) => {
      const key = localDateInput(new Date(order.created_at));
      const current = grouped.get(key) ?? { count: 0, revenue: 0 };
      grouped.set(key, { count: current.count + 1, revenue: current.revenue + Number(order.total) });
    });
    return [...grouped.entries()].map(([day, value]) => ({ day, ...value })).sort((a, b) => a.day.localeCompare(b.day));
  }, [filteredOrders]);
  const maxDailyRevenue = Math.max(...dailyRows.map((row) => row.revenue), 1);
  const periodLabel = quickPeriod === "today" ? "Hôm nay" : quickPeriod === "first-half" ? `6 tháng đầu năm ${selectedYear}` : quickPeriod === "second-half" ? `6 tháng cuối năm ${selectedYear}` : selectedDay ? `Ngày ${selectedDay}/${selectedMonth}/${selectedYear}` : selectedMonth ? `Tháng ${selectedMonth}/${selectedYear}` : `Năm ${selectedYear}`;

  function exportCsv() {
    const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const rows = [["Ngày tháng", "Giao dịch", "Số tiền"], ...dailyRows.map((row) => [shortDate(row.day), `Tổng doanh thu bán hàng trong ngày (${row.count} hóa đơn)`, row.revenue]), ["", "Tổng cộng", totals.revenue]];
    const blob = new Blob(["\uFEFF" + rows.map((row) => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `so-s1a-hkd-${selectedYear}-${quickPeriod || selectedMonth || "nam"}.csv`; link.click();
    URL.revokeObjectURL(url);
  }

  function printBook() {
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) return;
    const rows = dailyRows.map((row) => `<tr><td>${shortDate(row.day)}</td><td>Tổng doanh thu bán hàng trong ngày (${row.count} hóa đơn)</td><td class="num">${money(row.revenue)}</td></tr>`).join("");
    printWindow.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Sổ S1a-HKD</title><style>@page{size:A4;margin:14mm}body{font:13px Arial;color:#111}h1{text-align:center;font-size:18px;margin:18px 0 5px}.top{display:flex;justify-content:space-between;gap:30px}.top p{margin:4px 0}.sub{text-align:center;margin:0 0 18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #222;padding:7px;vertical-align:top}th{background:#eee}.num{text-align:right;white-space:nowrap}tfoot{font-weight:bold}.sign{margin-top:28px;text-align:right}.sign b{display:block;margin-top:6px}</style></head><body><div class="top"><div><p><b>HỘ, CÁ NHÂN KINH DOANH:</b> HỘ KINH DOANH SỮA TÃ BABYBOO</p><p><b>Địa chỉ:</b> ................................................</p><p><b>Mã số thuế:</b> ..........................................</p></div><div><b>Mẫu số S1a-HKD</b></div></div><h1>SỔ DOANH THU BÁN HÀNG HÓA, DỊCH VỤ</h1><p class="sub">Kỳ: ${escapeHtml(periodLabel)}</p><table><thead><tr><th style="width:18%">Ngày tháng<br>A</th><th>Giao dịch<br>B</th><th style="width:23%">Số tiền<br>1</th></tr></thead><tbody>${rows || '<tr><td colspan="3" style="text-align:center">Không có giao dịch</td></tr>'}</tbody><tfoot><tr><td></td><td>Tổng cộng</td><td class="num">${money(totals.revenue)}</td></tr></tfoot></table><div class="sign">Ngày ..... tháng ..... năm .....<b>NGƯỜI ĐẠI DIỆN HỘ KINH DOANH</b><p>(Ký, họ tên, đóng dấu)</p></div></body></html>`);
    printWindow.document.close(); printWindow.focus(); window.setTimeout(() => printWindow.print(), 200);
  }

  return <PageContainer maxWidth="none">
    <ConfigNotice />
    <PageToolbar eyebrow="Sổ S1a-HKD" title="Thống kê doanh thu" description="Tự động tổng hợp từ hóa đơn thành công; hóa đơn đã hủy không được tính vào doanh thu. Dùng bộ lọc kỳ để xem, đối chiếu, in hoặc xuất sổ.">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="text-xs font-bold text-slate-500">Kỳ xem<select className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800" onChange={(e) => setQuickPeriod(e.target.value as typeof quickPeriod)} value={quickPeriod}><option value="">Theo ngày tháng</option><option value="today">Hôm nay</option><option value="first-half">6 tháng đầu năm</option><option value="second-half">6 tháng cuối năm</option></select></label>
          <label className="text-xs font-bold text-slate-500">Năm<select className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800" disabled={quickPeriod === "today"} onChange={(e) => { setSelectedYear(e.target.value); setQuickPeriod(""); }} value={selectedYear}>{availableYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-500">Tháng<select className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 disabled:bg-slate-100" disabled={Boolean(quickPeriod)} onChange={(e) => { setSelectedMonth(e.target.value); setSelectedDay(""); }} value={selectedMonth}><option value="">Tháng</option>{Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{month}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-500">Ngày<select className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 disabled:bg-slate-100" disabled={Boolean(quickPeriod) || !selectedMonth} onChange={(e) => setSelectedDay(e.target.value)} value={selectedDay}><option value="">Ngày</option>{availableDays.map((day) => <option key={day} value={day}>{day}</option>)}</select></label>
        </div>
        {canExport ? <div className="grid grid-cols-2 gap-2"><Button onClick={exportCsv} variant="secondary"><Download className="h-4 w-4" />Xuất CSV</Button><Button onClick={printBook}><Printer className="h-4 w-4" />In sổ</Button></div> : null}
      </div>
    </PageToolbar>

    {loading ? <div className="rounded-2xl bg-white p-10 shadow-soft"><Spinner label="Đang tổng hợp doanh thu..." /></div> : <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><SummaryCard icon={TrendingUp} label="Tổng doanh thu" value={formatCurrency(totals.revenue)} /><SummaryCard icon={ReceiptText} label="Giao dịch" value={`${filteredOrders.length} hóa đơn`} tone="blue" /><SummaryCard icon={Banknote} label="Tiền mặt / chuyển khoản" value={`${money(totals.cash)} / ${money(totals.transfer)}`} tone="amber" /><SummaryCard icon={CalendarDays} label="Trung bình hóa đơn" value={formatCurrency(totals.average)} tone="slate" /></section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5"><div className="flex items-center justify-between"><div><h3 className="font-display text-lg font-bold">Tổng doanh thu theo ngày</h3><p className="text-sm font-semibold text-slate-500">{periodLabel}</p></div></div>{dailyRows.length ? <div className="mt-5 flex h-44 items-end gap-2 overflow-x-auto border-b border-slate-200 pb-1">{dailyRows.map((row) => <div className="group flex h-full min-w-10 flex-1 flex-col justify-end" key={row.day} title={`${shortDate(row.day)}: ${formatCurrency(row.revenue)} · ${row.count} hóa đơn`}><span className="mb-1 hidden text-center text-[10px] font-bold text-slate-500 group-hover:block">{money(row.revenue)}</span><div className="min-h-1 rounded-t-lg bg-moss-500" style={{ height: `${Math.max((row.revenue / maxDailyRevenue) * 100, 4)}%` }} /><span className="mt-1 text-center text-[10px] font-bold text-slate-500">{row.day.slice(8, 10)}</span></div>)}</div> : <p className="py-12 text-center text-sm font-semibold text-slate-500">Chưa có doanh thu trong kỳ đã chọn.</p>}</section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-950">
              Sổ doanh thu bán hàng hóa, dịch vụ
            </h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Mẫu S1a-HKD · Tổng hợp mỗi ngày một dòng · Đơn vị tính: đồng
            </p>
          </div>
          <span className="w-fit rounded-full bg-moss-100 px-3 py-1 text-xs font-extrabold text-moss-800">
            {dailyRows.length} ngày có doanh thu
          </span>
        </div>

        <div className="max-h-[58dvh] overflow-y-auto overscroll-contain">
          <div className="sticky top-0 z-10 hidden grid-cols-[150px_minmax(240px,1fr)_180px] gap-4 bg-slate-100 px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-slate-500 md:grid">
            <span>Ngày tháng</span>
            <span>Giao dịch</span>
            <span className="text-right">Số tiền</span>
          </div>

          {dailyRows.length ? (
            <div className="divide-y divide-slate-100">
              {dailyRows.map((row) => (
                <article
                  className="grid gap-3 px-3 py-3 transition hover:bg-moss-50/60 sm:px-4 md:grid-cols-[150px_minmax(240px,1fr)_180px] md:items-center md:gap-4 md:px-5"
                  key={row.day}
                >
                  <div className="flex items-center justify-between gap-3 md:block">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-400 md:hidden">
                      Ngày
                    </span>
                    <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm font-extrabold tabular-nums text-slate-700">
                      {shortDate(row.day)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-slate-950">
                      Tổng doanh thu trong ngày
                    </p>
                    <span className="mt-1 inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700">
                      {row.count} hóa đơn
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-moss-50 px-3 py-2 md:block md:bg-transparent md:px-0 md:py-0 md:text-right">
                    <span className="text-xs font-bold uppercase tracking-wide text-moss-600 md:hidden">
                      Doanh thu
                    </span>
                    <span className="text-base font-black tabular-nums text-moss-800 md:text-lg">
                      {formatCurrency(row.revenue)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="px-4 py-14 text-center text-sm font-semibold text-slate-500">
              Không có giao dịch trong kỳ đã chọn.
            </div>
          )}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t-2 border-moss-200 bg-moss-50 px-4 py-4 sm:px-5">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-moss-600">Tổng cộng</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{periodLabel}</p>
          </div>
          <p className="text-right text-xl font-black tabular-nums text-moss-900 sm:text-2xl">
            {formatCurrency(totals.revenue)}
          </p>
        </div>
      </section>
    </>}
    <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
  </PageContainer>;
}
