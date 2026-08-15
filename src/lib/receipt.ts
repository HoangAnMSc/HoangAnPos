import type { CartItem, Customer, Order } from "../types";

type ReceiptInput = {
  customer: Customer | null;
  items: CartItem[];
  order: Order;
  pointsBalance?: number | null;
  paperSize?: ReceiptPaperSize;
  promotions?: ReceiptPromotion[];
};

export type ReceiptPromotion = {
  name: string;
  discount_amount: number;
};

export type ReceiptPaperSize = "58mm" | "80mm";
const receiptPaperStorageKey = "hoang-an-pos:receipt-paper-size";

export function getReceiptPaperSize(): ReceiptPaperSize {
  if (typeof window === "undefined") return "80mm";
  return window.localStorage.getItem(receiptPaperStorageKey) === "58mm" ? "58mm" : "80mm";
}

export function saveReceiptPaperSize(size: ReceiptPaperSize) {
  window.localStorage.setItem(receiptPaperStorageKey, size);
}

type SavedReceiptInput = {
  customer: { address?: string | null; name: string; phone: string | null; points?: number } | null;
  items: Array<{ product_name: string; variant_label?: string | null; quantity: number; unit_price: number; reward_points_cost?: number }>;
  order: Order;
  promotions?: ReceiptPromotion[];
};

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function dateTime(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");

  return `${pad(date.getHours())}:${pad(date.getMinutes())} · ${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}

export function printPosReceipt({ customer, items, order, paperSize = getReceiptPaperSize(), pointsBalance, promotions = [] }: ReceiptInput) {
  const isCompact = paperSize === "58mm";
  const pageMargin = isCompact ? "3mm" : "4mm";
  const bodyWidth = isCompact ? "52mm" : "72mm";
  const customerPointsBalance = pointsBalance ?? (
    customer ? Math.max(customer.points - order.points_redeemed + order.points_earned, 0) : null
  );
  const totalItemQuantity = items.reduce(
    (sum, item) => sum + Math.max(Number(item.quantity) || 0, 0),
    0,
  );
  const printedAt = new Date().toISOString();
  const rows = items
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.product.name)}${item.variant?.label ? `<br><small>${escapeHtml(item.variant.label)}</small>` : ""}</td>
        <td class="number">${item.quantity}</td>
        <td class="number">${item.product.is_reward && order.points_redeemed > 0 ? `${money(item.product.reward_points_cost)} điểm` : money(item.product.price)}</td>
        <td class="number">${item.product.is_reward && order.points_redeemed > 0 ? `${money(item.product.reward_points_cost * item.quantity)} điểm` : money(item.product.price * item.quantity)}</td>
      </tr>`
    )
    .join("");
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);
  const receiptDocument = frame.contentDocument;

  if (!receiptDocument) {
    frame.remove();
    return;
  }

  receiptDocument.open();
  receiptDocument.write(`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(order.code)}</title>
<style>
  @page { size: ${paperSize} auto; margin: ${pageMargin}; }
  * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
  body { width: ${bodyWidth}; margin: 0 auto; color: #111; font-size: ${isCompact ? "10px" : "12px"}; line-height: 1.35; }
  .center { text-align: center; }
  .brand { margin: 0; font-size: 11px; font-weight: 700; letter-spacing: .2px; }
  .store-phone { margin: 2px 0 0; font-size: 10px; font-weight: 700; }
  .print-count { margin: 0 0 6px; font-size: 10px; font-weight: 700; text-align: center; }
  h2 { margin: 5px 0 4px; font-size: ${isCompact ? "14px" : "17px"}; text-align: center; }
  .meta { margin: 7px 0; }
  .meta div, .total div { display: flex; justify-content: space-between; gap: 8px; }
  .meta span:first-child { flex: none; }
  .meta b, .meta span:last-child { text-align: right; overflow-wrap: anywhere; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #333; padding: 3px 2px; vertical-align: top; }
  th { font-size: ${isCompact ? "8px" : "10px"}; }
  th:first-child { width: 38%; }
  th:nth-child(2) { width: 10%; }
  th:nth-child(3), th:nth-child(4) { width: 26%; }
  .number { text-align: right; }
  th:nth-child(2), td:nth-child(2) { text-align: center; }
  .total { padding: 5px 0; border-bottom: 1px dashed #555; font-size: 12px; }
  .total .grand { margin-top: 3px; font-size: 16px; font-weight: 900; }
  .note { min-height: 34px; padding: 6px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .note b { display: block; margin-bottom: 2px; }
  .thanks { margin: 7px 0 0; padding-top: 6px; border-top: 1px dashed #555; font-size: 11px; font-weight: 700; text-align: center; }
</style></head><body>
  <header class="center">
    <p class="brand">HKD SỮA TÃ BABYBOO</p>
    <p class="store-phone">Số điện thoại: 0362791662</p>
  </header>
  <h2>HÓA ĐƠN TẠM TÍNH</h2>
  <p class="print-count">In lần ${Math.max(Number(order.print_count) || 1, 1)}</p>
  <section class="meta">
    <div><span>Mã HĐ:</span><b>${escapeHtml(order.code)}</b></div>
    <div><span>Giờ in:</span><span>${dateTime(printedAt)}</span></div>
    <div><span>Người lên đơn:</span><b>${escapeHtml(order.cashier_name ?? "Nhân viên")}</b></div>
  </section>
  <table>
    <thead><tr><th>Tên hàng hóa</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <section class="total">
    <div><span>Tổng cộng (${money(totalItemQuantity)} món)</span><b>${money(order.subtotal)}đ</b></div>
    ${promotions.filter((promotion) => promotion.discount_amount > 0).map((promotion) => `<div><span>${escapeHtml(promotion.name)}</span><b>-${money(promotion.discount_amount)}đ</b></div>`).join("")}
    ${order.discount > 0 && !promotions.length ? `<div><span>Khuyến mãi</span><b>-${money(order.discount)}đ</b></div>` : ""}
    <div class="grand"><span>TỔNG TẠM TÍNH</span><b>${money(order.total)}đ</b></div>
    <div><span>Khách đưa</span><b>${money(order.cash_received)}đ</b></div>
    <div><span>Thối lại</span><b>${money(order.change_amount)}đ</b></div>
    <div><span>Khách hàng</span><b>${escapeHtml(customer?.name ?? "Khách lẻ")}</b></div>
    ${order.points_redeemed > 0 ? `<div><span>Điểm đổi quà</span><b>-${money(order.points_redeemed)} điểm</b></div>` : ""}
    ${order.points_earned > 0 ? `<div><span>Điểm tích lũy</span><b>+${money(order.points_earned)} điểm</b></div>` : ""}
    ${customerPointsBalance !== null ? `<div><span>Điểm hiện có</span><b>${money(customerPointsBalance)} điểm</b></div>` : ""}
  </section>
  <div class="note"><b>Ghi chú:</b>${escapeHtml(order.note?.trim() || "—")}</div>
  <p class="thanks">Cảm ơn và hẹn gặp lại quý khách</p>
</body></html>`);
  receiptDocument.close();

  window.setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1_000);
  }, 200);
}

export function printSavedReceipt({ customer, items, order, promotions = [] }: SavedReceiptInput) {
  printPosReceipt({
    customer: customer as Customer | null,
    items: items.map((item) => ({
      product: {
        is_reward: (item.reward_points_cost ?? 0) > 0,
        name: item.product_name,
        price: item.unit_price,
        reward_points_cost: item.reward_points_cost ?? 0,
      },
      quantity: item.quantity,
      variant: item.variant_label
        ? {
            key: "saved",
            label: item.variant_label,
            shelf_stock: 0,
            stock: 0,
            values: {},
          }
        : null,
    })) as unknown as CartItem[],
    order,
    promotions,
    pointsBalance: customer && "points" in customer ? Number(customer.points) : null,
  });
}
