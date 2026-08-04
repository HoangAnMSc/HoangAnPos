import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Bell,
  ChevronDown,
  Edit3,
  Image as ImageIcon,
  Search,
  Trash2,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { getErrorMessage } from "../../lib/errors";
import { formatCurrency, formatDateTime } from "../../lib/format";
import { formatIntegerInput, normalizeIntegerInput } from "../../lib/format";
import { uploadAttendanceReconciliationImage } from "../../lib/cloudinary";
import {
  deleteCashReconciliation,
  fetchCashDrawerChecks,
  fetchCashDrawerSessions,
  updateCashReconciliation,
  type CashDrawerCheck,
  type CashDrawerSession,
} from "../../services/cashManagement";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { StateNotice } from "../ui/Page";
import { Spinner } from "../ui/Spinner";

type CheckFilter = "all" | "match" | "mismatch" | "pending";
type ReconciliationStatus = Exclude<CheckFilter, "all">;

type CashManagementHistoryModalProps = {
  open: boolean;
  onClose: () => void;
};

const filters: Array<{ key: CheckFilter; label: string }> = [
  { key: "all", label: "Tất cả" },
  { key: "mismatch", label: "Có lệch" },
  { key: "match", label: "Đã khớp" },
  { key: "pending", label: "Đang chờ" },
];

function getVariance(check: CashDrawerCheck) {
  return check.actual_cash == null
    ? null
    : Number(check.actual_cash) - Number(check.expected_cash);
}

function getStatus(check: CashDrawerCheck, session?: CashDrawerSession): ReconciliationStatus {
  if (check.is_match == null) return "pending";
  if (check.is_match === false || (session?.variance != null && Number(session.variance) !== 0)) {
    return "mismatch";
  }
  return "match";
}

const statusStyles: Record<ReconciliationStatus, string> = {
  match: "bg-emerald-100 text-emerald-700",
  mismatch: "bg-red-100 text-red-700",
  pending: "bg-amber-100 text-amber-800",
};

const statusLabels: Record<ReconciliationStatus, string> = {
  match: "Đã khớp",
  mismatch: "Có chênh lệch",
  pending: "Chờ xác nhận",
};

function EvidenceGallery({ label, urls }: { label: string; urls?: string[] | null }) {
  if (!urls?.length) return null;

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-slate-600">
        <ImageIcon className="h-3.5 w-3.5" /> {label} · {urls.length} ảnh
      </p>
      <div className="grid grid-cols-5 gap-2 sm:flex sm:flex-wrap">
        {urls.map((url, index) => (
          <a
            className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200 sm:h-16 sm:w-16"
            href={url}
            key={url}
            rel="noreferrer"
            target="_blank"
          >
            <img
              alt={`${label} ${index + 1}`}
              className="h-full w-full object-cover transition group-hover:scale-105"
              loading="lazy"
              src={url}
            />
          </a>
        ))}
      </div>
    </div>
  );
}

function MoneyItem({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="min-w-0 rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200">
      <dt className="text-[11px] font-bold text-slate-500">{label}</dt>
      <dd className="mt-1 truncate text-sm font-black tabular-nums text-slate-950">
        {value == null ? "Chưa xác nhận" : formatCurrency(value)}
      </dd>
    </div>
  );
}

