import { FormEvent, useEffect, useState } from "react";
import {
  ChevronRight,
  Edit3,
  Mail,
  MapPin,
  Package,
  Phone,
  ReceiptText,
  Search,
  StickyNote,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { PageContainer } from "../components/ui/Page";
import { Spinner } from "../components/ui/Spinner";
import { Textarea } from "../components/ui/Textarea";
import { useAuth } from "../contexts/AuthContext";
import { useActionNotice } from "../contexts/ActionNoticeContext";
import { getErrorMessage } from "../lib/errors";
import { formatCurrency, formatIntegerInput, normalizeIntegerInput } from "../lib/format";
import { normalizeNullableText } from "../lib/text";
import {
  createCustomer,
  deleteCustomer,
  fetchCustomerPurchaseHistory,
  fetchCustomers,
  updateCustomer,
  type CustomerInput,
  type CustomerPurchaseHistoryOrder,
} from "../services/customers";
import type { Customer } from "../types";

type CustomerFormState = {
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  points: string;
};

const emptyForm: CustomerFormState = {
  address: "",
  email: "",
  name: "",
  note: "",
  phone: "",
  points: "0",
};

function formatCustomerDate(value: string, includeTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không rõ";
  return new Intl.DateTimeFormat(
    "vi-VN",
    includeTime ? { dateStyle: "short", timeStyle: "short" } : undefined,
  ).format(date);
}

function customerToForm(customer?: Customer | null): CustomerFormState {
  if (!customer) {
    return emptyForm;
  }

  return {
    address: customer.address ?? "",
    email: customer.email ?? "",
    name: customer.name,
    note: customer.note ?? "",
    phone: customer.phone ?? "",
    points: String(customer.points ?? 0),
  };
}

type CustomerFormProps = {
  customer?: Customer | null;
  formId: string;
  onSubmit: (input: CustomerInput) => Promise<void>;
};

function CustomerForm({ customer, formId, onSubmit }: CustomerFormProps) {
  const [form, setForm] = useState<CustomerFormState>(() => customerToForm(customer));
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(customerToForm(customer));
    setError("");
  }, [customer]);

  function updateField(field: keyof CustomerFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const name = form.name.trim();
    const points = Number(form.points);
    if (!name) {
      setError("Tên khách hàng là bắt buộc.");
      return;
    }

    if (!Number.isInteger(points) || points < 0) {
      setError("Điểm tích lũy phải là số nguyên không âm.");
      return;
    }

    try {
      await onSubmit({
        address: normalizeNullableText(form.address),
        email: normalizeNullableText(form.email),
        name,
        note: normalizeNullableText(form.note),
        phone: normalizeNullableText(form.phone),
        points,
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Lưu khách hàng thất bại."));
    }
  }

  return (
    <form className="space-y-4" id={formId} onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Tên khách hàng"
          onChange={(event) => updateField("name", event.target.value)}
          placeholder="Nguyễn Hoàng An"
          required
          value={form.name}
        />
        <Input
          label="Số điện thoại"
          onChange={(event) => updateField("phone", event.target.value)}
          placeholder="090..."
          value={form.phone}
        />
        <Input
          label="Email"
          onChange={(event) => updateField("email", event.target.value)}
          placeholder="khach@example.com"
          type="email"
          value={form.email}
        />
        <Input
          label="Địa chỉ"
          onChange={(event) => updateField("address", event.target.value)}
          placeholder="Quận/Huyện, Tỉnh/Thành"
          value={form.address}
        />
        <Input
          inputMode="numeric"
          label="Điểm tích lũy"
          onChange={(event) => updateField("points", normalizeIntegerInput(event.target.value))}
          placeholder="0"
          value={formatIntegerInput(form.points)}
        />
      </div>
      <Textarea
        label="Ghi chú"
        onChange={(event) => updateField("note", event.target.value)}
        placeholder="Sở thích, lịch sử chăm sóc, lưu ý giao hàng..."
        value={form.note}
      />

      {error ? (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}
    </form>
  );
}

export function CustomersPage() {
  const { confirmAction, showSuccess } = useActionNotice();
  const { canAccess } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchaseHistory, setPurchaseHistory] = useState<CustomerPurchaseHistoryOrder[]>([]);
  const [purchaseHistoryError, setPurchaseHistoryError] = useState("");
  const [purchaseHistoryLoading, setPurchaseHistoryLoading] = useState(false);
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState<CustomerPurchaseHistoryOrder | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const canCreateCustomer = canAccess("customers.create");
  const canEditCustomer = canAccess("customers.update");
  const canDeleteCustomer = canAccess("customers.delete");
  const canViewPurchaseHistory =
    canAccess("customers.purchase-history.view") || canAccess("orders");

  async function loadCustomers() {
    setLoading(true);

    try {
      setCustomers(await fetchCustomers());
    } catch (requestError) {
      setErrorNotice({
        message: getErrorMessage(requestError, "Không tải được danh sách khách hàng."),
        title: "Không tải được khách hàng",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    setSelectedPurchaseOrder(null);
  }, [viewingCustomer?.id]);

  useEffect(() => {
    if (!viewingCustomer || !canViewPurchaseHistory) {
      setPurchaseHistory([]);
      setPurchaseHistoryError("");
      setPurchaseHistoryLoading(false);
      return;
    }

    let active = true;
    setPurchaseHistory([]);
    setPurchaseHistoryError("");
    setPurchaseHistoryLoading(true);
    void fetchCustomerPurchaseHistory(viewingCustomer.id)
      .then((history) => {
        if (active) setPurchaseHistory(history);
      })
      .catch((requestError) => {
        if (active) {
          setPurchaseHistoryError(
            getErrorMessage(requestError, "Không tải được lịch sử mua hàng."),
          );
        }
      })
      .finally(() => {
        if (active) setPurchaseHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canViewPurchaseHistory, viewingCustomer]);

  function openCreateModal() {
    if (!canCreateCustomer) {
      return;
    }

    setEditingCustomer(null);
    setViewingCustomer(null);
    setModalOpen(true);
  }

  function openEditModal(customer: Customer) {
    if (!canEditCustomer) {
      return;
    }

    setEditingCustomer(customer);
    setViewingCustomer(null);
    setModalOpen(true);
  }

  async function handleSave(input: CustomerInput) {
    if ((editingCustomer && !canEditCustomer) || (!editingCustomer && !canCreateCustomer)) {
      return;
    }

    setSubmitting(true);

    try {
      const wasEditing = Boolean(editingCustomer);
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, input);
      } else {
        await createCustomer(input);
      }

      setModalOpen(false);
      setEditingCustomer(null);
      setViewingCustomer(null);
      await loadCustomers();
      showSuccess(wasEditing ? "Đã lưu thay đổi khách hàng." : "Đã thêm khách hàng mới.");
    } catch (requestError) {
      throw new Error(getErrorMessage(requestError, "Lưu khách hàng thất bại."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(customer: Customer) {
    if (!canDeleteCustomer) {
      return;
    }

    const confirmed = await confirmAction({
      confirmLabel: "Xóa khách hàng",
      message: `Bạn có chắc muốn xóa khách hàng “${customer.name}”?`,
      title: "Xác nhận xóa khách hàng",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }

    try {
      await deleteCustomer(customer.id);
      setCustomers((current) => current.filter((item) => item.id !== customer.id));
      setModalOpen(false);
      setEditingCustomer(null);
      setViewingCustomer(null);
      showSuccess("Đã xóa khách hàng.");
    } catch (requestError) {
      setErrorNotice({
        message: getErrorMessage(requestError, "Xóa khách hàng thất bại."),
        title: "Xóa khách hàng thất bại",
      });
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filteredCustomers = customers.filter((customer) =>
    [customer.name, customer.phone, customer.email, customer.address]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery))
  );
  const customerFormId = editingCustomer
    ? `customer-form-${editingCustomer.id}`
    : "customer-form-create";
  const completeContactCount = customers.filter((customer) => customer.phone || customer.email).length;
  const completedPurchases = purchaseHistory.filter((order) => order.status === "paid");
  const customerTotalSpend = completedPurchases.reduce(
    (sum, order) => sum + order.total,
    0,
  );
  const lastPurchase = completedPurchases[0] ?? null;

  return (
    <PageContainer className="pb-28 sm:pb-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="hidden items-center gap-3 p-4 sm:flex">
          <div className="relative hidden min-w-0 flex-1 sm:block">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-11 rounded-xl border-slate-200 bg-slate-50 py-2 pl-11 focus:bg-white"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm tên, số điện thoại, email hoặc địa chỉ"
              value={query}
            />
          </div>
          {canCreateCustomer ? (
            <Button className="ml-auto hidden h-11 shrink-0 sm:inline-flex" onClick={openCreateModal}>
              <UserPlus className="h-4 w-4" />
              Thêm khách hàng
            </Button>
          ) : null}
        </div>
        <div className="grid grid-cols-3 border-t border-slate-100 bg-slate-50/70">
          <div className="px-3 py-3 sm:px-4"><p className="text-lg font-black tabular-nums text-slate-950">{customers.length}</p><p className="text-[11px] font-bold text-slate-500 sm:text-xs">Tổng khách hàng</p></div>
          <div className="border-x border-slate-200 px-3 py-3 sm:px-4"><p className="text-lg font-black tabular-nums text-moss-800">{completeContactCount}</p><p className="text-[11px] font-bold text-slate-500 sm:text-xs">Có liên hệ</p></div>
          <div className="px-3 py-3 sm:px-4"><p className="text-lg font-black tabular-nums text-slate-950">{filteredCustomers.length}</p><p className="text-[11px] font-bold text-slate-500 sm:text-xs">Đang hiển thị</p></div>
        </div>
      </section>

      {loading ? (
        <div className="rounded-xl bg-white p-6 shadow-soft">
          <Spinner label="Đang tải khách hàng..." />
        </div>
      ) : filteredCustomers.length === 0 ? (
        <EmptyState
          description={
            query.trim()
              ? "Không có khách hàng phù hợp với nội dung tìm kiếm."
              : "Thêm khách hàng đầu tiên để gắn vào hóa đơn và chăm sóc về sau."
          }
          icon={UsersRound}
          title={query.trim() ? "Không tìm thấy khách hàng" : "Chưa có khách hàng"}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft max-lg:border-0 max-lg:bg-transparent max-lg:shadow-none">
          <div className="hidden grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_110px_minmax(0,1.2fr)_32px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-slate-500 lg:grid">
            <span>Khách hàng</span>
            <span>Liên hệ</span>
            <span>Điểm</span>
            <span>Thông tin thêm</span>
            <span />
          </div>
          <div className="divide-y divide-coal/5 max-lg:grid max-lg:gap-3 max-lg:divide-y-0">
            {filteredCustomers.map((customer) => (
              <button
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-white px-4 py-4 text-left transition hover:bg-moss-50/60 max-lg:rounded-2xl max-lg:border max-lg:border-slate-200 max-lg:shadow-[0_4px_16px_rgba(15,23,42,0.05)] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_110px_minmax(0,1.2fr)_32px] lg:px-5"
                key={customer.id}
                onClick={() => setViewingCustomer(customer)}
                type="button"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-moss-100 text-sm font-black uppercase text-moss-800">
                    {customer.name.trim().charAt(0) || "K"}
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-extrabold text-coal">
                      {customer.name}
                    </h3>
                    <Badge className="mt-1.5 lg:hidden" tone="amber">
                      {(customer.points ?? 0).toLocaleString("vi-VN")} điểm
                    </Badge>
                    {customer.address ? <p className="mt-2 line-clamp-1 text-xs font-semibold text-slate-500 lg:hidden"><MapPin className="mr-1 inline h-3.5 w-3.5" />{customer.address}</p> : null}
                  </div>
                </div>

                <div className="hidden gap-1.5 text-sm lg:grid">
                  <div className="flex min-w-0 items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0 text-clay" />
                    <span className="truncate font-semibold text-coal">
                      {customer.phone || "Chưa có số điện thoại"}
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center gap-2 text-coal/60">
                    <Mail className="h-4 w-4 shrink-0 text-clay" />
                    <span className="truncate">{customer.email || "Chưa có email"}</span>
                  </div>
                </div>

                <div className="hidden lg:block">
                  <Badge tone="amber">{(customer.points ?? 0).toLocaleString("vi-VN")} điểm</Badge>
                </div>

                <div className="hidden gap-1.5 text-sm text-coal/65 lg:grid">
                  <div className="flex min-w-0 items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-clay" />
                    <span className="truncate">{customer.address || "Chưa có địa chỉ"}</span>
                  </div>
                  <div className="flex min-w-0 items-center gap-2">
                    <StickyNote className="h-4 w-4 shrink-0 text-clay" />
                    <span className="truncate">{customer.note || "Chưa có ghi chú"}</span>
                  </div>
                </div>

                <ChevronRight className="h-5 w-5 text-slate-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pb-[calc(.65rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_28px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:hidden">
        <div className={`mx-auto grid max-w-lg gap-2 ${canCreateCustomer ? "grid-cols-2" : "grid-cols-1"}`}>
          <button className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-700" onClick={() => setSearchModalOpen(true)} type="button"><Search className="h-4 w-4" />Tìm kiếm</button>
          {canCreateCustomer ? <button className="flex h-11 items-center justify-center gap-2 rounded-xl bg-coal text-sm font-extrabold text-white shadow-sm" onClick={openCreateModal} type="button"><UserPlus className="h-4 w-4" />Thêm khách hàng</button> : null}
        </div>
      </div>

      <Modal footer={<Button className="w-full sm:w-auto" onClick={() => setSearchModalOpen(false)}>Xem {filteredCustomers.length} kết quả</Button>} onClose={() => setSearchModalOpen(false)} open={searchModalOpen} size="sm" title="Tìm khách hàng">
        <div className="space-y-3"><div className="relative"><Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-coal/35" /><Input autoFocus className="h-12 rounded-xl pl-11" onChange={(event) => setQuery(event.target.value)} placeholder="Tên, số điện thoại hoặc email..." value={query} /></div><p className="text-sm font-semibold text-slate-500">Tìm thấy {filteredCustomers.length} khách hàng</p></div>
      </Modal>

      <Modal
        footer={
          <Button
            className="w-full sm:w-auto"
            onClick={() => setSelectedPurchaseOrder(null)}
            type="button"
            variant="secondary"
          >
            Đóng
          </Button>
        }
        onClose={() => setSelectedPurchaseOrder(null)}
        open={Boolean(selectedPurchaseOrder)}
        size="xl"
        title={selectedPurchaseOrder ? `Hóa đơn ${selectedPurchaseOrder.code}` : "Chi tiết hóa đơn"}
      >
        {selectedPurchaseOrder ? (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Thời gian</p>
                <p className="mt-1 text-sm font-extrabold text-slate-900">
                  {formatCustomerDate(selectedPurchaseOrder.createdAt, true)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Khách hàng</p>
                <p className="mt-1 text-sm font-extrabold text-slate-900">
                  {viewingCustomer?.name ?? "Khách lẻ"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Thanh toán</p>
                <p className="mt-1 text-sm font-extrabold text-slate-900">
                  {selectedPurchaseOrder.paymentMethod === "transfer" ? "Chuyển khoản" : "Tiền mặt"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Trạng thái</p>
                <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${selectedPurchaseOrder.status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                  {selectedPurchaseOrder.status === "paid" ? "Đã thanh toán" : "Đã hủy"}
                </span>
              </div>
            </div>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                <h3 className="text-sm font-black text-slate-900">
                  Sản phẩm ({selectedPurchaseOrder.items.reduce((sum, item) => sum + item.quantity, 0)})
                </h3>
              </div>
              <div className="divide-y divide-slate-100">
                {selectedPurchaseOrder.items.map((item) => (
                  <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 px-3 py-3 sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:px-4" key={item.id}>
                    <div className="h-14 w-14 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
                      {item.imageUrl ? (
                        <img alt={item.productName} className="h-full w-full object-cover" src={item.imageUrl} />
                      ) : (
                        <div className="grid h-full place-items-center text-slate-300"><Package className="h-5 w-5" /></div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-extrabold text-slate-900">{item.productName}</p>
                      <p className="mt-1 break-all text-xs font-bold text-slate-500">SKU: {item.sku || "Không có"}</p>
                      {item.variantLabel ? <p className="mt-1 text-xs font-bold text-moss-700">{item.variantLabel}</p> : null}
                      <p className="mt-1 text-xs font-semibold tabular-nums text-slate-500">
                        {item.quantity} × {formatCurrency(item.unitPrice)}
                      </p>
                    </div>
                    <p className="col-start-2 self-center text-left font-black tabular-nums text-slate-900 sm:col-start-auto sm:text-right">
                      {formatCurrency(item.lineTotal)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <div className="rounded-xl bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3 text-sm font-bold text-slate-600">
                <span>Tạm tính</span>
                <span className="tabular-nums">{formatCurrency(selectedPurchaseOrder.subtotal)}</span>
              </div>
              {selectedPurchaseOrder.discount > 0 ? (
                <div className="mt-2 flex items-center justify-between gap-3 text-sm font-bold text-emerald-700">
                  <span>Giảm giá</span>
                  <span className="tabular-nums">-{formatCurrency(selectedPurchaseOrder.discount)}</span>
                </div>
              ) : null}
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
                <span className="font-black text-slate-900">Tổng thanh toán</span>
                <span className="text-lg font-black tabular-nums text-moss-800">{formatCurrency(selectedPurchaseOrder.total)}</span>
              </div>
              {selectedPurchaseOrder.paymentMethod === "cash" ? (
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-sm">
                  <div><p className="font-semibold text-slate-500">Khách đưa</p><p className="mt-1 font-black tabular-nums text-slate-900">{formatCurrency(selectedPurchaseOrder.cashReceived)}</p></div>
                  <div className="text-right"><p className="font-semibold text-slate-500">Tiền thừa</p><p className="mt-1 font-black tabular-nums text-slate-900">{formatCurrency(selectedPurchaseOrder.changeAmount)}</p></div>
                </div>
              ) : null}
            </div>

            {selectedPurchaseOrder.pointsRedeemed > 0 || selectedPurchaseOrder.pointsEarned > 0 ? (
              <div className="grid gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm sm:grid-cols-2">
                <p className="font-bold text-amber-900">Điểm đã dùng: {selectedPurchaseOrder.pointsRedeemed.toLocaleString("vi-VN")}</p>
                <p className="font-bold text-emerald-800 sm:text-right">Điểm được cộng: {selectedPurchaseOrder.pointsEarned.toLocaleString("vi-VN")}</p>
              </div>
            ) : null}
            {selectedPurchaseOrder.note ? (
              <div className="rounded-xl border border-slate-200 px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Ghi chú hóa đơn</p>
                <p className="mt-1 whitespace-pre-line text-sm font-semibold text-slate-700">{selectedPurchaseOrder.note}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button onClick={() => setViewingCustomer(null)} type="button" variant="secondary">
              Đóng
            </Button>
            {viewingCustomer && canEditCustomer ? (
              <Button onClick={() => openEditModal(viewingCustomer)} type="button">
                <Edit3 className="h-4 w-4" />
                Sửa
              </Button>
            ) : null}
          </div>
        }
        onClose={() => setViewingCustomer(null)}
        open={Boolean(viewingCustomer)}
        size="xl"
        title="Thông tin khách hàng"
      >
        {viewingCustomer ? (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-moss-100 text-lg font-black uppercase text-moss-800">
                {viewingCustomer.name.trim().charAt(0) || "K"}
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-xl font-extrabold text-slate-950">
                  {viewingCustomer.name}
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Tạo ngày {formatCustomerDate(viewingCustomer.created_at)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl bg-moss-50 px-3 py-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-moss-700">Đơn đã mua</p>
                <p className="mt-1 text-lg font-black tabular-nums text-moss-900">{completedPurchases.length}</p>
              </div>
              <div className="rounded-xl bg-sky-50 px-3 py-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-sky-700">Tổng chi tiêu</p>
                <p className="mt-1 truncate text-lg font-black tabular-nums text-sky-900" title={formatCurrency(customerTotalSpend)}>{formatCurrency(customerTotalSpend)}</p>
              </div>
              <div className="rounded-xl bg-amber-50 px-3 py-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-amber-700">Điểm hiện có</p>
                <p className="mt-1 text-lg font-black tabular-nums text-amber-900">{(viewingCustomer.points ?? 0).toLocaleString("vi-VN")}</p>
              </div>
              <div className="rounded-xl bg-slate-100 px-3 py-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Mua gần nhất</p>
                <p className="mt-1 text-sm font-black text-slate-800">
                  {lastPurchase?.createdAt
                    ? formatCustomerDate(lastPurchase.createdAt)
                    : "Chưa có"}
                </p>
              </div>
            </div>

            <section>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="font-black text-slate-900">Thông tin liên hệ</h3>
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              <dl className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
                <dt className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                  Số điện thoại
                </dt>
                <dd className="text-sm font-bold text-slate-800 sm:text-right">
                  {viewingCustomer.phone || "Chưa có"}
                </dd>
              </div>
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
                <dt className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                  Email
                </dt>
                <dd className="break-words text-sm font-bold text-slate-800 sm:text-right">
                  {viewingCustomer.email || "Chưa có"}
                </dd>
              </div>
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
                <dt className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                  Địa chỉ
                </dt>
                <dd className="text-sm font-bold text-slate-800 sm:text-right">
                  {viewingCustomer.address || "Chưa có"}
                </dd>
              </div>
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
                <dt className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                  Ghi chú
                </dt>
                <dd className="whitespace-pre-line text-sm font-bold text-slate-800 sm:text-right">
                  {viewingCustomer.note || "Chưa có"}
                </dd>
              </div>
              </dl>
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2">
                <ReceiptText className="h-4 w-4 text-moss-700" />
                <h3 className="font-black text-slate-900">Lịch sử mua hàng</h3>
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              {!canViewPurchaseHistory ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  Tài khoản chưa có quyền xem lịch sử mua hàng của khách.
                </div>
              ) : purchaseHistoryLoading ? (
                <div className="rounded-xl border border-slate-200 bg-white p-6">
                  <Spinner label="Đang tải lịch sử mua hàng..." />
                </div>
              ) : purchaseHistoryError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {purchaseHistoryError}
                </div>
              ) : purchaseHistory.length === 0 ? (
                <div className="grid min-h-36 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                  <div>
                    <Package className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm font-extrabold text-slate-700">Khách chưa có đơn hàng</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">Các sản phẩm đã mua sẽ xuất hiện tại đây.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {purchaseHistory.map((order) => (
                    <button
                      className="block w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:border-moss-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500"
                      key={order.id}
                      onClick={() => setSelectedPurchaseOrder(order)}
                      type="button"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2.5 sm:px-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-black text-slate-900">{order.code}</p>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${order.status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                              {order.status === "paid" ? "Đã thanh toán" : "Đã hủy"}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs font-semibold text-slate-500">
                            {formatCustomerDate(order.createdAt, true)}
                            {" · "}{order.paymentMethod === "transfer" ? "Chuyển khoản" : "Tiền mặt"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-base font-black tabular-nums text-moss-800">{formatCurrency(order.total)}</p>
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        </div>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {order.items.map((item) => (
                          <div className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 sm:px-4" key={item.id}>
                            <div className="h-[52px] w-[52px] overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
                              {item.imageUrl ? (
                                <img alt={item.productName} className="h-full w-full object-cover" src={item.imageUrl} />
                              ) : (
                                <div className="grid h-full place-items-center text-slate-300"><Package className="h-5 w-5" /></div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-extrabold text-slate-900">{item.productName}</p>
                              <p className="mt-0.5 truncate text-[11px] font-bold text-slate-500">SKU: {item.sku || "Không có"}</p>
                              {item.variantLabel ? <p className="mt-0.5 truncate text-[11px] font-bold text-moss-700">{item.variantLabel}</p> : null}
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black tabular-nums text-slate-900">{formatCurrency(item.lineTotal)}</p>
                              <p className="mt-0.5 text-[11px] font-bold tabular-nums text-slate-500">{item.quantity} × {formatCurrency(item.unitPrice)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </Modal>

      <Modal
        footer={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {editingCustomer && canDeleteCustomer ? (
                <Button
                  onClick={() => void handleDelete(editingCustomer)}
                  type="button"
                  variant="danger"
                >
                  <Trash2 className="h-4 w-4" />
                  Xóa
                </Button>
              ) : null}
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <Button onClick={() => setModalOpen(false)} type="button" variant="secondary">
                Hủy
              </Button>
              <Button form={customerFormId} isLoading={submitting} type="submit">
                {editingCustomer ? "Cập nhật" : "Thêm khách hàng"}
              </Button>
            </div>
          </div>
        }
        onClose={() => setModalOpen(false)}
        open={modalOpen}
        size="lg"
        title={editingCustomer ? "Sửa khách hàng" : "Thêm khách hàng"}
      >
        <CustomerForm
          customer={editingCustomer}
          formId={customerFormId}
          onSubmit={handleSave}
        />
      </Modal>
      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </PageContainer>
  );
}
