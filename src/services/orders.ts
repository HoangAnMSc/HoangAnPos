import { createOrderCode } from "../lib/format";
import { requireSupabaseConfig, supabase } from "../lib/supabase";
import type { CartItem } from "../types";

export type CreateSaleInput = {
  cart: CartItem[];
  customerId: string | null;
  cashierId: string | null;
  discount: number;
};

export async function createSale({ cart, cashierId, customerId, discount }: CreateSaleInput) {
  requireSupabaseConfig();

  if (cart.length === 0) {
    throw new Error("Giỏ hàng đang trống.");
  }

  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const safeDiscount = Math.min(Math.max(discount, 0), subtotal);

  const { data: order, error } = await supabase.rpc("create_pos_order", {
    cashier_id_input: cashierId,
    code_input: createOrderCode(),
    customer_id_input: customerId,
    discount_input: safeDiscount,
    items_input: cart.map((item) => ({
      product_id: item.product.id,
      quantity: item.quantity,
    })),
  });

  if (error) {
    throw error;
  }

  if (!order) {
    throw new Error("Supabase không trả về hóa đơn sau khi thanh toán.");
  }

  return order;
}
