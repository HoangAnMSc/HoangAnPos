import type { Product } from "../types";

export type ExpiryStatus = "expired" | "soon" | "valid";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dayMs = 1000 * 60 * 60 * 24;
const expiringSoonWindowMs = dayMs * 60;
export const vietnamEanPrefix = "893";

const eanLeftOddPatterns: Record<string, string> = {
  "0": "0001101",
  "1": "0011001",
  "2": "0010011",
  "3": "0111101",
  "4": "0100011",
  "5": "0110001",
  "6": "0101111",
  "7": "0111011",
  "8": "0110111",
  "9": "0001011",
};

const eanLeftEvenPatterns: Record<string, string> = {
  "0": "0100111",
  "1": "0110011",
  "2": "0011011",
  "3": "0100001",
  "4": "0011101",
  "5": "0111001",
  "6": "0000101",
  "7": "0010001",
  "8": "0001001",
  "9": "0010111",
};

const eanRightPatterns: Record<string, string> = {
  "0": "1110010",
  "1": "1100110",
  "2": "1101100",
  "3": "1000010",
  "4": "1011100",
  "5": "1001110",
  "6": "1010000",
  "7": "1000100",
  "8": "1001000",
  "9": "1110100",
};

const eanParityPatterns: Record<string, string> = {
  "0": "OOOOOO",
  "1": "OOEOEE",
  "2": "OOEEOE",
  "3": "OOEEEO",
  "4": "OEOOEE",
  "5": "OEEOOE",
  "6": "OEEEOO",
  "7": "OEOEOE",
  "8": "OEOEEO",
  "9": "OEEOEO",
};

