import { createOrderCode } from "../lib/format";
import { requireSupabaseConfig, supabase } from "../lib/supabase";
import type { CartItem } from "../types";
import { productEngineClient } from "../features/products/services/client";

export type PaymentMethod = "cash" | "transfer";

export type CreateSaleInput = {
  cart: CartItem[];
  cashReceived: number;
  customerId: string | null;
  cashierId: string | null;
  note?: string | null;
  paymentMethod: PaymentMethod;
  paymentProofNote?: string | null;
  paymentProofUrl?: string | null;
  couponCode?: string | null;
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
    [/active attendance is required before checkout/i, "Bạn cần vào ca trước khi thanh toán."],
    [/cash drawer is already open/i, "Tiền két đang thuộc ca khác. Cần kết thúc ca trước khi mở ca bán hàng mới."],
    [/manager must initialize the first drawer balance/i, "Cần tài khoản quản lý xác nhận số tiền két đầu tiên."],
    [/opening cash does not match the previous handover balance/i, "Tiền két đã xác nhận không khớp số bàn giao của ca trước."],
    [/permission denied for order discount/i, "Tài khoản không có quyền áp dụng giảm giá."],
    [/order discounts are disabled/i, "Chức năng giảm giá đã được tắt."],
    [/customer is required to redeem rewards/i, "Cần chọn khách hàng để đổi quà."],
    [/insufficient customer points/i, "Khách hàng không đủ điểm để đổi quà."],
    [/reward product has invalid points cost/i, "Quà chưa được cấu hình số điểm hợp lệ."],
    [/insufficient stock for selected date/i, "Số lượng trong lô đã chọn không còn đủ."],
    [/insufficient stock for product/i, "Tồn kho sản phẩm không còn đủ để thanh toán."],
    [/insufficient shelf stock for selected date/i, "Tồn kho của lô đã chọn không còn đủ."],
    [/product variant selection is required/i, "Cần chọn biến thể trước khi thanh toán."],
    [/selected product variant is not available/i, "Biến thể đã chọn không còn tồn tại."],
    [/insufficient shelf stock for selected product variant/i, "Tồn kho của SKU đã chọn không còn đủ."],
    [/insufficient shelf stock for product/i, "Tồn kho sản phẩm không còn đủ."],
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
  note,
  paymentMethod,
  paymentProofNote,
  paymentProofUrl,
  couponCode,
}: CreateSaleInput) {
  requireSupabaseConfig();

  if (cart.length === 0) {
    throw new Error("Giỏ hàng đang trống.");
  }

  const rpcInput = {
    cashier_id_input: cashierId,
    cash_received_input: Math.max(cashReceived, 0),
    code_input: createOrderCode(),
    customer_id_input: customerId,
    discount_input: 0,
    items_input: cart.map((item) => ({
      batch_id: null,
      product_id: item.product.id,
      variant_id:
        item.variant?.id ??
        item.variant?.linked_values?._variant_id ??
        (item.product.attributes && typeof item.product.attributes === "object" && !Array.isArray(item.product.attributes)
          ? String(item.product.attributes._defaultVariantId ?? "") || null
          : null),
      quantity: item.quantity,
      variant_key: item.variant?.key ?? null,
      variant_label: item.variant?.label ?? null,
      variant_values: item.variant?.values ?? null,
      variant_source_values: item.variant?.source_values ?? null,
      coupon_code: couponCode?.trim() || null,
    })),
    note_input: note ?? null,
    payment_method_input: paymentMethod,
    payment_proof_note_input: paymentProofNote ?? null,
    payment_proof_url_input: paymentProofUrl ?? null,
  };

  const result = await supabase.rpc("create_pos_order", rpcInput);

  if (result.error) {
    throw toOrderError(result.error);
  }

  if (!result.data) {
    throw new Error("Supabase không trả về hóa đơn sau khi thanh toán.");
  }

  window.dispatchEvent(new Event("pos-financial-sync"));
  try { window.localStorage.setItem("pos-financial-sync", String(Date.now())); } catch { /* Storage may be unavailable in private mode. */ }

  return result.data;
}

export async function fetchOrders() {
  requireSupabaseConfig();

  try {
    const [ordersResult, itemsResult, customersResult] = await Promise.all([
      productEngineClient.from("orders").select("*").order("created_at", { ascending: false }),
      productEngineClient.from("order_items").select("*"),
      productEngineClient.from("customers").select("id,name,phone,address,points"),
    ]);
    if (ordersResult.error) throw ordersResult.error;
    if (itemsResult.error) throw itemsResult.error;
    if (customersResult.error) throw customersResult.error;
    return (ordersResult.data ?? []).map((order) => ({
      ...order,
      customers: (customersResult.data ?? []).find((customer) => customer.id === order.customer_id) ?? null,
      order_items: (itemsResult.data ?? []).filter((item) => item.order_id === order.id).map((item) => ({
        ...item,
        variant_key: item.variant_id ?? null,
        variant_label: item.variant_name ?? null,
        variant_values: item.selected_values ?? null,
        variant_source_values: null,
      })),
    })) as unknown as Awaited<ReturnType<typeof fetchLegacyOrders>>;
  } catch (engineError) {
    if (!(engineError instanceof Error) || !/selected_values|variant_name|schema cache|does not exist/i.test(engineError.message)) throw engineError;
  }

  return fetchLegacyOrders();
}

async function fetchLegacyOrders() {
  requireSupabaseConfig();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "*, customers(name, phone, address, points), order_items(id, product_id, batch_id, import_date, expiry_date, product_name, variant_key, variant_label, variant_values, variant_source_values, quantity, unit_price, line_total, reward_points_cost, created_at)"
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
