import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, ReceiptText } from "lucide-react";
import { Button } from "../components/ui/Button";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { Modal } from "../components/ui/Modal";
import { PageContainer, PageToolbar, SearchInput } from "../components/ui/Page";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { formatCurrency, formatDateTime } from "../lib/format";
import { getErrorMessage } from "../lib/errors";
import { formatProductDate } from "../lib/productDisplay";
import { printSavedReceipt } from "../lib/receipt";
import {
  cancelOrder,
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
  const [activeList, setActiveList] = useState<"paid" | "cancelled">("paid");
  const [cancelling, setCancelling] = useState(false);
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Invoice[]>([]);
  const [printing, setPrinting] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Invoice | null>(null);
  const [selectedYear, setSelectedYear] = useState("");
  const canCancelOrder = canAccess("orders.cancel");

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

  async function handleCancelOrder() {
    if (!selectedOrder || selectedOrder.status !== "paid" || !canCancelOrder || cancelling) {
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
      await cancelOrder(selectedOrder.id);
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
    <PageContainer>
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
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
            <table className="w-full table-fixed border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  <th className="w-[42%] px-5 py-3">Tên khách hàng</th>
                  <th className="w-[58%] px-5 py-3">Thời gian</th>
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
                    <td className="truncate px-5 py-3 text-sm font-bold text-slate-800">
                      {order.customers?.name ?? "Khách lẻ"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-sm font-semibold text-slate-600">
                      {formatOrderTime(order.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      )}

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
                <p className="mt-1 font-bold text-slate-900">
                  {getPaymentLabel(selectedOrder.payment_method)}
                </p>
              </div>
              <div>
                <p className="text-xs font-extrabold uppercase text-slate-500">Cần thử</p>
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
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {formatCurrency(item.unit_price)}
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
          </div>
        ) : null}
      </Modal>

      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </PageContainer>
  );
}
