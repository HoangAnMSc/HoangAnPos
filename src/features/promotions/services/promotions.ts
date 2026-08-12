import type { Json } from "../../../types/database";
import { requireSupabaseConfig } from "../../../lib/supabase";
import { productEngineClient } from "../../products/services/client";
import type { Promotion, PromotionEvaluation } from "../types";

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function fetchPromotions(): Promise<Promotion[]> {
  requireSupabaseConfig();
  const [promotions, conditions, scopes, redemptions] = await Promise.all([
    productEngineClient
      .from("promotions")
      .select("*")
      .order("created_at", { ascending: false }),
    productEngineClient.from("promotion_conditions").select("*"),
    productEngineClient.from("promotion_scopes").select("*"),
    productEngineClient.from("promotion_redemptions").select("promotion_id"),
  ]);
  const resultNames = ["chương trình", "điều kiện", "phạm vi", "lượt sử dụng"];
  [promotions, conditions, scopes, redemptions].forEach((result, index) => {
    if (result.error) {
      throw new Error(`Không tải được ${resultNames[index]} từ Supabase: ${result.error.message}`);
    }
  });
  return (
    (promotions.data ?? []) as Array<Omit<Promotion, "conditions" | "scopes">>
  ).map((promotion) => ({
    ...promotion,
    discount_value: Number(promotion.discount_value) || 0,
    max_discount_amount:
      promotion.max_discount_amount == null
        ? null
        : Number(promotion.max_discount_amount),
    conditions: (conditions.data ?? []).filter(
      (item) => item.promotion_id === promotion.id,
    ) as Promotion["conditions"],
    scopes: (scopes.data ?? []).filter(
      (item) => item.promotion_id === promotion.id,
    ) as Promotion["scopes"],
    usage_count: (redemptions.data ?? []).filter(
      (item) => item.promotion_id === promotion.id,
    ).length,
  }));
}

export async function savePromotion(
  input: Omit<Promotion, "created_at" | "updated_at" | "usage_count"> & {
    id?: string;
  },
) {
  requireSupabaseConfig();
  const { conditions, scopes, id: inputId } = input;
  // Build the persisted row explicitly. `usage_count` is a calculated field
  // attached by fetchPromotions and must never be sent to the promotions table.
  const values = {
    name: input.name,
    code: input.code,
    trigger_type: input.trigger_type,
    discount_type: input.discount_type,
    discount_value: input.discount_value,
    max_discount_amount: input.max_discount_amount,
    start_at: input.start_at,
    end_at: input.end_at,
    total_usage_limit: input.total_usage_limit,
    usage_per_customer: input.usage_per_customer,
    priority: input.priority,
    is_stackable: input.is_stackable,
    is_active: input.is_active,
  };
  const query = inputId
    ? productEngineClient.from("promotions").update(values).eq("id", inputId)
    : productEngineClient.from("promotions").insert(values);
  const { data, error } = await query.select("id").single();
  fail(error);
  if (!data) throw new Error("Supabase không trả về promotion vừa lưu.");
  const id = String(data.id);
  await Promise.all([
    productEngineClient
      .from("promotion_conditions")
      .delete()
      .eq("promotion_id", id),
    productEngineClient
      .from("promotion_scopes")
      .delete()
      .eq("promotion_id", id),
  ]);
  if (conditions.length)
    fail(
      (
        await productEngineClient
          .from("promotion_conditions")
          .insert(
            conditions.map((condition) => ({
              promotion_id: id,
              condition_type: condition.condition_type,
              operator: condition.operator,
              value: condition.value,
              group_id: condition.group_id ?? null,
            })),
          )
      ).error,
    );
  if (scopes.length)
    fail(
      (
        await productEngineClient
          .from("promotion_scopes")
          .insert(
            scopes.map((scope) => ({
              promotion_id: id,
              scope_type: scope.scope_type,
              scope_id: scope.scope_id,
            })),
          )
      ).error,
    );
  return id;
}

export async function deletePromotion(id: string) {
  requireSupabaseConfig();
  const redemptions = await productEngineClient
    .from("promotion_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("promotion_id", id);
  fail(redemptions.error);
  if ((redemptions.count ?? 0) > 0) {
    throw new Error(
      "Chương trình đã có lượt sử dụng nên không thể xóa. Hãy tạm dừng để giữ đúng lịch sử đơn hàng.",
    );
  }
  const { data, error } = await productEngineClient
    .from("promotions")
    .delete()
    .eq("id", id)
    .select("id")
    .single();
  fail(error);
  if (!data) throw new Error("Không tìm thấy chương trình hoặc bạn không có quyền xóa.");
}

export async function evaluatePromotions(
  items: Array<{
    product_id: string;
    variant_id: string;
    unit_price: number;
    quantity: number;
  }>,
  customerId?: string | null,
  couponCode?: string | null,
) {
  const { data, error } = await productEngineClient.rpc("evaluate_promotions", {
    items_input: items as unknown as Json,
    customer_id_input: customerId,
    coupon_code_input: couponCode,
  });
  fail(error);
  return (data ?? []) as PromotionEvaluation[];
}