export function parseDateOnly(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatProductDate(value?: string | null) {
  const date = parseDateOnly(value);
  return date ? dateFormatter.format(date) : "Chua co";
}

export function getExpiryStatus(value?: string | null): ExpiryStatus | null {
  const expiryDate = parseDateOnly(value);
  if (!expiryDate) {
    return null;
  }

  const today = new Date();
  const todayTime = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const expiryTime = expiryDate.getTime();

  if (expiryTime < todayTime) {
    return "expired";
  }

  if (expiryTime - todayTime <= expiringSoonWindowMs) {
    return "soon";
  }

  return "valid";
}

export function getExpiryTone(status: ExpiryStatus | null): "green" | "amber" | "red" | "neutral" {
  if (status === "expired") {
    return "red";
  }

  if (status === "soon") {
    return "amber";
  }

  return status === "valid" ? "green" : "neutral";
}

export function getExpiryLabel(status: ExpiryStatus | null) {
  if (status === "expired") {
    return "Het han";
  }

  if (status === "soon") {
    return "Gan het han";
  }

  if (status === "valid") {
    return "Con han";
  }

  return "Chua co HSD";
}

export function formatExpiryCountdown(value?: string | null) {
  const expiryDate = parseDateOnly(value);
  if (!expiryDate) {
    return "Chua co";
  }

  const today = new Date();
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (expiryDate.getTime() < cursor.getTime()) {
    return "Het han";
  }

  if (expiryDate.getTime() === cursor.getTime()) {
    return "Hom nay";
  }

  let months = 0;

  while (true) {
    const nextMonth = new Date(cursor);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    if (nextMonth.getTime() > expiryDate.getTime()) {
      break;
    }

    months += 1;
    cursor = nextMonth;
  }

  const days = Math.max(0, Math.floor((expiryDate.getTime() - cursor.getTime()) / dayMs));
  const monthText = months > 0 ? `${months}M` : "";
  const dayText = days > 0 ? `${days}D` : "";

  return `Con ${monthText}${dayText || (monthText ? "" : "0D")}`;
}

export function getDaysUntilExpiry(value?: string | null) {
  const expiryDate = parseDateOnly(value);
  if (!expiryDate) {
    return null;
  }

  const today = new Date();
  const todayTime = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  return Math.floor((expiryDate.getTime() - todayTime) / dayMs);
}

export function formatExpiryDays(value?: string | null) {
  const days = getDaysUntilExpiry(value);

  if (days === null) {
    return "Chua co";
  }

  if (days < 0) {
    return "Het han";
  }

  if (days === 0) {
    return "Hom nay";
  }

  return `Con ${days} ngay`;
}

export function normalizeEan13Input(value?: string | null) {
  return (value ?? "").replace(/\D/g, "").slice(0, 13);
}

export function calculateEan13CheckDigit(first12Digits: string) {
  if (!/^\d{12}$/.test(first12Digits)) {
    return "";
  }

  const sum = Array.from(first12Digits).reduce((total, digit, index) => {
    const weight = index % 2 === 0 ? 1 : 3;
    return total + Number(digit) * weight;
  }, 0);

  return String((10 - (sum % 10)) % 10);
}

export function createEan13(first12Digits: string) {
  const body = first12Digits.replace(/\D/g, "").slice(0, 12).padStart(12, "0");
  return `${body}${calculateEan13CheckDigit(body)}`;
}

export function isValidEan13(value?: string | null) {
  const code = normalizeEan13Input(value);
  return code.length === 13 && calculateEan13CheckDigit(code.slice(0, 12)) === code[12];
}

function createStableInternalBody(id: string) {
  return `${vietnamEanPrefix}${createStableDigits(id || "0", 9)}`;
}

function createStableDigits(value: string, length: number) {
  const modulo = 10 ** length;
  let hash = 0;

  Array.from(value || "0").forEach((character) => {
    hash = (hash * 31 + character.charCodeAt(0)) % modulo;
  });

  return String(hash).padStart(length, "0").slice(-length);
}

export function createInternalEan13FromId(id: string) {
  return createEan13(createStableInternalBody(id));
}

export function createVietnamEan13FromSeed(seed: string) {
  return createEan13(`${vietnamEanPrefix}${createStableDigits(seed, 9)}`);
}

export function getProductEan13Value(product: Product) {
  const storedEan13 = normalizeEan13Input(product.sku);
  if (isValidEan13(storedEan13)) {
    return storedEan13;
  }

  return createInternalEan13FromId(product.id);
}

export function findProductByEan13(products: Product[], value: string) {
  const ean13Value = normalizeEan13Input(value);

  if (!isValidEan13(ean13Value)) {
    return null;
  }

  return (
    products.find((product) => getProductEan13Value(product) === ean13Value) ??
    products.find((product) => normalizeEan13Input(product.sku) === ean13Value) ??
    null
  );
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getEan13Pattern(value: string) {
  const code = isValidEan13(value) ? normalizeEan13Input(value) : createEan13(value);
  const parity = eanParityPatterns[code[0]];
  const leftDigits = code.slice(1, 7);
  const rightDigits = code.slice(7);
  const leftPattern = Array.from(leftDigits)
    .map((digit, index) =>
      parity[index] === "O" ? eanLeftOddPatterns[digit] : eanLeftEvenPatterns[digit]
    )
    .join("");
  const rightPattern = Array.from(rightDigits)
    .map((digit) => eanRightPatterns[digit])
    .join("");

  return `101${leftPattern}01010${rightPattern}101`;
}

export function getEan13Bars(value: string, moduleWidth = 2) {
  const pattern = getEan13Pattern(value);
  const bars: Array<{ x: number; width: number }> = [];
  let currentBar: { x: number; width: number } | null = null;

  Array.from(pattern).forEach((bit, index) => {
    const x = index * moduleWidth;

    if (bit === "1" && currentBar) {
      currentBar.width += moduleWidth;
      return;
    }

    if (bit === "1") {
      currentBar = { x, width: moduleWidth };
      bars.push(currentBar);
      return;
    }

    currentBar = null;
  });

  return { bars, height: 70, width: pattern.length * moduleWidth };
}

export function createEan13SvgMarkup(value: string) {
  const code = isValidEan13(value) ? normalizeEan13Input(value) : createEan13(value);
  const quietZone = 18;
  const ean13 = getEan13Bars(code);
  const width = ean13.width + quietZone * 2;
  const rects = ean13.bars
    .map((bar) => `<rect x="${bar.x + quietZone}" y="0" width="${bar.width}" height="${ean13.height}" />`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="EAN-13 ${escapeHtml(
    code
  )}" viewBox="0 0 ${width} ${ean13.height}" preserveAspectRatio="none"><rect width="${width}" height="${
    ean13.height
  }" fill="#fff"/>${rects}</svg>`;
}
