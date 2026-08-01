import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, BellRing, Landmark, RefreshCw, Search, WalletCards } from "lucide-react";
import { Button } from "../components/ui/Button";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { PageContainer, PageToolbar } from "../components/ui/Page";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { getErrorMessage } from "../lib/errors";
import { formatCurrency, formatDateTime } from "../lib/format";
import {
  fetchCashDrawerChecks,
  fetchCashDrawerHandover,
  fetchCashDrawerSessions,
  type CashDrawerCheck,
  type CashDrawerHandover,
  type CashDrawerSession,
} from "../services/cashManagement";

type CheckFilter = "all" | "match" | "mismatch" | "pending";

type FundCardProps = {
  description: string;
  icon: typeof Banknote;
  label: string;
  tone: "blue" | "green" | "slate";
  value: number;
};

function FundCard({ description, icon: Icon, label, tone, value }: FundCardProps) {
  const tones = {
    blue: "bg-blue-100 text-blue-700",
    green: "bg-emerald-100 text-emerald-700",
    slate: "bg-slate-900 text-white",
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-black tabular-nums text-slate-950 sm:text-3xl">{formatCurrency(value)}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">{description}</p>
    </article>
  );
}

function CheckStatus({ check }: { check: CashDrawerCheck }) {
  const tone = check.is_match === true
    ? "bg-emerald-100 text-emerald-700"
    : check.is_match === false
      ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-700";

  return (
    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${tone}`}>
      {check.is_match === true ? "Đã khớp" : check.is_match === false ? "Không khớp" : "Chờ xác nhận"}
    </span>
  );
}

function getVariance(check: CashDrawerCheck) {
  return check.actual_cash == null
    ? null
    : Number(check.actual_cash) - Number(check.expected_cash);
}

function formatVariance(value: number | null) {
  if (value == null) return "—";
  if (value === 0) return "Khớp";
  return formatCurrency(value);
}

export function CashManagementPage() {
  const { canAccess } = useAuth();
  const [cashChecks, setCashChecks] = useState<CashDrawerCheck[]>([]);
  const [sessions, setSessions] = useState<CashDrawerSession[]>([]);
  const [handover, setHandover] = useState<CashDrawerHandover | null>(null);
  const [checkFilter, setCheckFilter] = useState<CheckFilter>("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const canViewAll = canAccess("cash-management.view-all");

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [nextChecks, nextSessions, nextHandover] = await Promise.all([
        fetchCashDrawerChecks(),
        fetchCashDrawerSessions(),
        fetchCashDrawerHandover(),
      ]);
      setCashChecks(nextChecks);
      setSessions(nextSessions);
      setHandover(nextHandover);
    } catch (error) {
      if (!quiet) {
        setErrorNotice({
          title: "Không tải được dữ liệu quỹ",
          message: getErrorMessage(error, "Không thể tải tiền quỹ và lịch sử đối soát."),
        });
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const interval = window.setInterval(() => void loadData(true), 30_000);
    return () => window.clearInterval(interval);
  }, [loadData]);

  const activeSession = sessions.find((session) => session.status === "open");
  const cashInDrawer = Number(activeSession?.expected_cash ?? handover?.expected_opening_cash ?? 0);
  const transferAmount = useMemo(
    () => sessions.reduce((total, session) => total + Number(session.transfer_sales), 0),
    [sessions]
  );
  const revenue = cashInDrawer + transferAmount;
  const counts = useMemo(
    () => ({
      match: cashChecks.filter((check) => check.is_match === true).length,
      mismatch: cashChecks.filter((check) => check.is_match === false).length,
      pending: cashChecks.filter((check) => check.is_match === null).length,
    }),
    [cashChecks]
  );
  const filteredChecks = useMemo(() => {
    const normalizedSearch = employeeSearch.trim().toLocaleLowerCase("vi");
    return cashChecks.filter((check) => {
      const matchesSearch = !normalizedSearch
        || check.employee_name.toLocaleLowerCase("vi").includes(normalizedSearch);
      const matchesFilter = checkFilter === "all"
        || (checkFilter === "match" && check.is_match === true)
        || (checkFilter === "mismatch" && check.is_match === false)
        || (checkFilter === "pending" && check.is_match === null);
      return matchesSearch && matchesFilter;
    });
  }, [cashChecks, checkFilter, employeeSearch]);

  if (loading) {
    return (
      <PageContainer>
        <ConfigNotice />
        <div className="rounded-2xl bg-white p-10 shadow-soft">
          <Spinner label="Đang tổng hợp quỹ và đối soát..." />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="none">
      <ConfigNotice />
      <PageToolbar
        eyebrow="Theo dõi tiền bán hàng"
        title="Quỹ & Đối soát"
        description="Quản lý tiền két hiện có, tiền chuyển khoản và lịch sử nhân viên xác nhận tiền khi vào ca."
      >
        <Button className="w-full sm:w-auto" onClick={() => void loadData()} variant="secondary">
          <RefreshCw className="h-4 w-4" /> Làm mới
        </Button>
      </PageToolbar>

      <section className="grid gap-3 md:grid-cols-3">
        <FundCard
          description="Số tiền mặt hệ thống dự kiến đang có trong két."
          icon={Banknote}
          label="Tiền két hiện có"
          tone="green"
          value={cashInDrawer}
        />
        <FundCard
          description="Tổng thanh toán chuyển khoản đã ghi nhận."
          icon={Landmark}
          label="Tiền chuyển khoản"
          tone="blue"
          value={transferAmount}
        />
        <FundCard
          description="Doanh thu = tiền két hiện có + tiền chuyển khoản."
          icon={WalletCards}
          label="Doanh thu"
          tone="slate"
          value={revenue}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <BellRing className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-display text-lg font-bold text-slate-950">Lịch sử xác nhận tiền két</h3>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {canViewAll ? "Toàn bộ nhân viên" : "Theo phạm vi được phân quyền"} · {filteredChecks.length}/{cashChecks.length} bản ghi
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-extrabold">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">{counts.match} khớp</span>
              <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">{counts.mismatch} lệch</span>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">{counts.pending} chờ</span>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <label className="relative block lg:w-72">
              <span className="sr-only">Tìm nhân viên</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="h-10 w-full rounded-full border border-slate-200 bg-white pl-9 pr-4 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-moss-500 focus:ring-4 focus:ring-moss-100"
                onChange={(event) => setEmployeeSearch(event.target.value)}
                placeholder="Tìm theo tên nhân viên"
                type="search"
                value={employeeSearch}
              />
            </label>
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1 text-[11px] font-extrabold sm:flex">
              {([
                ["all", "Tất cả"],
                ["match", "Khớp"],
                ["mismatch", "Lệch"],
                ["pending", "Chờ"],
              ] as Array<[CheckFilter, string]>).map(([value, label]) => (
                <button
                  className={`rounded-lg px-3 py-2 transition ${checkFilter === value ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                  key={value}
                  onClick={() => setCheckFilter(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="hidden max-h-[62dvh] overflow-auto md:block">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Nhân viên / thời gian</th>
                <th className="px-5 py-3">Kết quả</th>
                <th className="px-5 py-3">Tiền hệ thống</th>
                <th className="px-5 py-3">Tiền xác nhận</th>
                <th className="px-5 py-3">Chênh lệch / lý do</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredChecks.map((check) => {
                const variance = getVariance(check);
                return (
                  <tr className="align-top hover:bg-slate-50/70" key={check.id}>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">{check.employee_name}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{formatDateTime(check.checked_at ?? check.created_at)}</p>
                    </td>
                    <td className="px-5 py-4"><CheckStatus check={check} /></td>
                    <td className="px-5 py-4 font-black tabular-nums text-slate-950">{formatCurrency(Number(check.expected_cash))}</td>
                    <td className="px-5 py-4 font-black tabular-nums text-slate-950">{check.actual_cash == null ? "—" : formatCurrency(Number(check.actual_cash))}</td>
                    <td className="px-5 py-4">
                      <p className={`font-black tabular-nums ${variance === 0 ? "text-emerald-700" : variance == null ? "text-slate-400" : "text-red-700"}`}>{formatVariance(variance)}</p>
                      {check.reason ? <p className="mt-1 max-w-sm text-xs font-semibold leading-5 text-red-700">{check.reason}</p> : null}
                    </td>
                  </tr>
                );
              })}
              {!filteredChecks.length ? <tr><td className="px-5 py-10 text-center font-semibold text-slate-500" colSpan={5}>Không có bản ghi đối soát phù hợp.</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="max-h-[68dvh] divide-y divide-slate-100 overflow-auto md:hidden">
          {filteredChecks.map((check) => {
            const variance = getVariance(check);
            return (
              <article className="space-y-3 p-4" key={check.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-950">{check.employee_name}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{formatDateTime(check.checked_at ?? check.created_at)}</p>
                  </div>
                  <CheckStatus check={check} />
                </div>
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
                  <div className="bg-slate-50 p-3">
                    <dt className="text-[11px] font-bold text-slate-500">Tiền hệ thống</dt>
                    <dd className="mt-1 font-black tabular-nums text-slate-950">{formatCurrency(Number(check.expected_cash))}</dd>
                  </div>
                  <div className="bg-white p-3">
                    <dt className="text-[11px] font-bold text-slate-500">Tiền xác nhận</dt>
                    <dd className="mt-1 font-black tabular-nums text-slate-950">{check.actual_cash == null ? "Chưa nhập" : formatCurrency(Number(check.actual_cash))}</dd>
                  </div>
                </dl>
                <div className="flex items-start justify-between gap-3 text-xs">
                  <span className="font-bold text-slate-500">Chênh lệch</span>
                  <div className="text-right">
                    <p className={`font-black tabular-nums ${variance === 0 ? "text-emerald-700" : variance == null ? "text-slate-400" : "text-red-700"}`}>{formatVariance(variance)}</p>
                    {check.reason ? <p className="mt-1 max-w-[240px] font-semibold leading-5 text-red-700">{check.reason}</p> : null}
                  </div>
                </div>
              </article>
            );
          })}
          {!filteredChecks.length ? <p className="px-4 py-10 text-center text-sm font-semibold text-slate-500">Không có bản ghi đối soát phù hợp.</p> : null}
        </div>
      </section>

      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </PageContainer>
  );
}
