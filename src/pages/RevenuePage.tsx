import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Download,
  Landmark,
  ReceiptText,
  TrendingUp,
} from "lucide-react";
import { useOutletContext } from "react-router-dom";
import type { AdminOutletContext } from "../components/layout/AdminLayout";
import { Button } from "../components/ui/Button";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import {
  ErrorNoticeModal,
  type ErrorNotice,
} from "../components/ui/ErrorNoticeModal";
import { PageContainer } from "../components/ui/Page";
import { Spinner } from "../components/ui/Spinner";
import { CashManagementPage } from "./CashManagementPage";
import { useAuth } from "../contexts/AuthContext";
import { getErrorMessage } from "../lib/errors";
import { formatCurrency } from "../lib/format";
import { supabase } from "../lib/supabase";
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
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function RevenuePage() {
  const { canAccess } = useAuth();
  const { setHeaderCashBalance } = useOutletContext<AdminOutletContext>();
  const [orders, setOrders] = useState<RevenueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [quickPeriod, setQuickPeriod] = useState<
    "" | "today" | "first-half" | "second-half"
  >("today");
  const canExport = canAccess("revenue.export");

  useEffect(() => () => setHeaderCashBalance(null), [setHeaderCashBalance]);

  const handleCashBalanceChange = useCallback(
    (value: number) => {
      setHeaderCashBalance(value);
    },
    [setHeaderCashBalance],
  );

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      setOrders((await fetchOrders()) as RevenueOrder[]);
    } catch (error) {
      if (!quiet)
        setErrorNotice({
          title: "Không tải được doanh thu",
          message: getErrorMessage(error, "Không tải được dữ liệu hóa đơn."),
        });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const refresh = () => void loadData(true);
    const channel = supabase
      .channel("revenue-orders-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        refresh,
      )
      .subscribe();
    const interval = window.setInterval(refresh, 10_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("pos-financial-sync", refresh);
    const onStorage = (event: StorageEvent) => {
      if (event.key === "pos-financial-sync") refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pos-financial-sync", refresh);
      window.removeEventListener("storage", onStorage);
      void supabase.removeChannel(channel);
    };
  }, [loadData]);

  const availableYears = useMemo(
    () =>
      [
        ...new Set([
          new Date().getFullYear(),
          ...orders.map((order) => new Date(order.created_at).getFullYear()),
        ]),
      ].sort((a, b) => b - a),
    [orders],
  );
  const availableDays = useMemo(
    () =>
      selectedMonth
        ? Array.from(
            {
              length: new Date(
                Number(selectedYear),
                Number(selectedMonth),
                0,
              ).getDate(),
            },
            (_, index) => index + 1,
          )
        : [],
    [selectedMonth, selectedYear],
  );

  const filteredOrders = useMemo(
    () =>
      orders
        .filter((order) => {
          if (order.status !== "paid") return false;
          const createdAt = new Date(order.created_at);
          const year = createdAt.getFullYear();
          const month = createdAt.getMonth() + 1;
          const day = createdAt.getDate();
          const today = new Date();
          if (quickPeriod === "today")
            return localDateInput(createdAt) === localDateInput(today);
          if (year !== Number(selectedYear)) return false;
          if (quickPeriod === "first-half") return month <= 6;
          if (quickPeriod === "second-half") return month >= 7;
          if (selectedMonth && month !== Number(selectedMonth)) return false;
          if (selectedDay && day !== Number(selectedDay)) return false;
          return true;
        })
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [orders, quickPeriod, selectedDay, selectedMonth, selectedYear],
  );

  const totals = useMemo(() => {
    const revenue = filteredOrders.reduce(
      (sum, order) => sum + Number(order.total),
      0,
    );
    const cash = filteredOrders
      .filter((order) => order.payment_method === "cash")
      .reduce((sum, order) => sum + Number(order.total), 0);
    const transfer = revenue - cash;
    return { revenue, cash, transfer };
  }, [filteredOrders]);

  const dailyRows = useMemo(() => {
    const grouped = new Map<string, { count: number; revenue: number }>();
    filteredOrders.forEach((order) => {
      const key = localDateInput(new Date(order.created_at));
      const current = grouped.get(key) ?? { count: 0, revenue: 0 };
      grouped.set(key, {
        count: current.count + 1,
        revenue: current.revenue + Number(order.total),
      });
    });
    return [...grouped.entries()]
      .map(([day, value]) => ({ day, ...value }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [filteredOrders]);
  const cashPercent = totals.revenue ? (totals.cash / totals.revenue) * 100 : 0;
  const periodLabel =
    quickPeriod === "today"
      ? "Hôm nay"
      : quickPeriod === "first-half"
        ? `6 tháng đầu năm ${selectedYear}`
        : quickPeriod === "second-half"
          ? `6 tháng cuối năm ${selectedYear}`
          : selectedDay
            ? `Ngày ${selectedDay}/${selectedMonth}/${selectedYear}`
            : selectedMonth
              ? `Tháng ${selectedMonth}/${selectedYear}`
              : `Năm ${selectedYear}`;

  function exportCsv() {
    const quote = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`;
    const rows = [
      ["Ngày tháng", "Giao dịch", "Số tiền"],
      ...dailyRows.map((row) => [
        shortDate(row.day),
        `Tổng doanh thu bán hàng trong ngày (${row.count} hóa đơn)`,
        row.revenue,
      ]),
      ["", "Tổng cộng", totals.revenue],
    ];
    const blob = new Blob(
      ["\uFEFF" + rows.map((row) => row.map(quote).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `so-s1a-hkd-${selectedYear}-${quickPeriod || selectedMonth || "nam"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageContainer maxWidth="none">
      <ConfigNotice />
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-soft sm:p-5">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-coal sm:text-xl">
              Thời gian
            </h2>
            <p className="text-[11px] font-semibold text-slate-500">
              {periodLabel}
            </p>
          </div>
          {canExport ? (
            <Button
              className="!min-h-9 !px-2.5 !py-1.5"
              onClick={exportCsv}
              variant="secondary"
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
          ) : null}
        </div>
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
          {(
            [
              ["today", "Hôm nay"],
              ["first-half", "6T đầu"],
              ["second-half", "6T cuối"],
              ["", "Tùy chọn"],
            ] as const
          ).map(([value, label]) => (
            <button
              className={`min-h-9 rounded-lg px-1.5 text-[11px] font-extrabold transition sm:text-xs ${quickPeriod === value ? "bg-white text-coal shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`}
              key={label}
              onClick={() => {
                setQuickPeriod(value);
                if (value) {
                  setSelectedMonth("");
                  setSelectedDay("");
                }
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        {quickPeriod !== "today" ? (
          <div
            className={`mt-2 grid gap-2 ${quickPeriod ? "grid-cols-1" : "grid-cols-3"}`}
          >
            <label className="text-[10px] font-bold text-slate-500">
              Năm
              <select
                className="mt-0.5 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold text-slate-800"
                onChange={(e) => {
                  setSelectedYear(e.target.value);
                }}
                value={selectedYear}
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            {!quickPeriod ? (
              <label className="text-[10px] font-bold text-slate-500">
                Tháng
                <select
                  className="mt-0.5 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold text-slate-800"
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    setSelectedDay("");
                  }}
                  value={selectedMonth}
                >
                  <option value="">Tháng</option>
                  {Array.from({ length: 12 }, (_, index) => index + 1).map(
                    (month) => (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    ),
                  )}
                </select>
              </label>
            ) : null}
            {!quickPeriod ? (
              <label className="text-[10px] font-bold text-slate-500">
                Ngày
                <select
                  className="mt-0.5 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold text-slate-800 disabled:bg-slate-100"
                  disabled={!selectedMonth}
                  onChange={(e) => setSelectedDay(e.target.value)}
                  value={selectedDay}
                >
                  <option value="">Ngày</option>
                  {availableDays.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}
      </section>

      {canAccess("cash-management") ? (
        <CashManagementPage
          embedded
          onCashBalanceChange={handleCashBalanceChange}
        />
      ) : null}

      {loading ? (
        <div className="rounded-2xl bg-white p-10 shadow-soft">
          <Spinner label="Đang tổng hợp doanh thu..." />
        </div>
      ) : (
        <>
          <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-4 text-white shadow-lift sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/10">
                  <TrendingUp className="h-5 w-5 text-emerald-300" />
                </span>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-300">
                    Tổng doanh thu
                  </p>
                  <p className="mt-0.5 text-2xl font-black tracking-tight tabular-nums sm:text-3xl">
                    {formatCurrency(totals.revenue)}
                  </p>
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-slate-200 ring-1 ring-white/10">
                <ReceiptText className="h-3.5 w-3.5" /> {filteredOrders.length}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/10 p-3 ring-1 ring-white/10">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200">
                  <Banknote className="h-3.5 w-3.5" />
                  Tiền mặt
                </p>
                <p className="mt-1 whitespace-nowrap text-sm font-black tabular-nums sm:text-lg">
                  {formatCurrency(totals.cash)}
                </p>
              </div>
              <div className="rounded-xl bg-white/10 p-3 ring-1 ring-white/10">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-sky-200">
                  <Landmark className="h-3.5 w-3.5" />
                  Chuyển khoản
                </p>
                <p className="mt-1 whitespace-nowrap text-sm font-black tabular-nums sm:text-lg">
                  {formatCurrency(totals.transfer)}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
            <div>
              <h3 className="font-display text-lg font-bold">
                Cơ cấu tổng doanh thu
              </h3>
              <p className="text-sm font-semibold text-slate-500">
                {periodLabel}
              </p>
            </div>
            <div className="mt-5 grid items-center gap-5 sm:grid-cols-[180px_1fr]">
              <div
                className="relative mx-auto h-40 w-40 rounded-full"
                style={{
                  background: totals.revenue
                    ? `conic-gradient(#16a34a 0 ${cashPercent}%, #2563eb ${cashPercent}% 100%)`
                    : "#e2e8f0",
                }}
              >
                <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-white text-center">
                  <span className="text-xs font-bold text-slate-500">
                    Tổng cộng
                  </span>
                  <strong className="mt-1 text-sm font-black text-slate-950">
                    {formatCurrency(totals.revenue)}
                  </strong>
                </div>
              </div>
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-green-50 px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-bold text-green-800">
                    <i className="h-3 w-3 rounded-full bg-green-600" />
                    Tiền mặt
                  </span>
                  <strong className="tabular-nums text-green-900">
                    {formatCurrency(totals.cash)}
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-blue-50 px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-bold text-blue-800">
                    <i className="h-3 w-3 rounded-full bg-blue-600" />
                    Chuyển khoản
                  </span>
                  <strong className="tabular-nums text-blue-900">
                    {formatCurrency(totals.transfer)}
                  </strong>
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3 sm:px-5">
              <div>
                <h3 className="font-display text-base font-bold text-slate-950 sm:text-lg">
                  Doanh thu theo ngày
                </h3>
                <p className="text-xs font-semibold text-slate-500">
                  {periodLabel}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-moss-100 px-2.5 py-1 text-xs font-extrabold text-moss-800">
                {dailyRows.length} ngày
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
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-3 transition hover:bg-moss-50/60 sm:px-4 md:grid-cols-[150px_minmax(240px,1fr)_180px] md:gap-4 md:px-5"
                      key={row.day}
                    >
                      <div>
                        <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm font-extrabold tabular-nums text-slate-700">
                          {shortDate(row.day)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="inline-flex rounded-full bg-sky-50 px-2 py-1 text-xs font-bold text-sky-700">
                          {row.count} hóa đơn
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="whitespace-nowrap text-sm font-black tabular-nums text-moss-800 sm:text-base md:text-lg">
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

            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t border-moss-200 bg-moss-50 px-4 py-3 sm:px-5">
              <div>
                <p className="text-sm font-extrabold text-moss-800">
                  Tổng cộng
                </p>
              </div>
              <p className="text-right text-lg font-black tabular-nums text-moss-900 sm:text-xl">
                {formatCurrency(totals.revenue)}
              </p>
            </div>
          </section>
        </>
      )}
      <ErrorNoticeModal
        notice={errorNotice}
        onClose={() => setErrorNotice(null)}
      />
    </PageContainer>
  );
}
