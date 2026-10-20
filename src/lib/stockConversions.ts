import type { Product } from "../features/products/types";
import { getActiveProductModeVariants } from "../features/products/utils/variants";

export const MAX_STOCK_QUANTITY = 2_147_483_647;

export function createStockConversionRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("Trình duyệt không hỗ trợ tạo mã quy đổi. Hãy cập nhật trình duyệt rồi thử lại.");
  }
  // randomUUID is unavailable on some HTTP/LAN origins; getRandomValues still works.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getStockConversionProductImage(product: Product) {
  const activeVariants = getActiveProductModeVariants(product);
  const lowestPrice = Math.min(...activeVariants.map((variant) => variant.base_price));
  return product.images.find((image) => image.is_primary && image.image_url)?.image_url
    || product.images.find((image) => image.image_url)?.image_url
    || activeVariants.find((variant) => variant.base_price === lowestPrice)?.image_url
    || activeVariants.find((variant) => variant.image_url)?.image_url
    || null;
}

export function getConversionQuantity(quantity: number, sourceRatio: number, targetRatio: number) {
  if (![quantity, sourceRatio, targetRatio].every((value) => Number.isSafeInteger(value) && value > 0 && value <= MAX_STOCK_QUANTITY)) return null;
  if (quantity % sourceRatio !== 0) return null;
  const received = quantity / sourceRatio * targetRatio;
  return Number.isSafeInteger(received) && received <= MAX_STOCK_QUANTITY ? received : null;
}
