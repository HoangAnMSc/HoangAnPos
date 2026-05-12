import { FormEvent, useEffect, useState } from "react";
import { Edit3, Mail, MapPin, Phone, Search, Trash2, UserPlus, UsersRound } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { Textarea } from "../components/ui/Textarea";
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
};

const emptyForm: CustomerFormState = {
  address: "",
  email: "",
  name: "",
  note: "",
  phone: "",
};
const renderLegacyModalActions = false;

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
  };
}

type CustomerFormProps = {
  customer?: Customer | null;
  formId: string;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (input: CustomerInput) => Promise<void>;
};

function CustomerForm({ customer, formId, onCancel, onSubmit, submitting }: CustomerFormProps) {
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
    if (!name) {
      setError("Tên khách hàng là bắt buộc.");
      return;
    }

    await onSubmit({
      address: normalizeText(form.address),
      email: normalizeText(form.email),
      name,
      note: normalizeText(form.note),
      phone: normalizeText(form.phone),
    });
  }

  return (
    <form className="space-y-5" id={formId} onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
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

      {renderLegacyModalActions ? (
        <div className="hidden">
        <Button onClick={onCancel} type="button" variant="secondary">
          Hủy
        </Button>
        <Button isLoading={submitting} type="submit">
          {customer ? "Cập nhật" : "Thêm khách hàng"}
        </Button>
        </div>
      ) : null}
    </form>
  );
}

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadCustomers() {
    setLoading(true);
    setError("");

    try {
      setCustomers(await fetchCustomers());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Không tải được danh sách khách hàng."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  function openCreateModal() {
    setEditingCustomer(null);
    setModalOpen(true);
  }

  function openEditModal(customer: Customer) {
    setEditingCustomer(customer);
    setModalOpen(true);
  }

  async function handleSave(input: CustomerInput) {
    setSubmitting(true);
    setError("");

    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, input);
      } else {
        await createCustomer(input);
      }

      setModalOpen(false);
      setEditingCustomer(null);
      await loadCustomers();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Lưu khách hàng thất bại."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(customer: Customer) {
    const confirmed = window.confirm(`Xóa khách hàng "${customer.name}"?`);
    if (!confirmed) {
      return;
    }

    setError("");

    try {
      await deleteCustomer(customer.id);
      setCustomers((current) => current.filter((item) => item.id !== customer.id));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Xóa khách hàng thất bại."
      );
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

  return (
    <div className="space-y-6">
      <ConfigNotice />

      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-coal/35" />
            <Input
              className="pl-11"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tên, SĐT, email, địa chỉ..."
              value={query}
            />
          </div>
          <Button onClick={openCreateModal}>
            <UserPlus className="h-4 w-4" />
            Thêm khách hàng
          </Button>
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <Spinner />
        ) : filteredCustomers.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              description="Lưu thông tin khách để gắn vào hóa đơn POS và chăm sóc về sau."
              icon={UsersRound}
              title="Chưa có khách hàng phù hợp"
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {filteredCustomers.map((customer) => (
              <div
                className="rounded-[1.75rem] border border-coal/10 bg-white/75 p-5 shadow-sm"
                key={customer.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-xl font-bold">{customer.name}</h3>
                    <Badge className="mt-2" tone="amber">
                      Khách hàng
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button className="h-10 w-10 p-0" onClick={() => openEditModal(customer)} variant="secondary">
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button className="h-10 w-10 p-0" onClick={() => handleDelete(customer)} variant="danger">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 text-sm text-coal/70">
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-clay" />
                    <span>{customer.phone || "Chưa có số điện thoại"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-clay" />
                    <span>{customer.email || "Chưa có email"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-clay" />
                    <span>{customer.address || "Chưa có địa chỉ"}</span>
                  </div>
                </div>

                {customer.note ? (
                  <p className="mt-4 rounded-2xl bg-cream px-4 py-3 text-sm leading-6 text-coal/70">
                    {customer.note}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button onClick={() => setModalOpen(false)} type="button" variant="secondary">
              Huy
            </Button>
            <Button form={customerFormId} isLoading={submitting} type="submit">
              {editingCustomer ? "Cap nhat" : "Them khach hang"}
            </Button>
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
          onCancel={() => setModalOpen(false)}
          onSubmit={handleSave}
          submitting={submitting}
        />
      </Modal>
    </div>
  );
}
