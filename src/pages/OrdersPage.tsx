import { useCallback, useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, Printer, ReceiptText, Search, Trash2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { Modal } from "../components/ui/Modal";
import { PageContainer, PageToolbar, SearchInput } from "../components/ui/Page";
import { Spinner } from "../components/ui/Spinner";
import { Textarea } from "../components/ui/Textarea";
import { useAuth } from "../contexts/AuthContext";
import { formatCurrency, formatDateTime } from "../lib/format";
import { getErrorMessage } from "../lib/errors";
import { formatProductDate } from "../lib/productDisplay";
import { printSavedReceipt } from "../lib/receipt";
import {
  cancelOrder,
  deleteOrders,
  fetchOrders,
  recordOrderPrint,
  type OrderWithItems,
} from "../services/orders";

type InvoiceItem = {
  id: string;
  product_id: string;
  batch_id: string | null;
  import_date: string | null;
  expiry_date: string | null;
  product_name: string;
  variant_key: string | null;
  variant_label: string | null;
  variant_values: Record<string, string | string[]> | null;
  variant_source_values: Record<string, string>[] | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
};

type Invoice = OrderWithItems & {
  customers?: { address: string | null; name: string; phone: string | null } | null;
  order_items?: InvoiceItem[] | null;
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
  const location = useLocation();
  const navigate = useNavigate();
  const [activeList, setActiveList] = useState<"paid" | "cancelled">("paid");
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Invoice[]>([]);
  const [printing, setPrinting] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Invoice | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [selectedYear, setSelectedYear] = useState("");
  const [transferImageQuery, setTransferImageQuery] = useState("");
  const canCancelOrder = canAccess("orders.cancel");
  const canDeleteOrders = canAccess("orders.delete");
  const transferImagesOpen = new URLSearchParams(location.search).get("transfer-images") === "1";

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
  }, [activeList, query, selectedDay, selectedMonth, selectedYear]);

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
      if (order.status !== activeList) {
        return false;
      }

      const createdAt = new Date(order.created_at);

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
  }, [activeList, orders, query, selectedDay, selectedMonth, selectedYear]);
  const paidCount = orders.filter((order) => order.status === "paid").length;
  const cancelledCount = orders.filter((order) => order.status === "cancelled").length;
  const transferProofOrders = useMemo(() => {
    const normalizedQuery = transferImageQuery.trim().toLowerCase();

    return orders.filter((order) => {
      if (
        order.status !== "paid" ||
        order.payment_method !== "transfer" ||
        !order.payment_proof_url
      ) {
        return false;
      }

      return (
        !normalizedQuery ||
        [order.code, order.customers?.name, order.customers?.phone]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery))
      );
    });
  }, [orders, transferImageQuery]);
  const allFilteredSelected = filteredOrders.length > 0 && filteredOrders.every((order) => selectedOrderIds.has(order.id));

  function closeTransferImages() {
    const nextParams = new URLSearchParams(location.search);
    nextParams.delete("transfer-images");
    setTransferImageQuery("");
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

  async function handleDeleteOrders() {
    if (!canDeleteOrders || deleting || selectedOrderIds.size === 0) return;
    const selected = orders.filter((order) => selectedOrderIds.has(order.id));
    const paidSelected = selected.filter((order) => order.status === "paid").length;
    const stockNotice = paidSelected > 0 ? ` ${paidSelected} hóa đơn thành công sẽ được hoàn hàng vào kho.` : "";
    if (!window.confirm(`Xóa vĩnh viễn ${selected.length} hóa đơn đã chọn?${stockNotice} Thao tác này không thể hoàn tác.`)) return;
    const deleteReason = window.prompt("Nhập lý do xóa để lưu nhật ký kiểm toán:")?.trim();
    if (!deleteReason) {
      setErrorNotice({ message: "Cần nhập lý do trước khi xóa hóa đơn.", title: "Thiếu lý do xóa" });
      return;
    }

    setDeleting(true);
    try {
      await deleteOrders(selected.map((order) => order.id), deleteReason);
      setOrders((current) => current.filter((order) => !selectedOrderIds.has(order.id)));
      if (selectedOrder && selectedOrderIds.has(selectedOrder.id)) setSelectedOrder(null);
      setSelectedOrderIds(new Set());
    } catch (requestError) {
      setErrorNotice({ message: getErrorMessage(requestError, "Không xóa được hóa đơn."), title: "Xóa hóa đơn thất bại" });
    } finally {
      setDeleting(false);
    }
  }

  async function handleCancelOrder() {
    if (!selectedOrder || selectedOrder.status !== "paid" || !canCancelOrder || cancelling) {
      return;
    }

    if (!cancelReason.trim()) {
      setErrorNotice({
        message: "Nhập lý do để lưu dấu vết kiểm toán trước khi hủy hóa đơn.",
        title: "Thiếu lý do hủy",
      });
      return;
    }

    const confirmed = window.confirm(
      `Hủy hóa đơn ${selectedOrder.code}? Số lượng sản phẩm sẽ được hoàn lại vào kho.`
    );

    if (!confirmed) {
      return;
    }

    setCancelling(true);
    try {
      await cancelOrder(selectedOrder.id, cancelReason);
      setCancelReason("");
      setSelectedOrder(null);
      setActiveList("cancelled");
      await loadOrders();
    } catch (requestError) {
      setErrorNotice({
        message: getErrorMessage(requestError, "Không hủy được hóa đơn."),
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
      const updatedOrder = await recordOrderPrint(selectedOrder.id);
      const nextOrder = { ...selectedOrder, print_count: updatedOrder.print_count };

      setSelectedOrder(nextOrder);
      setOrders((current) =>
        current.map((order) => (order.id === nextOrder.id ? nextOrder : order))
      );
      printSavedReceipt({
        customer: nextOrder.customers ?? null,
        items: nextOrder.order_items ?? [],
        order: nextOrder,
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
    <PageContainer className={selectedOrderIds.size > 0 ? "pb-28" : undefined}>
      <ConfigNotice />

      <PageToolbar
        description="Tra cứu hóa đơn, sản phẩm và chứng từ thanh toán đã lưu."
        eyebrow="Lịch sử bán hàng"
        title="Hóa đơn đã tạo"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <SearchInput
            className="sm:max-w-md sm:flex-1"
            onChange={setQuery}
            placeholder="Tìm mã hóa đơn hoặc khách hàng"
            value={query}
          />
          <div className="grid grid-cols-3 gap-2">
            <select
              aria-label="Lọc theo năm"
              className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-moss-500 focus:ring-4 focus:ring-moss-100"
              onChange={(event) => {
                setSelectedYear(event.target.value);
                setSelectedMonth("");
                setSelectedDay("");
              }}
              value={selectedYear}
            >
              <option value="">Năm</option>
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <select
              aria-label="Lọc theo tháng"
              className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition disabled:bg-slate-100 disabled:text-slate-400 focus:border-moss-500 focus:ring-4 focus:ring-moss-100"
              disabled={!selectedYear}
              onChange={(event) => {
                setSelectedMonth(event.target.value);
                setSelectedDay("");
              }}
              value={selectedMonth}
            >
              <option value="">Tháng</option>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
            <select
              aria-label="Lọc theo ngày"
              className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition disabled:bg-slate-100 disabled:text-slate-400 focus:border-moss-500 focus:ring-4 focus:ring-moss-100"
              disabled={!selectedMonth}
              onChange={(event) => setSelectedDay(event.target.value)}
              value={selectedDay}
            >
              <option value="">Ngày</option>
              {availableDays.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </div>
        </div>
      </PageToolbar>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-soft">
        <button
          className={`rounded-xl px-4 py-3 text-sm font-extrabold transition ${
            activeList === "paid"
              ? "bg-moss-700 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50"
          }`}
          onClick={() => setActiveList("paid")}
          type="button"
        >
          Hóa đơn thành công ({paidCount})
        </button>
        <button
          className={`rounded-xl px-4 py-3 text-sm font-extrabold transition ${
            activeList === "cancelled"
              ? "bg-red-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50"
          }`}
          onClick={() => setActiveList("cancelled")}
          type="button"
        >
          Hóa đơn đã hủy ({cancelledCount})
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-white p-8 shadow-soft">
          <Spinner label="Đang tải hóa đơn..." />
        </div>
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          description={
            activeList === "paid"
              ? "Hóa đơn sẽ xuất hiện tại đây sau khi thanh toán thành công."
              : "Các hóa đơn bị hủy sẽ xuất hiện tại đây."
          }
          icon={ReceiptText}
          title={activeList === "paid" ? "Chưa có hóa đơn thành công" : "Chưa có hóa đơn đã hủy"}
        />
      ) : (
          <div className="max-h-[58dvh] overflow-auto overscroll-contain rounded-2xl border border-slate-200 bg-white shadow-soft">
            <table className="w-full table-fixed border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  {canDeleteOrders ? <th className="w-12 px-3 py-3 text-center"><input aria-label="Chọn tất cả hóa đơn đang hiển thị" checked={allFilteredSelected} className="h-5 w-5 rounded border-slate-300 text-moss-700 focus:ring-moss-500" onChange={toggleAllFiltered} type="checkbox" /></th> : null}
                  <th className="w-[40%] px-3 py-3 sm:px-5">Tên khách hàng</th>
                  <th className="px-3 py-3 sm:px-5">Thời gian</th>
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
                    {canDeleteOrders ? (
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
                    <td className="px-3 py-3 text-xs font-bold text-slate-800 sm:px-5 sm:text-sm">
                      <span className="block truncate">{order.customers?.name ?? "Khách lẻ"}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs font-semibold text-slate-600 sm:px-5 sm:text-sm">
                      <div className="flex items-center gap-2">
                        <span>{formatOrderTime(order.created_at)}</span>
                        {order.status === "paid" && order.payment_method === "transfer" ? (
                          <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-sky-100 px-2.5 text-[10px] font-black uppercase tracking-wide text-sky-800 ring-1 ring-sky-200">
                            CK
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      )}

      <Modal
        bodyClassName="px-3 py-3 sm:px-6 sm:py-5"
        contentClassName="max-h-[calc(100dvh-1rem)] sm:max-h-[90dvh]"
        footer={
          <Button onClick={closeTransferImages} type="button" variant="secondary">
            Đóng
          </Button>
        }
        onClose={closeTransferImages}
        open={transferImagesOpen}
        size="wide"
        title={`Ảnh chuyển khoản (${transferProofOrders.length})`}
      >
        <div className="space-y-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm font-bold text-slate-900 outline-none transition focus:border-moss-400 focus:ring-4 focus:ring-moss-100"
              onChange={(event) => setTransferImageQuery(event.target.value)}
              placeholder="Tìm mã hóa đơn, tên hoặc số điện thoại khách"
              value={transferImageQuery}
            />
          </label>

          {transferProofOrders.length === 0 ? (
            <div className="flex min-h-60 flex-col items-center justify-center rounded-2xl bg-slate-50 px-5 text-center">
              <ImageIcon className="h-11 w-11 text-slate-400" />
              <p className="mt-3 font-extrabold text-slate-800">Không có ảnh chuyển khoản phù hợp</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Chỉ hiển thị hóa đơn thành công bằng chuyển khoản có ảnh xác nhận.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {transferProofOrders.map((order) => (
                <button
                  className="flex w-full min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2 text-left transition hover:border-moss-300 hover:bg-moss-50/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-moss-100 sm:gap-3"
                  key={order.id}
                  onClick={() => {
                    closeTransferImages();
                    setSelectedOrder(order);
                  }}
                  type="button"
                >
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:h-20 sm:w-24">
                    <img
                      alt={`Ảnh chuyển khoản hóa đơn ${order.code}`}
                      className="h-full w-full object-cover"
                      src={order.payment_proof_url!}
                    />
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
                  </div>
                  <p className="shrink-0 text-sm font-black tabular-nums text-moss-800 sm:text-base">
                    {formatCurrency(order.total)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        footer={
          <div className="flex w-full items-center justify-end gap-3">
            {selectedOrder ? (
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
            {selectedOrder?.status === "paid" && canCancelOrder ? (
              <Button
                isLoading={cancelling}
                onClick={() => void handleCancelOrder()}
                type="button"
                variant="danger"
              >
                Hủy hóa đơn
              </Button>
            ) : null}
            <Button onClick={() => { setSelectedOrder(null); setCancelReason(""); }} type="button" variant="secondary">
              Đóng
            </Button>
          </div>
        }
        onClose={() => { setSelectedOrder(null); setCancelReason(""); }}
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
              <div className="grid grid-cols-[minmax(0,1fr)_80px_120px] gap-3 bg-slate-50 px-4 py-3 text-sm font-extrabold text-slate-500">
                <span>Sản phẩm</span>
                <span className="text-center">SL</span>
                <span className="text-right">Thành tiền</span>
              </div>
              <div className="divide-y divide-slate-100">
                {(selectedOrder.order_items ?? []).map((item) => (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_80px_120px] gap-3 px-4 py-3"
                    key={item.id}
                  >
                    <div>
                      <p className="font-bold text-slate-900">{item.product_name}</p>
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
            {selectedOrder.status === "paid" && canCancelOrder ? (
              <Textarea
                label="Lý do hủy hóa đơn"
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="Bắt buộc để phục vụ kiểm toán và đối soát"
                rows={3}
                value={cancelReason}
              />
            ) : null}
            {selectedOrder.status === "cancelled" && selectedOrder.cancel_reason ? (
              <div className="rounded-2xl bg-red-50 px-4 py-3">
                <p className="text-sm font-extrabold uppercase text-red-700">Lý do hủy</p>
                <p className="mt-2 whitespace-pre-line font-bold text-red-950">
                  {selectedOrder.cancel_reason}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
      {canDeleteOrders && selectedOrderIds.size > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-red-100 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-14px_36px_rgba(15,23,42,0.14)] backdrop-blur-xl lg:left-72">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Đã chọn</p>
              <p className="truncate text-lg font-black text-slate-950">{selectedOrderIds.size} hóa đơn</p>
            </div>
            <button
              className="hidden h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700 sm:flex"
              disabled={deleting}
              onClick={() => setSelectedOrderIds(new Set())}
              type="button"
            >
              Bỏ chọn
            </button>
            <Button className="h-12 min-w-32" isLoading={deleting} onClick={() => void handleDeleteOrders()} type="button" variant="danger">
              <Trash2 className="h-4 w-4" />
              Xóa hóa đơn
            </Button>
          </div>
        </div>
      ) : null}

      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </PageContainer>
  );
}
