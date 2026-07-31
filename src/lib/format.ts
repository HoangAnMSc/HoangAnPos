export function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

export function normalizeIntegerInput(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return digits.replace(/^0+(?=\d)/, "");
}

export function formatIntegerInput(value: string | number) {
  const normalizedValue = normalizeIntegerInput(String(value));

  if (!normalizedValue) {
    return "";
  }

  return normalizedValue.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function createOrderCode() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.getTime().toString().slice(-5);
  return `HD-${date}-${time}`;
}
