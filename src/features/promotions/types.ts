import type { Json } from "../../types/database";

export type PromotionTrigger = "automatic" | "coupon";
export type DiscountType = "percentage" | "fixed_amount" | "free_shipping";
export type PromotionCondition = {
  id?: string;
  condition_type: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in";
  value: Json;
  group_id?: string | null;
};
export type PromotionScope = {
  id?: string;
  scope_type: "all" | "category" | "product" | "variant";
  scope_id: string | null;
};
export type Promotion = {
  id: string;
  name: string;
  code: string | null;
  trigger_type: PromotionTrigger;
  discount_type: DiscountType;
  discount_value: number;
  max_discount_amount: number | null;
  start_at: string | null;
  end_at: string | null;
  total_usage_limit: number | null;
  usage_per_customer: number | null;
  priority: number;
  is_stackable: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  conditions: PromotionCondition[];
  scopes: PromotionScope[];
  usage_count?: number;
};

export type PromotionEvaluation = {
  promotion_id: string;
  name: string;
  discount_amount: number;
  free_shipping: boolean;
};
