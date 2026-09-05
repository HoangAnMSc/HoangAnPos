import { type FormEvent, useEffect, useState } from "react";
import { getErrorMessage } from "../../lib/errors";
import {
  formFieldLimits,
  getEmailError,
  getOptionalTextError,
  getPhoneError,
  getRequiredTextError,
} from "../../lib/formValidation";
import { normalizeNullableText } from "../../lib/text";
import type { CustomerInput } from "../../services/customers";
import type { Customer } from "../../types";
import { Input } from "../ui/Input";
import { Textarea } from "../ui/Textarea";

type CustomerFormState = {
  address: string;
  email: string;
  name: string;
  note: string;
  phone: string;
};

type CustomerFormErrors = Partial<Record<keyof CustomerFormState, string>>;

const emptyForm: CustomerFormState = {
  address: "",
  email: "",
  name: "",
  note: "",
  phone: "",
};

function customerToForm(customer?: Customer | null): CustomerFormState {
  if (!customer) return emptyForm;

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
  onSubmit: (input: CustomerInput) => Promise<void>;
};

export function CustomerForm({ customer, formId, onSubmit }: CustomerFormProps) {
  const [form, setForm] = useState<CustomerFormState>(() => customerToForm(customer));
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<CustomerFormErrors>({});

  useEffect(() => {
    setForm(customerToForm(customer));
    setError("");
    setFieldErrors({});
  }, [customer]);

  function updateField(field: keyof CustomerFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const nextFieldErrors: CustomerFormErrors = {
      address: getOptionalTextError(form.address, "Địa chỉ", formFieldLimits.address),
      email: getEmailError(form.email),
      name: getRequiredTextError(form.name, "Tên khách hàng", formFieldLimits.name),
      note: getOptionalTextError(form.note, "Ghi chú", formFieldLimits.note),
      phone: getPhoneError(form.phone, true),
    };
    setFieldErrors(nextFieldErrors);

    if (Object.values(nextFieldErrors).some(Boolean)) return;

    try {
      await onSubmit({
        address: normalizeNullableText(form.address),
        email: normalizeNullableText(form.email.toLowerCase()),
        name: form.name.trim(),
        note: normalizeNullableText(form.note),
        phone: form.phone.trim(),
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Lưu khách hàng thất bại."));
    }
  }

  return (
    <form className="space-y-4" id={formId} noValidate onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          error={fieldErrors.name}
          label="Tên khách hàng *"
          maxLength={formFieldLimits.name}
          onChange={(event) => updateField("name", event.target.value)}
          placeholder="Nguyễn Hoàng An"
          required
          value={form.name}
        />
        <Input
          autoComplete="tel"
          error={fieldErrors.phone}
          label="Số điện thoại *"
          maxLength={24}
          onChange={(event) => updateField("phone", event.target.value)}
          placeholder="0901234567"
          required
          type="tel"
          value={form.phone}
        />
        <Input
          autoComplete="email"
          error={fieldErrors.email}
          label="Email"
          maxLength={formFieldLimits.email}
          onChange={(event) => updateField("email", event.target.value)}
          placeholder="khach@example.com"
          type="email"
          value={form.email}
        />
        <Input
          error={fieldErrors.address}
          label="Địa chỉ"
          maxLength={formFieldLimits.address}
          onChange={(event) => updateField("address", event.target.value)}
          placeholder="Quận/Huyện, Tỉnh/Thành"
          value={form.address}
        />
      </div>
      <Textarea
        error={fieldErrors.note}
        label="Ghi chú"
        maxLength={formFieldLimits.note}
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
