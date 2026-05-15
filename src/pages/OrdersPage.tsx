import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Image, ReceiptText, Search } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { formatCurrency, formatDateTime } from "../lib/format";
import { formatProductDate } from "../lib/productDisplay";
import { fetchOrders, type OrderWithItems } from "../services/orders";

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
  customers?: { name: string; phone: string | null } | null;
  order_items?: InvoiceItem[] | null;
};

function getPaymentLabel(method: string) {
  return method === "transfer" ? "Chuyen khoan" : "Tien mat";
}

export function OrdersPage() {
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Invoice[]>([]);
  const [query, setQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Invoice | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOrders();
      setOrders(data as Invoice[]);
    } catch (requestError) {
      setErrorNotice({
        message:
          requestError instanceof Error ? requestError.message : "Khong tai duoc danh sach hoa don.",
        title: "Khong tai duoc hoa don",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return orders;
    }

    return orders.filter((order) =>
      [
        order.code,
        order.customers?.name,
        order.customers?.phone,
        getPaymentLabel(order.payment_method),
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery))
    );
  }, [orders, query]);

  return (
    <div className="px-4 pb-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <ConfigNotice />

        <div className="rounded-3xl bg-white p-5 shadow-soft ring-1 ring-coal/5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold text-coal">Hoa don da tao</h2>
              <p className="mt-1 text-sm font-semibold text-coal/50">
                Luu lai hoa don, san pham va anh xac nhan chuyen khoan.
              </p>
            </div>
            <div className="relative w-full md:max-w-sm">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-coal/35" />
              <Input
                className="pl-11"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tim ma HD, khach hang..."
                value={query}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl bg-white p-8 shadow-soft">
            <Spinner label="Dang tai hoa don..." />
          </div>
        ) : filteredOrders.length === 0 ? (
          <EmptyState
            description="Sau khi thanh toan thanh cong, hoa don se nam o day."
            icon={ReceiptText}
            title="Chua co hoa don"
          />
        ) : (
          <div className="overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-coal/5">
            <div className="hidden grid-cols-[1.1fr_1fr_0.8fr_0.8fr_0.5fr] gap-4 border-b border-coal/5 px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-coal/45 lg:grid">
              <span>Hoa don</span>
              <span>Khach hang</span>
              <span>Thanh toan</span>
              <span className="text-right">Tong tien</span>
              <span />
            </div>
            <div className="divide-y divide-coal/5">
              {filteredOrders.map((order) => (
                <article
                  className="grid gap-3 px-5 py-4 lg:grid-cols-[1.1fr_1fr_0.8fr_0.8fr_0.5fr] lg:items-center"
                  key={order.id}
                >
                  <div>
                    <p className="font-extrabold text-coal">{order.code}</p>
                    <p className="mt-1 text-sm font-semibold text-coal/45">
                      {formatDateTime(order.created_at)}
                    </p>
                  </div>
                  <div>
                    <p className="font-bold text-coal">
                      {order.customers?.name ?? "Khach le"}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-coal/45">
                      {order.customers?.phone ?? "Khong co SDT"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={order.payment_method === "transfer" ? "neutral" : "green"}>
                      {getPaymentLabel(order.payment_method)}
                    </Badge>
                    {order.payment_proof_url ? (
                      <Badge className="gap-1" tone="amber">
                        <Image className="h-3.5 w-3.5" />
                        Anh CK
                      </Badge>
                    ) : null}
                    {order.payment_proof_note ? <Badge tone="amber">PC</Badge> : null}
                  </div>
                  <p className="text-left text-xl font-extrabold tabular-nums text-coal lg:text-right">
                    {formatCurrency(order.total)}
                  </p>
                  <Button onClick={() => setSelectedOrder(order)} variant="secondary">
                    <Eye className="h-4 w-4" />
                    Xem
                  </Button>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal
        footer={
          <Button onClick={() => setSelectedOrder(null)} type="button" variant="secondary">
            Dong
          </Button>
        }
        onClose={() => setSelectedOrder(null)}
        open={Boolean(selectedOrder)}
        size="xl"
        title={selectedOrder ? `Hoa don ${selectedOrder.code}` : "Hoa don"}
      >
        {selectedOrder ? (
          <div className="space-y-6">
            <div className="grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-extrabold uppercase text-slate-500">Thoi gian</p>
                <p className="mt-1 font-bold text-slate-900">
                  {formatDateTime(selectedOrder.created_at)}
                </p>
              </div>
              <div>
                <p className="text-xs font-extrabold uppercase text-slate-500">Khach hang</p>
                <p className="mt-1 font-bold text-slate-900">
                  {selectedOrder.customers?.name ?? "Khach le"}
                </p>
              </div>
              <div>
                <p className="text-xs font-extrabold uppercase text-slate-500">Thanh toan</p>
                <p className="mt-1 font-bold text-slate-900">
                  {getPaymentLabel(selectedOrder.payment_method)}
                </p>
              </div>
              <div>
                <p className="text-xs font-extrabold uppercase text-slate-500">Can thu</p>
                <p className="mt-1 text-xl font-extrabold tabular-nums text-slate-900">
                  {formatCurrency(selectedOrder.total)}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-100">
              <div className="grid grid-cols-[minmax(0,1fr)_80px_120px] gap-3 bg-slate-50 px-4 py-3 text-sm font-extrabold text-slate-500">
                <span>San pham</span>
                <span className="text-center">SL</span>
                <span className="text-right">Tien</span>
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
                        <p className="mt-1 text-xs font-bold text-blue-600">
                          Nhap {formatProductDate(item.import_date)} - HSD{" "}
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
                  Anh thanh toan
                </p>
                <img
                  alt="Anh xac nhan thanh toan"
                  className="max-h-[60vh] w-full rounded-2xl bg-slate-50 object-contain"
                  src={selectedOrder.payment_proof_url}
                />
              </div>
            ) : null}
            {selectedOrder.payment_proof_note ? (
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-sm font-extrabold uppercase text-slate-500">
                  Xac nhan thanh toan
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
    </div>
  );
}
