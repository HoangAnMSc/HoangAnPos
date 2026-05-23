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
import { Card } from "../components/ui/Card";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { Textarea } from "../components/ui/Textarea";
import { useAuth } from "../contexts/AuthContext";
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

function getCustomerInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "K";
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
    if (!name) {
      setError("Ten khach hang la bat buoc.");
      return;
    }

    try {
      await onSubmit({
        address: normalizeText(form.address),
        email: normalizeText(form.email),
        name,
        note: normalizeText(form.note),
        phone: normalizeText(form.phone),
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Luu khach hang that bai.");
    }
  }

  return (
    <form className="space-y-4" id={formId} onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="Ten khach hang"
          onChange={(event) => updateField("name", event.target.value)}
          placeholder="Nguyen Hoang An"
          required
          value={form.name}
        />
        <Input
          label="So dien thoai"
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
          label="Dia chi"
          onChange={(event) => updateField("address", event.target.value)}
          placeholder="Quan/Huyen, Tinh/Thanh"
          value={form.address}
        />
      </div>
      <Textarea
        label="Ghi chu"
        onChange={(event) => updateField("note", event.target.value)}
        placeholder="So thich, lich su cham soc, luu y giao hang..."
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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const canCreateCustomer = canAccess("customers.create");
  const canEditCustomer = canAccess("customers.update");
  const canDeleteCustomer = canAccess("customers.delete");

  async function loadCustomers() {
    setLoading(true);
    setError("");

    try {
      setCustomers(await fetchCustomers());
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Khong tai duoc danh sach khach hang."
      );
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
    setError("");

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
      const message =
        requestError instanceof Error ? requestError.message : "Luu khach hang that bai.";
      setError(message);
      throw new Error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(customer: Customer) {
    if (!canDeleteCustomer) {
      return;
    }

    const confirmed = window.confirm(`Xoa khach hang "${customer.name}"?`);
    if (!confirmed) {
      return;
    }

    setError("");

    try {
      await deleteCustomer(customer.id);
      setCustomers((current) => current.filter((item) => item.id !== customer.id));
      setModalOpen(false);
      setEditingCustomer(null);
      setViewingCustomer(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Xoa khach hang that bai.");
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
    <div className="space-y-4">
      <ConfigNotice />

      <Card className="overflow-hidden rounded-xl p-0">
        <div className="border-b border-coal/10 p-3 sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-coal/45">
                Ho so khach hang
              </p>
              <h2 className="mt-1 font-display text-xl font-bold text-coal">Khach hang</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone="neutral">{customers.length} khach</Badge>
                <Badge tone="neutral">{filteredCustomers.length} dang hien thi</Badge>
                <Badge tone="green">{completeContactCount} co lien he</Badge>
              </div>
            </div>
            {canCreateCustomer ? (
              <Button className="h-10 w-full rounded-xl px-3 sm:w-auto" onClick={openCreateModal}>
                <UserPlus className="h-4 w-4" />
                Them khach hang
              </Button>
            ) : null}
          </div>

          <div className="relative mt-3 w-full xl:max-w-xl">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-coal/35" />
            <Input
              className="h-10 rounded-xl py-2 pl-11"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tim theo ten, SDT, email, dia chi..."
              value={query}
            />
          </div>
        </div>

        {error && !modalOpen ? (
          <div className="m-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 sm:m-4">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="p-6">
            <Spinner />
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-5">
            <EmptyState
              description="Luu thong tin khach de gan vao hoa don POS va cham soc ve sau."
              icon={UsersRound}
              title="Chua co khach hang phu hop"
            />
          </div>
        ) : (
          <div className="overflow-hidden">
            <div className="hidden grid-cols-[minmax(0,1.45fr)_minmax(0,1.05fr)_minmax(0,1.3fr)_auto] gap-3 border-b border-coal/10 bg-coal px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-white/70 lg:grid">
              <span>Khach hang</span>
              <span>Lien he</span>
              <span>Thong tin them</span>
              <span className="text-right">Thao tac</span>
            </div>
            <div className="divide-y divide-coal/10 bg-white/70">
              {filteredCustomers.map((customer) => (
                <button
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-3 text-left transition hover:bg-cream/35 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1.05fr)_minmax(0,1.3fr)_auto] lg:gap-3 lg:px-4"
                  key={customer.id}
                  onClick={() => setViewingCustomer(customer)}
                  type="button"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-moss/12 text-sm font-extrabold text-moss">
                      {getCustomerInitial(customer.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-display text-base font-bold">{customer.name}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-coal/45 lg:hidden">
                        {customer.phone || customer.email || "Chua co lien he"}
                      </p>
                    </div>
                  </div>

                  <div className="hidden gap-1.5 text-sm lg:grid">
                    <div className="flex min-w-0 items-center gap-2">
                      <Phone className="h-4 w-4 shrink-0 text-clay" />
                      <span className="truncate font-semibold text-coal">
                        {customer.phone || "Chua co SDT"}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2 text-coal/60">
                      <Mail className="h-4 w-4 shrink-0 text-clay" />
                      <span className="truncate">{customer.email || "Chua co email"}</span>
                    </div>
                  </div>

                  <div className="hidden gap-1.5 text-sm text-coal/65 lg:grid">
                    <div className="flex min-w-0 items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0 text-clay" />
                      <span className="truncate">{customer.address || "Chua co dia chi"}</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <StickyNote className="h-4 w-4 shrink-0 text-clay" />
                      <span className="truncate">{customer.note || "Chua co ghi chu"}</span>
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
      </Card>

      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button onClick={() => setViewingCustomer(null)} type="button" variant="secondary">
              Dong
            </Button>
            {viewingCustomer && canEditCustomer ? (
              <Button onClick={() => openEditModal(viewingCustomer)} type="button">
                <Edit3 className="h-4 w-4" />
                Sua
              </Button>
            ) : null}
          </div>
        }
        onClose={() => setViewingCustomer(null)}
        open={Boolean(viewingCustomer)}
        size="md"
        title="Xem khach hang"
      >
        {viewingCustomer ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-moss/12 text-base font-extrabold text-moss">
                {getCustomerInitial(viewingCustomer.name)}
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-lg font-extrabold text-slate-950">
                  {viewingCustomer.name}
                </h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Tao {new Intl.DateTimeFormat("vi-VN").format(new Date(viewingCustomer.created_at))}
                </p>
              </div>
            </div>
            <div className="grid gap-2 text-sm font-semibold text-slate-700">
              <p><span className="text-slate-400">SDT:</span> {viewingCustomer.phone || "Chua co"}</p>
              <p><span className="text-slate-400">Email:</span> {viewingCustomer.email || "Chua co"}</p>
              <p><span className="text-slate-400">Dia chi:</span> {viewingCustomer.address || "Chua co"}</p>
              <p className="whitespace-pre-line"><span className="text-slate-400">Ghi chu:</span> {viewingCustomer.note || "Chua co"}</p>
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
                  Xoa
                </Button>
              ) : null}
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <Button onClick={() => setModalOpen(false)} type="button" variant="secondary">
                Huy
              </Button>
              <Button form={customerFormId} isLoading={submitting} type="submit">
                {editingCustomer ? "Cap nhat" : "Them khach hang"}
              </Button>
            </div>
          </div>
        }
        onClose={() => setModalOpen(false)}
        open={modalOpen}
        size="lg"
        title={editingCustomer ? "Sua khach hang" : "Them khach hang"}
      >
        <CustomerForm
          customer={editingCustomer}
          formId={customerFormId}
          onSubmit={handleSave}
        />
      </Modal>
    </div>
  );
}