export function CashManagementHistoryModal({ onClose, open }: CashManagementHistoryModalProps) {
  const { canAccess } = useAuth();
  const [checks, setChecks] = useState<CashDrawerCheck[]>([]);
  const [sessions, setSessions] = useState<CashDrawerSession[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CheckFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingCheck, setEditingCheck] = useState<CashDrawerCheck | null>(null);
  const [editActualCash, setEditActualCash] = useState("");
  const [editFiles, setEditFiles] = useState<File[]>([]);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const canViewHistory = canAccess("cash-management.history.view");
  const canViewAll = canAccess("cash-management.view-all");
  const canUpdate = canAccess("cash-management.reconciliation.update");
  const canDelete = canAccess("cash-management.reconciliation.delete");

  function openEdit(check: CashDrawerCheck) {
    setEditingCheck(check);
    setEditActualCash(check.actual_cash == null ? "" : String(Number(check.actual_cash)));
    setEditFiles([]);
    setEditError("");
  }

  async function saveEdit() {
    if (!editingCheck || saving) return;
    const actualCash = Number(editActualCash);
    if (!editActualCash.trim() || !Number.isFinite(actualCash) || actualCash < 0) {
      setEditError("Nhập số tiền thực đếm hợp lệ.");
      return;
    }
    const mismatch = actualCash !== Number(editingCheck.expected_cash);
    const totalImages = editingCheck.evidence_urls.length + editFiles.length;
    if (mismatch && (totalImages < 1 || totalImages > 5)) {
      setEditError("Khi tiền lệch cần có từ 1 đến 5 ảnh bằng chứng.");
      return;
    }

    setSaving(true);
    setEditError("");
    try {
      const uploadedUrls = await Promise.all(editFiles.map(uploadAttendanceReconciliationImage));
      await updateCashReconciliation(
        editingCheck.id,
        actualCash,
        mismatch ? [...editingCheck.evidence_urls, ...uploadedUrls] : []
      );
      setEditingCheck(null);
      await loadHistory();
    } catch (requestError) {
      setEditError(getErrorMessage(requestError, "Không sửa được bản ghi đối soát."));
    } finally {
      setSaving(false);
    }
  }

  async function removeCheck(check: CashDrawerCheck) {
    if (!window.confirm(`Xóa bản ghi đối soát của ${check.employee_name}?`)) return;
    setError("");
    try {
      await deleteCashReconciliation(check.id);
      setExpandedId(null);
      await loadHistory();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Không xóa được bản ghi đối soát."));
    }
  }

  const loadHistory = useCallback(async () => {
    if (!canViewHistory) return;
    setLoading(true);
    setError("");
    try {
      const [nextChecks, nextSessions] = await Promise.all([
        fetchCashDrawerChecks(),
        fetchCashDrawerSessions(),
      ]);
      setChecks(nextChecks);
      setSessions(nextSessions);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Không tải được lịch sử đối soát két."));
    } finally {
      setLoading(false);
    }
  }, [canViewHistory]);

  useEffect(() => {
    if (open && canViewHistory) void loadHistory();
  }, [canViewHistory, loadHistory, open]);

  const sessionById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions]
  );

  const counts = useMemo(() => {
    const next = { match: 0, mismatch: 0, pending: 0 };
    checks.forEach((check) => {
      next[getStatus(check, check.cash_session_id ? sessionById.get(check.cash_session_id) : undefined)] += 1;
    });
    return next;
  }, [checks, sessionById]);

  const visibleChecks = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("vi");
    return checks.filter((check) => {
      const session = check.cash_session_id ? sessionById.get(check.cash_session_id) : undefined;
      return (
        (!normalizedSearch || check.employee_name.toLocaleLowerCase("vi").includes(normalizedSearch)) &&
        (filter === "all" || getStatus(check, session) === filter)
      );
    });
  }, [checks, filter, search, sessionById]);

  return (
    <Modal
      bodyClassName="sm:pt-5"
      footer={<Button className="w-full sm:w-auto" onClick={onClose} variant="secondary">Đóng</Button>}
      onClose={onClose}
      open={open && canViewHistory}
      size="xl"
      title="Lịch sử đối soát"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {(["match", "mismatch", "pending"] as const).map((status) => (
            <button
              className={`rounded-xl px-3 py-2.5 text-left transition ${filter === status ? "ring-2 ring-coal/20" : "ring-1 ring-slate-200 hover:bg-slate-50"} ${status === "match" ? "bg-emerald-50" : status === "mismatch" ? "bg-red-50" : "bg-amber-50"}`}
              key={status}
              onClick={() => setFilter(filter === status ? "all" : status)}
              type="button"
            >
              <span className="block text-lg font-black tabular-nums text-slate-950">{counts[status]}</span>
              <span className="block truncate text-[11px] font-bold text-slate-600">{statusLabels[status]}</span>
            </button>
          ))}
        </div>

        <div className="space-y-2 sm:flex sm:items-center sm:gap-2 sm:space-y-0">
          {canViewAll ? (
            <label className="relative block flex-1">
              <span className="sr-only">Tìm nhân viên</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-sm font-bold outline-none focus:border-moss-500 focus:ring-4 focus:ring-moss-100"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm tên nhân viên"
                type="search"
                value={search}
              />
            </label>
          ) : null}
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1 sm:w-auto">
            {filters.map((item) => (
              <button
                className={`whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-extrabold transition ${filter === item.key ? "bg-white text-coal shadow-sm" : "text-slate-500"}`}
                key={item.key}
                onClick={() => setFilter(item.key)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>{canViewAll ? "Toàn bộ nhân viên" : "Lịch sử của bạn"}</span>
          <span>{visibleChecks.length}/{checks.length} bản ghi</span>
        </div>

        {error ? <StateNotice message={error} tone="error" /> : null}

        {loading && checks.length === 0 ? (
          <Spinner label="Đang tải lịch sử đối soát..." />
        ) : visibleChecks.length === 0 ? (
          <EmptyState description="Thử đổi bộ lọc hoặc từ khóa tìm kiếm." icon={Bell} title="Không có bản ghi phù hợp" />
        ) : (
          <div className="max-h-[52dvh] space-y-2 overflow-y-auto overscroll-contain pr-0.5">
            {visibleChecks.map((check) => {
              const session = check.cash_session_id ? sessionById.get(check.cash_session_id) : undefined;
              const variance = getVariance(check);
              const status = getStatus(check, session);
              const expanded = expandedId === check.id;
              const imageCount = check.evidence_urls.length + (session?.close_evidence_urls.length ?? 0);

              return (
                <article className={`overflow-hidden rounded-2xl border bg-white transition ${expanded ? "border-slate-300 shadow-sm" : "border-slate-200"}`} key={check.id}>
                  <button
                    aria-expanded={expanded}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left sm:px-4"
                    onClick={() => setExpandedId(expanded ? null : check.id)}
                    type="button"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                      <Banknote className="h-4.5 w-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-extrabold text-slate-950">{check.employee_name}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${statusStyles[status]}`}>{statusLabels[status]}</span>
                      </span>
                      <span className="mt-1 block text-xs font-semibold text-slate-500">{formatDateTime(check.checked_at ?? check.created_at)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={`block text-sm font-black tabular-nums ${variance == null ? "text-slate-400" : variance === 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {variance == null ? "—" : variance === 0 ? "Khớp" : formatCurrency(variance)}
                      </span>
                      {imageCount ? <span className="mt-1 flex items-center justify-end gap-1 text-[10px] font-bold text-slate-400"><ImageIcon className="h-3 w-3" /> {imageCount}</span> : null}
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${expanded ? "rotate-180" : ""}`} />
                  </button>

                  {expanded ? (
                    <div className="space-y-4 border-t border-slate-100 bg-slate-50/70 px-3 py-3 sm:px-4 sm:py-4">
                      <section>
                        <div className="mb-2 flex items-center justify-between">
                          <h4 className="text-xs font-black uppercase tracking-wide text-slate-600">Đối soát đầu ca</h4>
                          {variance != null && variance !== 0 ? <span className="text-xs font-black tabular-nums text-red-700">Lệch {formatCurrency(variance)}</span> : null}
                        </div>
                        <dl className="grid grid-cols-2 gap-2">
                          <MoneyItem label="Tiền hệ thống" value={Number(check.expected_cash)} />
                          <MoneyItem label="Tiền thực đếm" value={check.actual_cash == null ? null : Number(check.actual_cash)} />
                        </dl>
                      </section>

                      {session ? (
                        <section>
                          <div className="mb-2 flex items-center justify-between">
                            <h4 className="text-xs font-black uppercase tracking-wide text-slate-600">Chốt ca</h4>
                            <span className={`text-[10px] font-black ${session.status === "closed" ? "text-slate-600" : "text-amber-700"}`}>{session.status === "closed" ? "Đã chốt" : "Đang mở"}</span>
                          </div>
                          <dl className="grid grid-cols-2 gap-2">
                            <MoneyItem label="Tiền hệ thống" value={Number(session.expected_cash)} />
                            <MoneyItem label="Tiền thực đếm" value={session.counted_cash == null ? null : Number(session.counted_cash)} />
                          </dl>
                        </section>
                      ) : null}

                      <div className="space-y-3">
                        <EvidenceGallery label="Ảnh lệch đầu ca" urls={check.evidence_urls} />
                        <EvidenceGallery label="Ảnh lệch khi chốt ca" urls={session?.close_evidence_urls} />
                      </div>
                      {canUpdate || canDelete ? (
                        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                          {canUpdate ? (
                            <Button onClick={() => openEdit(check)} variant="secondary">
                              <Edit3 className="h-4 w-4" /> Sửa
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button onClick={() => void removeCheck(check)} variant="danger">
                              <Trash2 className="h-4 w-4" /> Xóa
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button disabled={saving} onClick={() => setEditingCheck(null)} variant="secondary">Hủy</Button>
            <Button isLoading={saving} onClick={() => void saveEdit()}>Lưu thay đổi</Button>
          </div>
        }
        onClose={() => { if (!saving) setEditingCheck(null); }}
        open={Boolean(editingCheck)}
        size="sm"
        title="Sửa đối soát"
      >
        {editingCheck ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold text-slate-500">Tiền hệ thống</p>
              <p className="mt-1 text-lg font-black tabular-nums">{formatCurrency(Number(editingCheck.expected_cash))}</p>
            </div>
            <Input
              inputMode="numeric"
              label="Tiền thực đếm"
              onChange={(event) => setEditActualCash(normalizeIntegerInput(event.target.value))}
              value={formatIntegerInput(editActualCash)}
            />
            {Number(editActualCash) !== Number(editingCheck.expected_cash) ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                  <span>Ảnh bằng chứng</span>
                  <span>{editingCheck.evidence_urls.length + editFiles.length}/5 ảnh</span>
                </div>
                <EvidenceGallery label="Ảnh hiện có" urls={editingCheck.evidence_urls} />
                {editingCheck.evidence_urls.length + editFiles.length < 5 ? (
                  <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-extrabold text-slate-700 hover:bg-slate-50">
                    Thêm ảnh
                    <input
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="sr-only"
                      disabled={saving}
                      multiple
                      onChange={(event) => {
                        const remaining = 5 - editingCheck.evidence_urls.length;
                        setEditFiles(Array.from(event.target.files ?? []).slice(0, remaining));
                        event.target.value = "";
                      }}
                      type="file"
                    />
                  </label>
                ) : null}
                {editFiles.length ? <p className="text-xs font-semibold text-slate-500">Đã chọn thêm {editFiles.length} ảnh mới.</p> : null}
              </div>
            ) : null}
            {editError ? <StateNotice message={editError} tone="error" /> : null}
          </div>
        ) : null}
      </Modal>
    </Modal>
  );
}
