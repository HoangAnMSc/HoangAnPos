import { requireSupabaseConfig, supabase } from "../lib/supabase";
import { productEngineClient } from "../features/products/services/client";

export type CustomerPurchaseHistoryItem = {
  id: string;
  imageUrl: string | null;
  lineTotal: number;
  productName: string;
  quantity: number;
  sku: string | null;
  unitPrice: number;
  variantLabel: string | null;
};

export type CustomerPurchaseHistoryOrder = {
  cashReceived: number;
  changeAmount: number;
  code: string;
  createdAt: string;
  discount: number;
  id: string;
  items: CustomerPurchaseHistoryItem[];
  note: string | null;
  paymentMethod: "cash" | "transfer";
  pointsEarned: number;
  pointsRedeemed: number;
  status: "paid" | "cancelled";
  subtotal: number;
  total: number;
};

export type CustomerInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  note?: string | null;
  points?: number;
};

export async function fetchCustomers() {
  requireSupabaseConfig();

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchCustomerPurchaseHistory(
  customerId: string,
): Promise<CustomerPurchaseHistoryOrder[]> {
  requireSupabaseConfig();

  const ordersResult = await productEngineClient
    .from("orders")
    .select("*")
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (ordersResult.error) throw ordersResult.error;

  const orders = (ordersResult.data ?? []) as Array<Record<string, unknown>>;
  const orderIds = orders.map((order) => String(order.id));
  if (!orderIds.length) return [];

  const itemsResult = await productEngineClient
    .from("order_items")
    .select("*")
    .in("order_id", orderIds);
  if (itemsResult.error) throw itemsResult.error;
  const items = (itemsResult.data ?? []) as Array<Record<string, unknown>>;
  const productIds = [...new Set(items.map((item) => String(item.product_id ?? "")).filter(Boolean))];
  const variantIds = [...new Set(items.map((item) => String(item.variant_id ?? "")).filter(Boolean))];

  const [imagesResult, variantsResult] = await Promise.all([
    productIds.length
      ? productEngineClient.from("product_images").select("*").in("product_id", productIds)
      : Promise.resolve({ data: [], error: null }),
    variantIds.length
      ? productEngineClient.from("product_variants").select("*").in("id", variantIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (imagesResult.error) throw imagesResult.error;
  if (variantsResult.error) throw variantsResult.error;

  const images = (imagesResult.data ?? []) as Array<Record<string, unknown>>;
  const variants = (variantsResult.data ?? []) as Array<Record<string, unknown>>;
  const variantsById = new Map(variants.map((variant) => [String(variant.id), variant]));

  function getItemImage(item: Record<string, unknown>) {
    const productId = String(item.product_id ?? "");
    const variantId = String(item.variant_id ?? "");
    const exactImage = images.find(
      (image) =>
        String(image.product_id ?? "") === productId &&
        String(image.variant_id ?? "") === variantId,
    );
    const productImages = images.filter(
      (image) => String(image.product_id ?? "") === productId,
    );
    const primaryImage =
      productImages.find((image) => image.is_primary === true) ?? productImages[0];
    return String(exactImage?.image_url ?? primaryImage?.image_url ?? "") || null;
  }

  return orders.map((order) => ({
    cashReceived: Number(order.cash_received ?? 0) || 0,
    changeAmount: Number(order.change_amount ?? 0) || 0,
    code: String(order.code ?? "Đơn hàng"),
    createdAt: String(order.created_at ?? ""),
    discount: Number(order.discount ?? 0) || 0,
    id: String(order.id),
    items: items
      .filter((item) => String(item.order_id) === String(order.id))
      .map((item) => {
        const variant = variantsById.get(String(item.variant_id ?? ""));
        const unitPrice = Number(item.final_price ?? item.unit_price ?? 0) || 0;
        const quantity = Number(item.quantity ?? 0) || 0;
        return {
          id: String(item.id),
          imageUrl: getItemImage(item),
          lineTotal: Number(item.line_total ?? unitPrice * quantity) || 0,
          productName: String(item.product_name ?? "Sản phẩm"),
          quantity,
          sku: String(item.sku ?? variant?.sku ?? "") || null,
          unitPrice,
          variantLabel:
            String(item.variant_name ?? item.variant_label ?? "") || null,
        };
      }),
    note: String(order.note ?? "") || null,
    paymentMethod: order.payment_method === "transfer" ? "transfer" : "cash",
    pointsEarned: Number(order.points_earned ?? 0) || 0,
    pointsRedeemed: Number(order.points_redeemed ?? 0) || 0,
    status: order.status === "cancelled" ? "cancelled" : "paid",
    subtotal: Number(order.subtotal ?? order.total ?? 0) || 0,
    total: Number(order.total ?? 0) || 0,
  }));
}

export async function createCustomer(input: CustomerInput) {
  requireSupabaseConfig();

  const { data, error } = await supabase.from("customers").insert(input).select("*").single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateCustomer(id: string, input: CustomerInput) {
  requireSupabaseConfig();

  const { data, error } = await supabase
    .from("customers")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteCustomer(id: string) {
  requireSupabaseConfig();

  const { error } = await supabase.from("customers").delete().eq("id", id);

  if (error) {
    throw error;
  }
}
