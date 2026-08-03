import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Landmark, WalletCards } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { CashManagementHistoryModal } from "../components/cash/CashManagementHistoryModal";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { PageContainer, PageToolbar } from "../components/ui/Page";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { getErrorMessage } from "../lib/errors";
import { formatCurrency } from "../lib/format";
import {
  fetchCashDrawerHandover,
  fetchCashDrawerSessions,
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

export function CashManagementPage() {
  const { canAccess } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessions, setSessions] = useState<CashDrawerSession[]>([]);
  const [handover, setHandover] = useState<CashDrawerHandover | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const canViewHistory = canAccess("cash-management.history.view");
  const historyOpen = canViewHistory && searchParams.get("history") === "1";

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [nextSessions, nextHandover] = await Promise.all([
        fetchCashDrawerSessions(),
        fetchCashDrawerHandover(),
      ]);
      setSessions(nextSessions);
      setHandover(nextHandover);
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
    const interval = window.setInterval(() => void loadData(true), 30_000);
    return () => window.clearInterval(interval);
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

  function closeHistory() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("history");
    setSearchParams(nextParams, { replace: true });
  }

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
        description="Theo dõi nhanh tiền mặt trong két và doanh thu thanh toán. Lịch sử đối soát nằm trong nút chuông trên header."
        eyebrow="Theo dõi tiền bán hàng"
        title="Quỹ & Đối soát"
      />

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

      <CashManagementHistoryModal onClose={closeHistory} open={historyOpen} />
      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </PageContainer>
  );
}
