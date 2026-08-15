import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileCheck2,
  Image as ImageIcon,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { Modal } from "../components/ui/Modal";
import { PageContainer, SearchInput } from "../components/ui/Page";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { useActionNotice } from "../contexts/ActionNoticeContext";
import { formatCurrency, formatDateTime } from "../lib/format";
import { getErrorMessage } from "../lib/errors";
import { formatProductDate } from "../lib/productDisplay";
import { printSavedReceipt } from "../lib/receipt";
import type { ReceiptPromotion } from "../lib/receipt";
import {
  cancelOrder,
  deleteOrders,
  fetchOrderPromotionDetails,
  fetchOrders,
  recordOrderPrint,
  restoreCancelledOrders,
  type OrderWithItems,
} from "../services/orders";

type InvoiceItem = {
  id: string;
  image_url?: string | null;
  product_id: string;
  batch_id: string | null;
  import_date: string | null;
  expiry_date: string | null;
  product_name: string;
  reward_points_cost: number;
  sku?: string | null;
  variant_key: string | null;
  variant_label: string | null;
  variant_values: Record<string, string | string[]> | null;
  variant_source_values: Record<string, string>[] | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
};

type Invoice = Omit<OrderWithItems, "order_items"> & {
  customers?: { address: string | null; name: string; phone: string | null } | null;
  order_items?: InvoiceItem[] | null;
  promotions?: ReceiptPromotion[];
};

function getPaymentLabel(method: string) {
  return method === "transfer" ? "Chuyển khoản" : "Tiền mặt";
}

function formatOrderTime(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");

  return `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(date.getDate())}-${pad(
    date.getMonth() + 1
  )}-${date.getFullYear()}`;
}

