import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Landmark, RotateCcw, WalletCards } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { CashManagementHistoryModal } from "../components/cash/CashManagementHistoryModal";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { PageContainer, PageToolbar } from "../components/ui/Page";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { getErrorMessage } from "../lib/errors";
import { formatCurrency, formatIntegerInput, normalizeIntegerInput } from "../lib/format";
import { supabase } from "../lib/supabase";
import {
  fetchCashDrawerHandover,
  fetchCashDrawerSessions,
  fetchRequiresCashReconciliation,
  adjustCashDrawerBalance,
  type CashDrawerHandover,
  type CashDrawerSession,
} from "../services/cashManagement";

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
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-black tabular-nums text-slate-950 sm:text-3xl">
            {formatCurrency(value)}
          </p>
        </div>
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">{description}</p>
    </article>
  );
}

export function CashManagementPage({ embedded = false, onCashBalanceChange }: { embedded?: boolean; onCashBalanceChange?: (value: number) => void }) {
  const { canAccess } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessions, setSessions] = useState<CashDrawerSession[]>([]);
  const [handover, setHandover] = useState<CashDrawerHandover | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustCash, setAdjustCash] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [openSessionRequiresReconciliation, setOpenSessionRequiresReconciliation] = useState(false);
  const canViewHistory = canAccess("cash-management.history.view") || canAccess("cash-management.reconciliation.update") || canAccess("cash-management.reconciliation.delete");
  const historyOpen = canViewHistory && searchParams.get("history") === "1";
  const adjustRequested = searchParams.get("adjust") === "1";

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [nextSessions, nextHandover] = await Promise.all([
        fetchCashDrawerSessions(),
        fetchCashDrawerHandover(),
      ]);
      setSessions(nextSessions);
      setHandover(nextHandover);
      const nextOpenSession = nextSessions.find((session) => session.status === "open");
      setOpenSessionRequiresReconciliation(nextOpenSession ? await fetchRequiresCashReconciliation(nextOpenSession.cashier_id) : false);
    } catch (error) {
      if (!quiet) {
        setErrorNotice({
          title: "Không tải được dữ liệu quỹ",
          message: getErrorMessage(error, "Không thể tải dữ liệu tiền quỹ."),
        });
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const refresh = () => void loadData(true);
    const channel = supabase.channel("cash-orders-sync").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refresh).subscribe();
    const interval = window.setInterval(refresh, 10_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("pos-financial-sync", refresh);
    const onStorage = (event: StorageEvent) => { if (event.key === "pos-financial-sync") refresh(); };
    window.addEventListener("storage", onStorage);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener("pos-financial-sync", refresh); window.removeEventListener("storage", onStorage); void supabase.removeChannel(channel); };
  }, [loadData]);

  const activeSession = sessions.find((session) => session.status === "open");
  const cashInDrawer = Number(
    activeSession?.expected_cash ?? handover?.expected_opening_cash ?? 0
  );
  const transferAmount = useMemo(
    () => sessions.reduce((total, session) => total + Number(session.transfer_sales), 0),
    [sessions]
  );
  const revenue = cashInDrawer + transferAmount;
  const adjustmentBlocked = Boolean(activeSession && openSessionRequiresReconciliation);

  useEffect(() => {
    onCashBalanceChange?.(cashInDrawer);
  }, [cashInDrawer, onCashBalanceChange]);

  useEffect(() => {
    if (!adjustRequested) return;
    setAdjustCash(String(cashInDrawer));
    setAdjustOpen(true);
  }, [adjustRequested, cashInDrawer]);

  function closeHistory() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("history");
    setSearchParams(nextParams, { replace: true });
  }

  function closeAdjust() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("adjust");
    setSearchParams(nextParams, { replace: true });
    setAdjustOpen(false);
  }

  async function saveAdjustment() {
    if (adjustmentBlocked) {
      setErrorNotice({ title: "Chưa thể điều chỉnh quỹ", message: "Hãy chốt ca và hoàn tất đối soát két trước khi điều chỉnh hoặc reset số tiền." });
      return;
    }
    const cash = Number(adjustCash || 0);
    if (!Number.isFinite(cash) || cash < 0) return;
    setAdjustSaving(true);
    try {
      await adjustCashDrawerBalance(cash);
      await loadData(true);
      closeAdjust();
    } catch (error) {
      setErrorNotice({ title: "Không điều chỉnh được quỹ", message: getErrorMessage(error, "Không thể lưu số tiền quỹ.") });
    } finally {
      setAdjustSaving(false);
    }
  }

  if (loading) {
    if (embedded) return <div className="rounded-2xl bg-white p-6 shadow-soft"><Spinner label="Đang đồng bộ quỹ..." /></div>;
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
    <PageContainer className={embedded ? "!max-w-none !space-y-3 !px-0 !pb-0" : undefined} maxWidth="none">
      {!embedded ? <ConfigNotice /> : null}
      {!embedded ? <PageToolbar
        description="Theo dõi nhanh tiền mặt trong két và doanh thu thanh toán. Lịch sử đối soát nằm trong nút chuông trên header."
        eyebrow="Theo dõi tiền bán hàng"
        title="Quỹ & Đối soát"
      /> : null}

      {!embedded ? <section className="grid gap-3 md:grid-cols-3">
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
      </section> : null}

      <CashManagementHistoryModal onClose={closeHistory} open={historyOpen} />
      <Modal footer={<div className="grid w-full grid-cols-2 gap-2"><Button disabled={adjustSaving || adjustmentBlocked} onClick={() => setAdjustCash("0")} variant="danger"><RotateCcw className="h-4 w-4" />Đặt về 0</Button><Button disabled={adjustmentBlocked} isLoading={adjustSaving} onClick={() => void saveAdjustment()}>Lưu tiền mặt</Button></div>} onClose={closeAdjust} open={adjustOpen} size="sm" title="Điều chỉnh tiền mặt">
        <div className="space-y-4">{adjustmentBlocked && activeSession ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-5 text-amber-800">Két của {activeSession.cashier_name} đang mở và vai trò này bắt buộc đối soát. Hãy chốt ca trước khi điều chỉnh số dư.</div> : null}<Input disabled={adjustmentBlocked} inputMode="numeric" label="Tiền mặt thực tế trong két" onChange={(event) => setAdjustCash(normalizeIntegerInput(event.target.value))} value={formatIntegerInput(adjustCash)} /><div className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold leading-5 text-blue-800">Chỉ số dư tiền mặt trong két được điều chỉnh. Tiền chuyển khoản và doanh thu luôn lấy trực tiếp từ hóa đơn, không bị thay đổi tại đây.</div></div>
      </Modal>
      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </PageContainer>
  );
}
