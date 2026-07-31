import type { CartItem, Customer, Order } from "../types";

type ReceiptInput = {
  customer: Customer | null;
  items: CartItem[];
  order: Order;
};

type SavedReceiptInput = {
  customer: { address?: string | null; name: string; phone: string | null } | null;
  items: Array<{ product_name: string; quantity: number; unit_price: number }>;
  order: Order;
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
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function printPosReceipt({ customer, items, order }: ReceiptInput) {
  const rows = items
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.product.name)}</td>
        <td class="number">${item.quantity}</td>
        <td class="number">${money(item.product.price)}</td>
        <td class="number">${money(item.product.price * item.quantity)}</td>
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
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { width: 72mm; margin: 0 auto; color: #111; font: 12px/1.35 Arial, sans-serif; }
  .center { text-align: center; }
  .brand { margin: 0; font-size: 23px; font-weight: 900; letter-spacing: .5px; }
  .subtitle { margin: 2px 0; font-size: 11px; }
  h2 { margin: 8px 0 4px; font-size: 17px; text-align: center; }
  .meta { margin: 7px 0; }
  .meta div, .total div { display: flex; justify-content: space-between; gap: 8px; }
  .meta span:first-child { flex: none; }
  .meta b, .meta span:last-child { text-align: right; overflow-wrap: anywhere; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #333; padding: 3px 2px; vertical-align: top; }
  th { font-size: 10px; }
  th:first-child { width: 38%; }
  th:nth-child(2) { width: 10%; }
  th:nth-child(3), th:nth-child(4) { width: 26%; }
  .number { text-align: right; }
  .total { padding: 5px 0; border-bottom: 1px dashed #555; font-size: 12px; }
  .total .grand { margin-top: 3px; font-size: 16px; font-weight: 900; }
  .note { min-height: 28px; padding: 5px 0; border-bottom: 1px dashed #555; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 8px; text-align: center; }
  .signatures div { min-height: 55px; }
  .thanks { margin: 8px 0 0; font-size: 11px; font-style: italic; text-align: center; }
</style></head><body>
  <header class="center">
    <p class="brand">HOÀNG AN</p>
    <p class="subtitle">HÓA ĐƠN BÁN HÀNG</p>
  </header>
  <h2>HÓA ĐƠN BÁN HÀNG</h2>
  <section class="meta">
    <div><span>Mã HĐ:</span><b>${escapeHtml(order.code)}</b></div>
    <div><span>Ngày:</span><span>${dateTime(order.created_at)}</span></div>
    <div><span>Khách hàng:</span><b>${escapeHtml(customer?.name ?? "Khách lẻ")}</b></div>
    <div><span>Số ĐT:</span><span>${escapeHtml(customer?.phone ?? "—")}</span></div>
    <div><span>Địa chỉ:</span><span>${escapeHtml(customer?.address ?? "—")}</span></div>
  </section>
  <table>
    <thead><tr><th>Tên hàng hóa</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <section class="total">
    <div><span>Tổng cộng</span><b>${money(order.subtotal)}đ</b></div>
    ${order.discount > 0 ? `<div><span>Giảm giá</span><b>-${money(order.discount)}đ</b></div>` : ""}
    <div class="grand"><span>Thanh toán</span><b>${money(order.total)}đ</b></div>
    <div><span>Khách đưa</span><b>${money(order.cash_received)}đ</b></div>
    <div><span>Tiền thừa</span><b>${money(order.change_amount)}đ</b></div>
  </section>
  <div class="note"><b>Ghi chú:</b> ${escapeHtml(order.note ?? "")}</div>
  <div class="signatures"><div>Khách hàng ký</div><div>Người bán hàng</div></div>
  <p class="thanks">Cảm ơn quý khách và hẹn gặp lại!</p>
</body></html>`);
  receiptDocument.close();

  window.setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1_000);
  }, 200);
}

export function printSavedReceipt({ customer, items, order }: SavedReceiptInput) {
  printPosReceipt({
    customer: customer as Customer | null,
    items: items.map((item) => ({
      product: {
        name: item.product_name,
        price: item.unit_price,
      },
      quantity: item.quantity,
    })) as unknown as CartItem[],
    order,
  });
}