export function OrdersPage() {
  const { canAccess } = useAuth();
  const { confirmAction, promptAction, showSuccess } = useActionNotice();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeList, setActiveList] = useState<"paid" | "cancelled" | "deleted">("paid");
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Invoice[]>([]);
  const [printing, setPrinting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [datePreset, setDatePreset] = useState<"today" | "week" | "month" | null>(null);
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Invoice | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [selectedYear, setSelectedYear] = useState("");
  const [transferHistoryQuery, setTransferHistoryQuery] = useState("");
  const canCancelOrder = canAccess("orders.cancel");
  const canDeleteOrders = canAccess("orders.delete");
  const canSelectOrders =
    (activeList === "paid" && (canCancelOrder || canDeleteOrders)) ||
    (activeList === "cancelled" && (canCancelOrder || canDeleteOrders));
  const transferHistoryOpen =
    new URLSearchParams(location.search).get("transfer-history") === "1" ||
    new URLSearchParams(location.search).get("transfer-images") === "1";

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOrders();
      setOrders(data as Invoice[]);
    } catch (requestError) {
      setErrorNotice({
        message:
          getErrorMessage(requestError, "Không tải được danh sách hóa đơn."),
        title: "Không tải được hóa đơn",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    setSelectedOrderIds(new Set());
  }, [activeList, datePreset, query, selectedDay, selectedMonth, selectedYear]);

  const availableYears = useMemo(
    () =>
      [...new Set(orders.map((order) => new Date(order.created_at).getFullYear()))].sort(
        (firstYear, secondYear) => secondYear - firstYear
      ),
    [orders]
  );
  const availableDays = useMemo(() => {
    if (!selectedYear || !selectedMonth) {
      return [];
    }

    const daysInMonth = new Date(Number(selectedYear), Number(selectedMonth), 0).getDate();
    return Array.from({ length: daysInMonth }, (_, index) => index + 1);
  }, [selectedMonth, selectedYear]);

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return orders.filter((order) => {
      if (activeList === "deleted" ? !order.deleted_at : order.deleted_at || order.status !== activeList) {
        return false;
      }

      const createdAt = new Date(order.created_at);

      if (datePreset) {
        const today = new Date();
        const orderDay = new Date(createdAt);
        today.setHours(0, 0, 0, 0);
        orderDay.setHours(0, 0, 0, 0);

        if (datePreset === "today" && orderDay.getTime() !== today.getTime()) {
          return false;
        }

        if (datePreset === "week") {
          const startOfWeek = new Date(today);
          const weekday = startOfWeek.getDay() || 7;
          startOfWeek.setDate(startOfWeek.getDate() - weekday + 1);
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(endOfWeek.getDate() + 7);
          if (orderDay < startOfWeek || orderDay >= endOfWeek) return false;
        }

        if (
          datePreset === "month" &&
          (orderDay.getFullYear() !== today.getFullYear() ||
            orderDay.getMonth() !== today.getMonth())
        ) {
          return false;
        }
      }

      if (selectedYear && createdAt.getFullYear() !== Number(selectedYear)) {
        return false;
      }

      if (selectedMonth && createdAt.getMonth() + 1 !== Number(selectedMonth)) {
        return false;
      }

      if (selectedDay && createdAt.getDate() !== Number(selectedDay)) {
        return false;
      }

      return (
        !normalizedQuery ||
        [order.code, order.customers?.name, order.customers?.phone]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery))
      );
    });
  }, [activeList, datePreset, orders, query, selectedDay, selectedMonth, selectedYear]);
  const paidCount = orders.filter((order) => order.status === "paid").length;
  const cancelledCount = orders.filter((order) => order.status === "cancelled" && !order.deleted_at).length;
  const deletedCount = orders.filter((order) => Boolean(order.deleted_at)).length;
  const filteredTotal = filteredOrders.reduce((sum, order) => sum + order.total, 0);
  const hasDateFilter = Boolean(datePreset || selectedYear || selectedMonth || selectedDay);
  const transferHistoryOrders = useMemo(() => {
    const normalizedQuery = transferHistoryQuery.trim().toLowerCase();

    return orders.filter((order) => {
      if (
        order.deleted_at ||
        order.payment_method !== "transfer" ||
        (!order.payment_proof_url && !order.payment_proof_note?.trim())
      ) {
        return false;
      }

      return (
        !normalizedQuery ||
        [order.code, order.customers?.name, order.customers?.phone, order.payment_proof_note]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery))
      );
    });
  }, [orders, transferHistoryQuery]);
  const allFilteredSelected = filteredOrders.length > 0 && filteredOrders.every((order) => selectedOrderIds.has(order.id));

  function closeTransferHistory() {
    const nextParams = new URLSearchParams(location.search);
    nextParams.delete("transfer-images");
    nextParams.delete("transfer-history");
    setTransferHistoryQuery("");
    void navigate(
      nextParams.size > 0 ? `${location.pathname}?${nextParams.toString()}` : location.pathname,
      { replace: true }
    );
  }

  function toggleOrderSelection(orderId: string) {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) filteredOrders.forEach((order) => next.delete(order.id));
      else filteredOrders.forEach((order) => next.add(order.id));
      return next;
    });
  }

  function clearFilters() {
    setQuery("");
    setSelectedYear("");
    setSelectedMonth("");
    setSelectedDay("");
    setDatePreset(null);
  }

  function applyDatePreset(preset: "today" | "week" | "month") {
    setDatePreset(preset);
    setSelectedYear("");
    setSelectedMonth("");
    setSelectedDay("");
  }

  async function handleDeleteOrders() {
    if (!canDeleteOrders || deleting || selectedOrderIds.size === 0) return;
    const selected = orders.filter((order) => selectedOrderIds.has(order.id));
    const paidSelected = selected.filter((order) => order.status === "paid").length;
    const stockNotice = paidSelected > 0 ? ` ${paidSelected} hóa đơn thành công sẽ được hoàn hàng vào kho.` : "";
    const deleteReason = await promptAction({
      confirmLabel: "Xóa hóa đơn",
      inputLabel: "Lý do xóa",
      message: `Chuyển ${selected.length} hóa đơn đã chọn vào mục Đã xóa?${stockNotice}`,
      placeholder: "Nhập lý do để lưu nhật ký kiểm toán",
      title: "Xóa hóa đơn",
      tone: "danger",
    });
    if (deleteReason === null) return;
    if (!deleteReason) {
      setErrorNotice({ message: "Cần nhập lý do trước khi xóa hóa đơn.", title: "Thiếu lý do xóa" });
      return;
    }

    setDeleting(true);
    try {
      await deleteOrders(selected.map((order) => order.id), deleteReason);
      if (selectedOrder && selectedOrderIds.has(selectedOrder.id)) setSelectedOrder(null);
      setSelectedOrderIds(new Set());
      setActiveList("deleted");
      await loadOrders();
      showSuccess(`Đã chuyển ${selected.length} hóa đơn vào mục Đã xóa.`);
    } catch (requestError) {
      setErrorNotice({ message: getErrorMessage(requestError, "Không xóa được hóa đơn."), title: "Xóa hóa đơn thất bại" });
    } finally {
      setDeleting(false);
    }
  }

  async function handleRestoreOrders() {
    if (!canCancelOrder || restoring || selectedOrderIds.size === 0) return;
    const selected = orders.filter(
      (order) => selectedOrderIds.has(order.id) && order.status === "cancelled" && !order.deleted_at
    );
    if (selected.length === 0) return;
    if (!await confirmAction({
      confirmLabel: "Chuyển thành công",
      message: `Chuyển ${selected.length} hóa đơn đã hủy về trạng thái Thành công? Tồn kho và điểm khách hàng sẽ được cập nhật lại.`,
      title: "Chuyển trạng thái hóa đơn",
      tone: "success",
    })) return;

    setRestoring(true);
    try {
      await restoreCancelledOrders(selected.map((order) => order.id));
      setSelectedOrderIds(new Set());
      setActiveList("paid");
      await loadOrders();
      showSuccess(`Đã chuyển ${selected.length} hóa đơn về Thành công.`);
    } catch (requestError) {
      setErrorNotice({
        message: getErrorMessage(requestError, "Không khôi phục được hóa đơn. Hãy kiểm tra lại tồn kho."),
        title: "Khôi phục hóa đơn thất bại",
      });
    } finally {
      setRestoring(false);
    }
  }

  async function handleCancelOrder() {
    if (!selectedOrder || selectedOrder.status !== "paid" || !canCancelOrder || cancelling) {
      return;
    }

    const reason = await promptAction({
      confirmLabel: "Hủy hóa đơn",
      inputLabel: "Lý do hủy",
      message: `Hủy hóa đơn ${selectedOrder.code}? Số lượng sản phẩm sẽ được hoàn lại vào kho.`,
      placeholder: "Nhập lý do để lưu nhật ký kiểm toán",
      title: "Xác nhận hủy hóa đơn",
      tone: "danger",
    });
    if (reason === null) return;

    setCancelling(true);
    try {
      await cancelOrder(selectedOrder.id, reason);
      setSelectedOrder(null);
      setActiveList("cancelled");
      await loadOrders();
      showSuccess("Đã hủy hóa đơn và hoàn lại tồn kho.");
    } catch (requestError) {
      setErrorNotice({
        message: getErrorMessage(requestError, "Không hủy được hóa đơn."),
        title: "Hủy hóa đơn thất bại",
      });
    } finally {
      setCancelling(false);
    }
  }

  async function handleCancelSelectedOrders() {
    if (!canCancelOrder || cancelling || selectedOrderIds.size === 0) return;
    const selected = orders.filter(
      (order) => selectedOrderIds.has(order.id) && order.status === "paid" && !order.deleted_at
    );
    if (selected.length === 0) return;

    const reason = await promptAction({
      confirmLabel: "Hủy hóa đơn",
      inputLabel: "Lý do hủy",
      message: `Hủy ${selected.length} hóa đơn đã chọn. Sản phẩm sẽ được hoàn lại vào kho.`,
      placeholder: "Nhập lý do để lưu nhật ký kiểm toán",
      title: "Xác nhận hủy hóa đơn",
      tone: "danger",
    });
    if (reason === null) return;
    if (!reason) {
      setErrorNotice({ message: "Cần nhập lý do trước khi hủy hóa đơn.", title: "Thiếu lý do hủy" });
      return;
    }
    setCancelling(true);
    try {
      await Promise.all(selected.map((order) => cancelOrder(order.id, reason)));
      setSelectedOrderIds(new Set());
      setActiveList("cancelled");
      await loadOrders();
      showSuccess(`Đã hủy ${selected.length} hóa đơn và hoàn lại tồn kho.`);
    } catch (requestError) {
      await loadOrders();
      setSelectedOrderIds(new Set());
      setErrorNotice({
        message: getErrorMessage(requestError, "Không hủy được các hóa đơn đã chọn."),
        title: "Hủy hóa đơn thất bại",
      });
    } finally {
      setCancelling(false);
    }
  }

  async function handlePrintOrder() {
    if (!selectedOrder || printing) {
      return;
    }

    setPrinting(true);
    try {
      const [updatedOrder, promotions] = await Promise.all([
        recordOrderPrint(selectedOrder.id),
        fetchOrderPromotionDetails(selectedOrder.id),
      ]);
      const nextOrder = { ...selectedOrder, print_count: updatedOrder.print_count };

      setSelectedOrder(nextOrder);
      setOrders((current) =>
        current.map((order) => (order.id === nextOrder.id ? nextOrder : order))
      );
      printSavedReceipt({
        customer: nextOrder.customers ?? null,
        items: nextOrder.order_items ?? [],
        order: nextOrder,
        promotions,
      });
    } catch (requestError) {
      setErrorNotice({
        message: getErrorMessage(requestError, "Không in lại được hóa đơn."),
        title: "In hóa đơn thất bại",
      });
    } finally {
      setPrinting(false);
    }
  }

  return (
    <PageContainer className="pb-28">
      <ConfigNotice />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-slate-900 sm:text-base">
              {activeList === "paid" ? "Hóa đơn thành công" : activeList === "cancelled" ? "Hóa đơn đã hủy" : "Hóa đơn đã xóa"}
            </h3>
            {query || hasDateFilter ? <p className="mt-0.5 truncate text-xs font-semibold text-moss-700">Đang áp dụng bộ lọc tìm kiếm</p> : null}
          </div>
          {!loading ? (
            <p className="shrink-0 text-right text-xs font-semibold text-slate-500">
              {filteredOrders.length} hóa đơn
              {activeList === "paid" && filteredOrders.length > 0 ? <span className="ml-2 font-extrabold text-slate-800">· {formatCurrency(filteredTotal)}</span> : null}
            </p>
          ) : null}
        </div>

      {loading ? (
        <div className="p-12">
          <Spinner label="Đang tải hóa đơn..." />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="p-4 sm:p-6">
          <EmptyState
            description={query || hasDateFilter ? "Thử thay đổi từ khóa hoặc xóa bộ lọc thời gian." : activeList === "paid" ? "Hóa đơn sẽ xuất hiện tại đây sau khi thanh toán thành công." : activeList === "cancelled" ? "Các hóa đơn bị hủy sẽ xuất hiện tại đây." : "Các hóa đơn đã xóa sẽ xuất hiện tại đây và có thể khôi phục."}
            icon={ReceiptText}
            title={query || hasDateFilter ? "Không tìm thấy hóa đơn phù hợp" : activeList === "paid" ? "Chưa có hóa đơn thành công" : activeList === "cancelled" ? "Chưa có hóa đơn đã hủy" : "Chưa có hóa đơn đã xóa"}
          />
        </div>
      ) : (
          <>
          <div className="divide-y divide-slate-100 md:hidden">
            {filteredOrders.map((order) => (
              <div className="flex items-stretch" key={order.id}>
                {canSelectOrders ? (
                  <label className="flex w-11 shrink-0 items-center justify-center" onClick={(event) => event.stopPropagation()}>
                    <input aria-label={`Chọn hóa đơn ${order.code}`} checked={selectedOrderIds.has(order.id)} className="h-5 w-5 rounded border-slate-300 text-moss-700 focus:ring-moss-500" onChange={() => toggleOrderSelection(order.id)} type="checkbox" />
                  </label>
                ) : null}
                <button className="min-w-0 flex-1 px-3 py-3.5 text-left transition active:bg-moss-50" onClick={() => setSelectedOrder(order)} type="button">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-slate-950">{order.customers?.name ?? "Khách lẻ"}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500">{order.code} · {formatOrderTime(order.created_at)}</p>
                    </div>
                    <p className={`shrink-0 text-sm font-black tabular-nums ${order.deleted_at ? "text-slate-400 line-through" : order.status === "paid" ? "text-moss-800" : "text-slate-500 line-through"}`}>{formatCurrency(order.total)}</p>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${order.payment_method === "transfer" ? "text-sky-700" : "text-slate-500"}`}>
                      {order.payment_method === "transfer" ? <CreditCard className="h-3.5 w-3.5" /> : <Banknote className="h-3.5 w-3.5" />}
                      {getPaymentLabel(order.payment_method)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                </button>
              </div>
            ))}
          </div>
          <div className="hidden max-h-[58dvh] overflow-auto overscroll-contain md:block">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  {canSelectOrders ? <th className="w-12 px-3 py-3 text-center"><input aria-label="Chọn tất cả hóa đơn đang hiển thị" checked={allFilteredSelected} className="h-5 w-5 rounded border-slate-300 text-moss-700 focus:ring-moss-500" onChange={toggleAllFiltered} type="checkbox" /></th> : null}
                  <th className="px-4 py-3">Hóa đơn</th>
                  <th className="px-4 py-3">Khách hàng</th>
                  <th className="px-4 py-3">Thời gian</th>
                  <th className="px-4 py-3">Thanh toán</th>
                  <th className="px-4 py-3 text-right">Tổng tiền</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((order) => (
                  <tr
                    className="cursor-pointer transition hover:bg-moss-50/60"
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    tabIndex={0}
                  >
                    {canSelectOrders ? (
                      <td className="px-3 py-3 text-center" onClick={(event) => event.stopPropagation()}>
                        <input
                          aria-label={`Chọn hóa đơn ${order.code}`}
                          checked={selectedOrderIds.has(order.id)}
                          className="h-5 w-5 rounded border-slate-300 text-moss-700 focus:ring-moss-500"
                          onChange={() => toggleOrderSelection(order.id)}
                          type="checkbox"
                        />
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-extrabold text-slate-900">{order.code}</td>
                    <td className="max-w-52 px-4 py-3">
                      <span className="block truncate text-sm font-bold text-slate-800">{order.customers?.name ?? "Khách lẻ"}</span>
                      {order.customers?.phone ? <span className="mt-0.5 block text-xs font-semibold text-slate-500">{order.customers.phone}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-600">{formatOrderTime(order.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${order.payment_method === "transfer" ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600"}`}>
                        {order.payment_method === "transfer" ? <CreditCard className="h-3.5 w-3.5" /> : <Banknote className="h-3.5 w-3.5" />}
                        {getPaymentLabel(order.payment_method)}
                      </span>
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-black tabular-nums ${order.deleted_at ? "text-slate-400 line-through" : order.status === "paid" ? "text-moss-800" : "text-slate-500 line-through"}`}>{formatCurrency(order.total)}</td>
                    <td className="pr-3"><ChevronRight className="h-4 w-4 text-slate-400" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
      )}
      </section>

      <Modal
        bodyClassName="px-3 py-3 sm:px-6 sm:py-5"
        contentClassName="max-h-[calc(100dvh-1rem)] sm:max-h-[90dvh]"
        footer={
          <Button onClick={closeTransferHistory} type="button" variant="secondary">
            Đóng
          </Button>
        }
        onClose={closeTransferHistory}
        open={transferHistoryOpen}
        size="wide"
        title={`Lịch sử chuyển khoản (${transferHistoryOrders.length})`}
      >
        <div className="space-y-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm font-bold text-slate-900 outline-none transition focus:border-moss-400 focus:ring-4 focus:ring-moss-100"
              onChange={(event) => setTransferHistoryQuery(event.target.value)}
              placeholder="Tìm hóa đơn, khách hàng hoặc nội dung xác nhận"
              value={transferHistoryQuery}
            />
          </label>

          {loading ? (
            <div className="grid min-h-60 place-items-center rounded-2xl bg-slate-50">
              <Spinner label="Đang tải lịch sử chuyển khoản..." />
            </div>
          ) : transferHistoryOrders.length === 0 ? (
            <div className="flex min-h-60 flex-col items-center justify-center rounded-2xl bg-slate-50 px-5 text-center">
              <ImageIcon className="h-11 w-11 text-slate-400" />
              <p className="mt-3 font-extrabold text-slate-800">Chưa có giao dịch chuyển khoản phù hợp</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Lịch sử sẽ lưu ảnh chuyển khoản hoặc nội dung xác nhận thủ công của từng hóa đơn.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {transferHistoryOrders.map((order) => (
                <button
                  className="flex w-full min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2 text-left transition hover:border-moss-300 hover:bg-moss-50/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-moss-100 sm:gap-3"
                  key={order.id}
                  onClick={() => {
                    closeTransferHistory();
                    setSelectedOrder(order);
                  }}
                  type="button"
                >
                  <div className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-sky-50 text-sky-700 sm:h-20 sm:w-24">
                    {order.payment_proof_url ? <img
                        alt={`Ảnh chuyển khoản hóa đơn ${order.code}`}
                        className="h-full w-full object-cover"
                        src={order.payment_proof_url}
                      /> : <FileCheck2 className="h-7 w-7" />}
                    <span className="absolute right-1 top-1 rounded-full bg-sky-600 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-white shadow-sm">
                      CK
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-extrabold text-slate-900 sm:text-sm">
                      {order.code}
                    </p>
                    <p className="mt-1 truncate text-[10px] font-semibold text-slate-500 sm:text-xs">
                      {order.customers?.name ?? "Khách lẻ"} · {formatOrderTime(order.created_at)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[11px] font-bold text-sky-700 sm:text-xs">
                      {order.payment_proof_note?.trim()
                        ? `Xác nhận: ${order.payment_proof_note}`
                        : "Đã lưu ảnh chuyển khoản"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black tabular-nums text-moss-800 sm:text-base">{formatCurrency(order.total)}</p>
                    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${order.status === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                      {order.status === "paid" ? "Thành công" : "Đã hủy"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        footer={
          <div className="flex w-full items-center justify-end gap-3">
            {selectedOrder && !selectedOrder.deleted_at ? (
              <Button
                isLoading={printing}
                onClick={() => void handlePrintOrder()}
                type="button"
                variant="primary"
              >
                <Printer className="h-4 w-4" />
                In lại ({selectedOrder.print_count})
              </Button>
            ) : null}
            {selectedOrder?.status === "paid" && !selectedOrder.deleted_at && canCancelOrder ? (
              <Button
                isLoading={cancelling}
                onClick={() => void handleCancelOrder()}
                type="button"
                variant="danger"
              >
                Hủy hóa đơn
              </Button>
            ) : null}
            <Button onClick={() => setSelectedOrder(null)} type="button" variant="secondary">
              Đóng
            </Button>
          </div>
        }
        onClose={() => setSelectedOrder(null)}
        open={Boolean(selectedOrder)}
        size="xl"
        title={selectedOrder ? `Hóa đơn ${selectedOrder.code}` : "Hóa đơn"}
      >
        {selectedOrder ? (
          <div className="space-y-6">
            <div className="grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-extrabold uppercase text-slate-500">Thời gian</p>
                <p className="mt-1 font-bold text-slate-900">
                  {formatDateTime(selectedOrder.created_at)}
                </p>
              </div>
              <div>
                <p className="text-xs font-extrabold uppercase text-slate-500">Khách hàng</p>
                <p className="mt-1 font-bold text-slate-900">
                  {selectedOrder.customers?.name ?? "Khách lẻ"}
                </p>
              </div>
              <div>
                <p className="text-xs font-extrabold uppercase text-slate-500">Thanh toán</p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="font-bold text-slate-900">
                    {getPaymentLabel(selectedOrder.payment_method)}
                  </p>
                  {selectedOrder.status === "paid" && selectedOrder.payment_method === "transfer" ? (
                    <span className="inline-flex h-6 items-center rounded-full bg-sky-100 px-2.5 text-[10px] font-black uppercase tracking-wide text-sky-800 ring-1 ring-sky-200">
                      CK
                    </span>
                  ) : null}
                </div>
              </div>
              <div>
                <p className="text-xs font-extrabold uppercase text-slate-500">Cần thu</p>
                <p className="mt-1 text-xl font-extrabold tabular-nums text-slate-900">
                  {formatCurrency(selectedOrder.total)}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-100">
              <div className="grid grid-cols-[minmax(0,1fr)_52px_92px] gap-2 bg-slate-50 px-3 py-3 text-xs font-extrabold text-slate-500 sm:grid-cols-[minmax(0,1fr)_80px_120px] sm:gap-3 sm:px-4 sm:text-sm">
                <span>Sản phẩm</span>
                <span className="text-center">SL</span>
                <span className="text-right">Thành tiền</span>
              </div>
              <div className="divide-y divide-slate-100">
                {(selectedOrder.order_items ?? []).map((item) => (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_52px_92px] items-start gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_80px_120px] sm:gap-3 sm:px-4"
                    key={item.id}
                  >
                    <div className="flex min-w-0 gap-3">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
                        {item.image_url ? (
                          <img alt={item.product_name} className="h-full w-full object-cover" src={item.image_url} />
                        ) : (
                          <div className="grid h-full place-items-center text-slate-300"><ImageIcon className="h-5 w-5" /></div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900">{item.product_name}</p>
                        <p className="mt-1 break-all text-xs font-bold text-slate-500">
                          SKU: {item.sku || item.variant_key || "Không có"}
                        </p>
                        {item.variant_label ? (
                          <p className="mt-1 text-xs font-extrabold text-moss-700">
                            {item.variant_label}
                          </p>
                        ) : null}
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                          {item.reward_points_cost > 0
                            ? `${item.reward_points_cost.toLocaleString("vi-VN")} điểm`
                            : formatCurrency(item.unit_price)}
                        </p>
                        {item.import_date || item.expiry_date ? (
                          <p className="mt-1 text-xs font-bold text-moss-600">
                            Nhập {formatProductDate(item.import_date)} - HSD{" "}
                            {formatProductDate(item.expiry_date)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-center font-extrabold tabular-nums text-slate-900">
                      {item.quantity}
                    </p>
                    <p className="text-right font-extrabold tabular-nums text-slate-900">
                      {formatCurrency(item.line_total)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3 text-sm font-bold text-slate-600">
                <span>Tạm tính</span>
                <span className="tabular-nums">{formatCurrency(selectedOrder.subtotal)}</span>
              </div>
              {(selectedOrder.promotions ?? []).map((promotion, index) => (
                <div
                  className="mt-2 flex items-start justify-between gap-3 text-sm text-emerald-700"
                  key={`${promotion.name}-${index}`}
                >
                  <span className="min-w-0 font-extrabold">{promotion.name}</span>
                  <strong className="shrink-0 tabular-nums">
                    -{formatCurrency(promotion.discount_amount)}
                  </strong>
                </div>
              ))}
              {selectedOrder.discount > 0 && !selectedOrder.promotions?.length ? (
                <div className="mt-2 flex items-center justify-between gap-3 text-sm text-emerald-700">
                  <span className="font-extrabold">Khuyến mãi</span>
                  <strong className="tabular-nums">-{formatCurrency(selectedOrder.discount)}</strong>
                </div>
              ) : null}
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
                <span className="font-black text-slate-900">Đã thanh toán</span>
                <strong className="text-lg font-black tabular-nums text-moss-800">
                  {formatCurrency(selectedOrder.total)}
                </strong>
              </div>
            </div>

            {selectedOrder.points_redeemed > 0 || selectedOrder.points_earned > 0 ? (
              <div className="grid gap-3 rounded-2xl bg-amber-50 p-4 sm:grid-cols-2">
                <p className="font-bold text-amber-900">Điểm đã dùng: {selectedOrder.points_redeemed.toLocaleString("vi-VN")}</p>
                <p className="font-bold text-emerald-800">Điểm được cộng: {selectedOrder.points_earned.toLocaleString("vi-VN")}</p>
              </div>
            ) : null}

            {selectedOrder.payment_proof_url ? (
              <div>
                <p className="mb-3 text-sm font-extrabold uppercase text-slate-500">
                  Ảnh thanh toán
                </p>
                <img
                  alt="Ảnh xác nhận thanh toán"
                  className="max-h-[60vh] w-full rounded-2xl bg-slate-50 object-contain"
                  src={selectedOrder.payment_proof_url}
                />
              </div>
            ) : null}
            {selectedOrder.payment_proof_note ? (
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-sm font-extrabold uppercase text-slate-500">
                  Xác nhận thanh toán
                </p>
                <p className="mt-2 whitespace-pre-line font-bold text-slate-900">
                  {selectedOrder.payment_proof_note}
                </p>
              </div>
            ) : null}
            {selectedOrder.status === "cancelled" && selectedOrder.cancel_reason ? (
              <div className="rounded-2xl bg-red-50 px-4 py-3">
                <p className="text-sm font-extrabold uppercase text-red-700">Lý do hủy</p>
                <p className="mt-2 whitespace-pre-line font-bold text-red-950">
                  {selectedOrder.cancel_reason}
                </p>
              </div>
            ) : null}
            {selectedOrder.deleted_at ? (
              <div className="rounded-2xl bg-slate-100 px-4 py-3">
                <p className="text-sm font-extrabold uppercase text-slate-600">Đã xóa</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{formatDateTime(selectedOrder.deleted_at)}</p>
                {selectedOrder.delete_reason ? (
                  <p className="mt-2 whitespace-pre-line text-sm font-semibold text-slate-700">{selectedOrder.delete_reason}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
      <Modal
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <Button disabled={!query && !hasDateFilter} onClick={clearFilters} type="button" variant="ghost">
              <RotateCcw className="h-4 w-4" />
              Xóa bộ lọc
            </Button>
            <Button onClick={() => setSearchOpen(false)} type="button" variant="primary">
              Xem {filteredOrders.length} hóa đơn
            </Button>
          </div>
        }
        onClose={() => setSearchOpen(false)}
        open={searchOpen}
        size="md"
        title="Tìm kiếm hóa đơn"
      >
        <div className="space-y-5">
          <SearchInput
            onChange={setQuery}
            placeholder="Mã hóa đơn, tên hoặc số điện thoại"
            value={query}
          />

          <div>
            <p className="mb-2.5 text-xs font-extrabold uppercase tracking-wide text-slate-500">Thời gian nhanh</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                ["today", "Hôm nay"],
                ["week", "Tuần này"],
                ["month", "Tháng này"],
              ] as const).map(([value, label]) => (
                <button
                  aria-pressed={datePreset === value}
                  className={`h-11 rounded-xl border px-2 text-sm font-extrabold transition ${datePreset === value ? "border-moss-700 bg-moss-700 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-moss-300 hover:bg-moss-50"}`}
                  key={value}
                  onClick={() => applyDatePreset(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2.5 flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-200" />
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Hoặc chọn ngày</p>
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <select
                aria-label="Lọc theo năm"
                className="h-11 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-moss-500 focus:bg-white focus:ring-4 focus:ring-moss-100"
                onChange={(event) => {
                  setDatePreset(null);
                  setSelectedYear(event.target.value);
                  setSelectedMonth("");
                  setSelectedDay("");
                }}
                value={selectedYear}
              >
                <option value="">Năm</option>
                {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
              <select
                aria-label="Lọc theo tháng"
                className="h-11 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none transition disabled:cursor-not-allowed disabled:text-slate-400 focus:border-moss-500 focus:bg-white focus:ring-4 focus:ring-moss-100"
                disabled={!selectedYear}
                onChange={(event) => {
                  setDatePreset(null);
                  setSelectedMonth(event.target.value);
                  setSelectedDay("");
                }}
                value={selectedMonth}
              >
                <option value="">Tháng</option>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{month}</option>)}
              </select>
              <select
                aria-label="Lọc theo ngày"
                className="h-11 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none transition disabled:cursor-not-allowed disabled:text-slate-400 focus:border-moss-500 focus:bg-white focus:ring-4 focus:ring-moss-100"
                disabled={!selectedMonth}
                onChange={(event) => {
                  setDatePreset(null);
                  setSelectedDay(event.target.value);
                }}
                value={selectedDay}
              >
                <option value="">Ngày</option>
                {availableDays.map((day) => <option key={day} value={day}>{day}</option>)}
              </select>
            </div>
          </div>
        </div>
      </Modal>

      {selectedOrderIds.size === 0 ? (
        <nav aria-label="Bộ lọc hóa đơn" className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.65rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_32px_rgba(15,23,42,0.10)] backdrop-blur-xl lg:left-72">
          <div className="mx-auto grid max-w-xl grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1.5">
            <button
              aria-current={activeList === "paid" ? "page" : undefined}
              className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-extrabold transition sm:text-sm ${activeList === "paid" ? "bg-white text-moss-800 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`}
              onClick={() => setActiveList("paid")}
              type="button"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="truncate">Thành công</span>
              <span className="hidden tabular-nums sm:inline">{paidCount}</span>
            </button>
            <button
              aria-current={activeList === "cancelled" ? "page" : undefined}
              className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-extrabold transition sm:text-sm ${activeList === "cancelled" ? "bg-white text-red-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`}
              onClick={() => setActiveList("cancelled")}
              type="button"
            >
              <XCircle className="h-4 w-4 shrink-0" />
              <span className="truncate">Đã hủy</span>
              <span className="hidden tabular-nums sm:inline">{cancelledCount}</span>
            </button>
            <button
              aria-current={activeList === "deleted" ? "page" : undefined}
              className={`flex min-w-0 items-center justify-center gap-1 rounded-xl px-1.5 py-2.5 text-[11px] font-extrabold transition sm:gap-1.5 sm:px-2 sm:text-sm ${activeList === "deleted" ? "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`}
              onClick={() => setActiveList("deleted")}
              type="button"
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              <span className="truncate">Đã xóa</span>
              <span className="hidden tabular-nums sm:inline">{deletedCount}</span>
            </button>
            <button
              aria-expanded={searchOpen}
              aria-haspopup="dialog"
              className={`relative flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-extrabold transition sm:text-sm ${searchOpen ? "bg-coal text-white shadow-sm" : query || hasDateFilter ? "bg-moss-700 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              onClick={() => setSearchOpen(true)}
              type="button"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span>Tìm kiếm</span>
              {query || hasDateFilter ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-300 ring-2 ring-moss-700" /> : null}
            </button>
          </div>
        </nav>
      ) : null}
      {canSelectOrders && selectedOrderIds.size > 0 ? (
        <div className={`fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-14px_36px_rgba(15,23,42,0.14)] backdrop-blur-xl lg:left-72 ${activeList === "cancelled" ? "border-moss-100" : "border-red-100"}`}>
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Đã chọn</p>
              <p className="truncate text-lg font-black text-slate-950">{selectedOrderIds.size} hóa đơn</p>
            </div>
            <button
              className="hidden h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700 sm:flex"
              disabled={deleting || restoring}
              onClick={() => setSelectedOrderIds(new Set())}
              type="button"
            >
              Bỏ chọn
            </button>
            {canDeleteOrders ? (
              <Button aria-label="Xóa hóa đơn" className="h-12 min-w-12 px-3 text-red-600 ring-red-200 hover:bg-red-50 sm:min-w-32" isLoading={deleting} onClick={() => void handleDeleteOrders()} type="button" variant="secondary">
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Xóa hóa đơn</span>
              </Button>
            ) : null}
            {activeList === "paid" && canCancelOrder ? (
              <Button className="h-12 min-w-32" isLoading={cancelling} onClick={() => void handleCancelSelectedOrders()} type="button" variant="danger">
                <XCircle className="h-4 w-4" />
                Hủy hóa đơn
              </Button>
            ) : null}
            {activeList === "cancelled" && canCancelOrder ? (
              <Button className="h-12 min-w-36 bg-moss-700 text-white hover:bg-moss-800" isLoading={restoring} onClick={() => void handleRestoreOrders()} type="button">
                <CheckCircle2 className="h-4 w-4" />
                Chuyển thành công
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </PageContainer>
  );
}
