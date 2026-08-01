export function normalizePhoneNumber(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, "");

  let normalized = compact;
  if (/^0\d+$/.test(compact)) {
    normalized = `+84${compact.slice(1)}`;
  } else if (/^84\d+$/.test(compact)) {
    normalized = `+${compact}`;
  } else if (/^\d{9}$/.test(compact)) {
    normalized = `+84${compact}`;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error("Số điện thoại không hợp lệ. Ví dụ: 0901234567 hoặc +84901234567.");
  }

  return normalized;
}

export function formatPhoneNumber(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return /^\+84\d+$/.test(value) ? `0${value.slice(3)}` : value;
}

export function isEmailIdentifier(value: string) {
  return value.includes("@");
}
