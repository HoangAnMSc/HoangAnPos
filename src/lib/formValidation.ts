import { normalizePhoneNumber } from "./phone";

export const formFieldLimits = {
  address: 300,
  email: 254,
  name: 100,
  note: 1_000,
} as const;

export function getRequiredTextError(value: string, label: string, maxLength: number) {
  const normalized = value.trim();

  if (!normalized) {
    return `${label} là bắt buộc.`;
  }

  if (normalized.length > maxLength) {
    return `${label} không được vượt quá ${maxLength} ký tự.`;
  }

  return "";
}

export function getOptionalTextError(value: string, label: string, maxLength: number) {
  if (value.trim().length > maxLength) {
    return `${label} không được vượt quá ${maxLength} ký tự.`;
  }

  return "";
}

export function getEmailError(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return "";
  }

  if (normalized.length > formFieldLimits.email) {
    return `Email không được vượt quá ${formFieldLimits.email} ký tự.`;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return "Email không hợp lệ. Ví dụ: ten@example.com.";
  }

  return "";
}

export function getPhoneError(value: string, required = false) {
  if (!value.trim()) {
    return required ? "Số điện thoại là bắt buộc." : "";
  }

  try {
    normalizePhoneNumber(value);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : "Số điện thoại không hợp lệ.";
  }
}
