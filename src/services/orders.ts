import { createOrderCode } from "../lib/format";
import { requireSupabaseConfig, supabase } from "../lib/supabase";
import { ensureCashDrawerSessionForCheckout } from "./cashManagement";
import type { CartItem } from "../types";

export type PaymentMethod = "cash" | "transfer";

export type CreateSaleInput = {
  cart: CartItem[];
  cashReceived: number;
  customerId: string | null;
  cashierId: string | null;
  discount: number;
  note?: string | null;
  paymentMethod: PaymentMethod;
  paymentProofNote?: string | null;
  paymentProofUrl?: string | null;
};

function readOrderErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = String(error.message ?? "").trim();
    if (message) {
      return message;
    }
  }

  return "Tạo hóa đơn thất bại.";
}

function toOrderError(error: unknown) {
  const message = readOrderErrorMessage(error);
  const translations: Array<[RegExp, string]> = [
    [
      /open a cash drawer session before checkout/i,
      "Chưa có phiên tiền két đang mở. Hãy chấm công và xác nhận tiền két trước khi thanh toán.",
    ],
    [/cash drawer is already open/i, "Tiền két đang thuộc ca khác. Cần kết thúc ca trước khi mở ca bán hàng mới."],
    [/manager must initialize the first drawer balance/i, "Cần tài khoản quản lý xác nhận số tiền két đầu tiên."],
    [/opening cash does not match the previous handover balance/i, "Tiền két đã xác nhận không khớp số bàn giao của ca trước."],
    [/permission denied for order discount/i, "Tài khoản không có quyền áp dụng giảm giá."],
    [/insufficient stock for selected date/i, "Số lượng trong lô đã chọn không còn đủ."],
    [/insufficient stock for product/i, "Tồn kho sản phẩm không còn đủ để thanh toán."],
    [/cash received is lower than total/i, "Số tiền khách đưa chưa đủ để thanh toán."],
  ];
  const translated = translations.find(([pattern]) => pattern.test(message))?.[1] ?? message;
  return new Error(translated);
}

export async function createSale({
  cart,
  cashReceived,
  cashierId,
  customerId,
  discount,
  note,
  paymentMethod,
  paymentProofNote,
  paymentProofUrl,
}: CreateSaleInput) {
  requireSupabaseConfig();

  if (cart.length === 0) {
    throw new Error("Giỏ hàng đang trống.");
  }

  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const safeDiscount = Math.min(Math.max(discount, 0), subtotal);

  const rpcInput = {
    cashier_id_input: cashierId,
    cash_received_input: Math.max(cashReceived, 0),
    code_input: createOrderCode(),
    customer_id_input: customerId,
    discount_input: safeDiscount,
    items_input: cart.map((item) => ({
      batch_id: item.batch?.id ?? null,
      product_id: item.product.id,
      quantity: item.quantity,
    })),
    note_input: note ?? null,
    payment_method_input: paymentMethod,
    payment_proof_note_input: paymentProofNote ?? null,
    payment_proof_url_input: paymentProofUrl ?? null,
  };

  let result = await supabase.rpc("create_pos_order", rpcInput);

  if (result.error && /open a cash drawer session before checkout/i.test(readOrderErrorMessage(result.error))) {
    try {
      await ensureCashDrawerSessionForCheckout();
      result = await supabase.rpc("create_pos_order", rpcInput);
    } catch (drawerError) {
      throw toOrderError(drawerError);
    }
  }

  if (result.error) {
    throw toOrderError(result.error);
  }

  if (!result.data) {
    throw new Error("Supabase không trả về hóa đơn sau khi thanh toán.");
  }

  return result.data;
}

export async function fetchOrders() {
  requireSupabaseConfig();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "*, customers(name, phone, address), order_items(id, product_id, batch_id, import_date, expiry_date, product_name, quantity, unit_price, line_total, created_at)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function cancelOrder(orderId: string, reason: string) {
  requireSupabaseConfig();

  const { data, error } = await supabase.rpc("cancel_pos_order", {
    order_id_input: orderId,
    reason_input: reason.trim(),
  });

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Không nhận được kết quả hủy hóa đơn.");
  }

  return data;
}

export async function deleteOrders(orderIds: string[], reason: string) {
  requireSupabaseConfig();

  if (orderIds.length === 0) {
    return 0;
  }

  const { data, error } = await supabase.rpc("delete_pos_orders", {
    order_ids_input: orderIds,
    reason_input: reason.trim(),
  });

  if (error) {
    throw error;
  }

  return Number(data ?? 0);
}

export async function recordOrderPrint(orderId: string) {
  requireSupabaseConfig();

  const { data, error } = await supabase.rpc("record_order_print", {
    order_id_input: orderId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export type OrderWithItems = Awaited<ReturnType<typeof fetchOrders>>[number];
