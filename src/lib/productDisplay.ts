import type { Product } from "../types";

export type ExpiryStatus = "expired" | "soon" | "valid";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dayMs = 1000 * 60 * 60 * 24;
const expiringSoonWindowMs = dayMs * 60;

const code128Patterns = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112",
];

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

function normalizeBarcodeText(value?: string | null) {
  return (value ?? "")
    .trim()
    .replace(/[^\x20-\x7F]/g, "")
    .slice(0, 48);
}

export function normalizeBarcodeValue(value?: string | null) {
  return normalizeBarcodeText(value).toLowerCase();
}

export function getProductBarcodeValue(product: Product) {
  const sku = normalizeBarcodeText(product.sku);
  if (sku) {
    return sku;
  }

  const idCode = product.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toUpperCase();
  return `HA${idCode || "000000000000"}`;
}

export function findProductByBarcode(products: Product[], value: string) {
  const barcodeValue = normalizeBarcodeValue(value);

  if (!barcodeValue) {
    return null;
  }

  return (
    products.find((product) => normalizeBarcodeValue(getProductBarcodeValue(product)) === barcodeValue) ??
    products.find((product) => normalizeBarcodeValue(product.sku) === barcodeValue) ??
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

export function getCode128Bars(value: string, moduleWidth = 2) {
  const text = normalizeBarcodeText(value) || "HA000000000000";
  const codes = [104, ...Array.from(text).map((char) => char.charCodeAt(0) - 32)];
  const checksum =
    codes[0] +
    codes.slice(1).reduce((sum, code, index) => sum + code * (index + 1), 0);

  codes.push(checksum % 103, 106);

  const bars: Array<{ x: number; width: number }> = [];
  let x = 0;

  codes.forEach((code) => {
    const pattern = code128Patterns[code];

    Array.from(pattern).forEach((widthText, index) => {
      const width = Number(widthText) * moduleWidth;

      if (index % 2 === 0) {
        bars.push({ x, width });
      }

      x += width;
    });
  });

  return { bars, height: 70, width: x };
}

export function createCode128SvgMarkup(value: string) {
  const quietZone = 18;
  const barcode = getCode128Bars(value);
  const width = barcode.width + quietZone * 2;
  const rects = barcode.bars
    .map((bar) => `<rect x="${bar.x + quietZone}" y="0" width="${bar.width}" height="${barcode.height}" />`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Barcode ${escapeHtml(
    value
  )}" viewBox="0 0 ${width} ${barcode.height}" preserveAspectRatio="none"><rect width="${width}" height="${
    barcode.height
  }" fill="#fff"/>${rects}</svg>`;
}
