import { FormEvent, useEffect, useState } from "react";
import {
  Edit3,
  Mail,
  MapPin,
  Phone,
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
import { getErrorMessage } from "../lib/errors";
import { formatIntegerInput, normalizeIntegerInput } from "../lib/format";
import { normalizeNullableText } from "../lib/text";
import {
  createCustomer,
  deleteCustomer,
  fetchCustomers,
  updateCustomer,
  type CustomerInput,
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
  const { canAccess } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const canCreateCustomer = canAccess("customers.create");
  const canEditCustomer = canAccess("customers.update");
  const canDeleteCustomer = canAccess("customers.delete");

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
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, input);
      } else {
        await createCustomer(input);
      }

      setModalOpen(false);
      setEditingCustomer(null);
      setViewingCustomer(null);
      await loadCustomers();
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

    const confirmed = window.confirm(`Xóa khách hàng "${customer.name}"?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteCustomer(customer.id);
      setCustomers((current) => current.filter((item) => item.id !== customer.id));
      setModalOpen(false);
      setEditingCustomer(null);
      setViewingCustomer(null);
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

  return (
    <PageContainer className="pb-28 sm:pb-6">
      <section className="rounded-xl bg-white p-4 shadow-soft ring-1 ring-coal/5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-coal/45">
              Khách hàng
            </p>
            <h2 className="mt-1 font-display text-xl font-bold text-coal">
              Quản lý khách hàng
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone="neutral">{customers.length} khách hàng</Badge>
              <Badge tone="neutral">{filteredCustomers.length} đang hiển thị</Badge>
              <Badge tone="green">{completeContactCount} có liên hệ</Badge>
            </div>
          </div>
          {canCreateCustomer ? (
            <Button className="hidden h-10 rounded-xl px-3 sm:inline-flex" onClick={openCreateModal}>
              <UserPlus className="h-4 w-4" />
              Thêm khách hàng
            </Button>
          ) : null}
        </div>

        <div className="relative mt-3 hidden w-full sm:block xl:max-w-xl">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-coal/35" />
          <Input
            className="h-10 rounded-xl py-2 pl-11"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm tên, số điện thoại, email hoặc địa chỉ..."
            value={query}
          />
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
        <div className="overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-coal/5">
          <div className="hidden grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_110px_minmax(0,1.2fr)_auto] gap-3 border-b border-coal/5 bg-coal px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-white/70 lg:grid">
            <span>Khách hàng</span>
            <span>Liên hệ</span>
            <span>Điểm</span>
            <span>Thông tin thêm</span>
            <span className="text-right">Thao tác</span>
          </div>
          <div className="divide-y divide-coal/5">
            {filteredCustomers.map((customer) => (
              <button
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 text-left transition hover:bg-cream/30 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_110px_minmax(0,1.2fr)_auto] lg:gap-3"
                key={customer.id}
                onClick={() => setViewingCustomer(customer)}
                type="button"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-extrabold text-coal">
                      {customer.name}
                    </h3>
                    <p className="mt-1 truncate text-xs font-semibold text-coal/45 lg:hidden">
                      {customer.phone || customer.email || "Chưa có liên hệ"}
                    </p>
                    <Badge className="mt-1.5 lg:hidden" tone="amber">
                      {(customer.points ?? 0).toLocaleString("vi-VN")} điểm
                    </Badge>
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

                <div className="flex justify-end">
                  <Badge tone="neutral">Xem</Badge>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-2 gap-2">
          <Button onClick={() => setSearchModalOpen(true)} variant="secondary"><Search className="h-4 w-4" />Tìm kiếm</Button>
          {canCreateCustomer ? <Button onClick={openCreateModal}><UserPlus className="h-4 w-4" />Thêm khách hàng</Button> : <span />}
        </div>
      </div>

      <Modal footer={<Button onClick={() => setSearchModalOpen(false)} variant="secondary">Đóng</Button>} onClose={() => setSearchModalOpen(false)} open={searchModalOpen} size="sm" title="Tìm khách hàng">
        <div className="space-y-3"><div className="relative"><Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-coal/35" /><Input autoFocus className="h-12 rounded-xl pl-11" onChange={(event) => setQuery(event.target.value)} placeholder="Tên, số điện thoại hoặc email..." value={query} /></div><p className="text-sm font-semibold text-slate-500">Tìm thấy {filteredCustomers.length} khách hàng</p></div>
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
        size="lg"
        title="Thông tin khách hàng"
      >
        {viewingCustomer ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4">
              <div className="min-w-0">
                <h3 className="truncate text-xl font-extrabold text-slate-950">
                  {viewingCustomer.name}
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Tạo ngày {new Intl.DateTimeFormat("vi-VN").format(new Date(viewingCustomer.created_at))}
                </p>
              </div>
              <div className="ml-auto shrink-0 rounded-xl bg-amber-100 px-4 py-2 text-center text-amber-800">
                <p className="text-xl font-extrabold tabular-nums">
                  {(viewingCustomer.points ?? 0).toLocaleString("vi-VN")}
                </p>
                <p className="text-xs font-bold">điểm tích lũy</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-100 p-3">
                <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                  Số điện thoại
                </p>
                <p className="mt-1 text-sm font-bold text-slate-700">
                  {viewingCustomer.phone || "Chưa có"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 p-3">
                <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                  Email
                </p>
                <p className="mt-1 break-words text-sm font-bold text-slate-700">
                  {viewingCustomer.email || "Chưa có"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 p-3 sm:col-span-2">
                <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                  Địa chỉ
                </p>
                <p className="mt-1 text-sm font-bold text-slate-700">
                  {viewingCustomer.address || "Chưa có"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 p-3 sm:col-span-2">
                <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                  Ghi chú
                </p>
                <p className="mt-1 whitespace-pre-line text-sm font-bold text-slate-700">
                  {viewingCustomer.note || "Chưa có"}
                </p>
              </div>
            </div>
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
