import { createOrderCode } from "../lib/format";
import { requireSupabaseConfig, supabase } from "../lib/supabase";
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
    throw new Error("Gio hang dang trong.");
  }

  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const safeDiscount = Math.min(Math.max(discount, 0), subtotal);

  const { data: order, error } = await supabase.rpc("create_pos_order", {
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
  });

  if (error) {
    throw error;
  }

  if (!order) {
    throw new Error("Supabase khong tra ve hoa don sau khi thanh toan.");
  }

  return order;
}

export async function fetchOrders() {
  requireSupabaseConfig();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "*, customers(name, phone), order_items(id, product_id, batch_id, import_date, expiry_date, product_name, quantity, unit_price, line_total, created_at)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export type OrderWithItems = Awaited<ReturnType<typeof fetchOrders>>[number];
