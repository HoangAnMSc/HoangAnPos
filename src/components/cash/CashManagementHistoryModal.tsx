import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Search } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { getErrorMessage } from "../../lib/errors";
import { formatCurrency, formatDateTime } from "../../lib/format";
import {
  fetchCashDrawerChecks,
  type CashDrawerCheck,
} from "../../services/cashManagement";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Modal } from "../ui/Modal";
import { StateNotice } from "../ui/Page";
import { Spinner } from "../ui/Spinner";

type CheckFilter = "all" | "match" | "mismatch" | "pending";

type CashManagementHistoryModalProps = {
  open: boolean;
  onClose: () => void;
};

const filters: Array<{ key: CheckFilter; label: string }> = [
  { key: "all", label: "Tất cả" },
  { key: "match", label: "Khớp" },
  { key: "mismatch", label: "Lệch" },
  { key: "pending", label: "Chờ" },
];

function CheckStatus({ check }: { check: CashDrawerCheck }) {
  const tone =
    check.is_match === true
      ? "bg-emerald-100 text-emerald-700"
      : check.is_match === false
        ? "bg-red-100 text-red-700"
        : "bg-amber-100 text-amber-700";

  return (
    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${tone}`}>
      {check.is_match === true
        ? "Đã khớp"
        : check.is_match === false
          ? "Không khớp"
          : "Chờ xác nhận"}
    </span>
  );
}

function getVariance(check: CashDrawerCheck) {
  return check.actual_cash == null
    ? null
    : Number(check.actual_cash) - Number(check.expected_cash);
}

function formatVariance(value: number | null) {
  if (value == null) return "Chưa xác nhận";
  if (value === 0) return "Khớp";
  return formatCurrency(value);
}

export function CashManagementHistoryModal({
  onClose,
  open,
}: CashManagementHistoryModalProps) {
  const { canAccess } = useAuth();
  const [checks, setChecks] = useState<CashDrawerCheck[]>([]);
  const [filter, setFilter] = useState<CheckFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canViewHistory = canAccess("cash-management.history.view");
  const canViewAll = canAccess("cash-management.view-all");

  const loadHistory = useCallback(async () => {
    if (!canViewHistory) return;

    setLoading(true);
    setError("");
    try {
      setChecks(await fetchCashDrawerChecks());
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, "Không tải được lịch sử đối soát két.")
      );
    } finally {
      setLoading(false);
    }
  }, [canViewHistory]);

  useEffect(() => {
    if (open && canViewHistory) {
      void loadHistory();
    }
  }, [canViewHistory, loadHistory, open]);

  const counts = useMemo(
    () => ({
      match: checks.filter((check) => check.is_match === true).length,
      mismatch: checks.filter((check) => check.is_match === false).length,
      pending: checks.filter((check) => check.is_match === null).length,
    }),
    [checks]
  );

  const visibleChecks = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("vi");
    return checks.filter((check) => {
      const matchesSearch =
        !normalizedSearch ||
        check.employee_name.toLocaleLowerCase("vi").includes(normalizedSearch);
      const matchesFilter =
        filter === "all" ||
        (filter === "match" && check.is_match === true) ||
        (filter === "mismatch" && check.is_match === false) ||
        (filter === "pending" && check.is_match === null);
      return matchesSearch && matchesFilter;
    });
  }, [checks, filter, search]);

  return (
    <Modal
      footer={
        <Button className="w-full sm:w-auto" onClick={onClose} variant="secondary">
          Đóng
        </Button>
      }
      onClose={onClose}
      open={open && canViewHistory}
      size="xl"
      title="Lịch sử đối soát két"
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-extrabold text-slate-950">
              {canViewAll ? "Toàn bộ nhân viên" : "Lịch sử của bạn"}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {visibleChecks.length}/{checks.length} bản ghi
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-extrabold">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
              {counts.match} khớp
            </span>
            <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">
              {counts.mismatch} lệch
            </span>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
              {counts.pending} chờ
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative block flex-1">
            <span className="sr-only">Tìm nhân viên</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-moss-500 focus:ring-4 focus:ring-moss-100"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm theo tên nhân viên"
              type="search"
              value={search}
            />
          </label>
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
            {filters.map((item) => (
              <button
                className={`rounded-lg px-3 py-2 text-xs font-extrabold transition ${
                  filter === item.key
                    ? "bg-white text-coal shadow-sm"
                    : "text-slate-500 hover:text-coal"
                }`}
                key={item.key}
                onClick={() => setFilter(item.key)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {error ? <StateNotice message={error} tone="error" /> : null}

        {loading && checks.length === 0 ? (
          <Spinner label="Đang tải lịch sử đối soát..." />
        ) : visibleChecks.length === 0 ? (
          <EmptyState
            description="Các lần xác nhận tiền đầu ca sẽ xuất hiện tại đây."
            icon={Bell}
            title="Chưa có lịch sử"
          />
        ) : (
          <div className="max-h-[58dvh] divide-y divide-slate-100 overflow-y-auto overscroll-contain rounded-xl border border-slate-200">
            {visibleChecks.map((check) => {
              const variance = getVariance(check);
              return (
                <article
                  className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                  key={check.id}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-extrabold text-slate-950">
                        {check.employee_name}
                      </p>
                      <CheckStatus check={check} />
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {formatDateTime(check.checked_at ?? check.created_at)}
                    </p>
                    {check.reason ? (
                      <p className="mt-1 text-xs font-semibold leading-5 text-red-700">
                        {check.reason}
                      </p>
                    ) : null}
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-xs sm:min-w-64">
                    <div>
                      <dt className="font-bold text-slate-500">Hệ thống</dt>
                      <dd className="mt-1 font-black tabular-nums text-slate-950">
                        {formatCurrency(Number(check.expected_cash))}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-500">Xác nhận</dt>
                      <dd className="mt-1 font-black tabular-nums text-slate-950">
                        {check.actual_cash == null
                          ? "Chưa nhập"
                          : formatCurrency(Number(check.actual_cash))}
                      </dd>
                    </div>
                  </dl>
                  <div className="text-left sm:min-w-28 sm:text-right">
                    <p className="text-[11px] font-bold text-slate-500">Chênh lệch</p>
                    <p
                      className={`mt-1 font-black tabular-nums ${
                        variance === 0
                          ? "text-emerald-700"
                          : variance == null
                            ? "text-slate-400"
                            : "text-red-700"
                      }`}
                    >
                      {formatVariance(variance)}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
