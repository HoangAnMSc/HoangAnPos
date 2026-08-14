import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "../../../types/database";
import { supabase } from "../../../lib/supabase";

type Table<Row extends Record<string, unknown>> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};
type BaseRow = Record<string, unknown>;

type EngineDatabase = {
  public: {
    Tables: {
      products: Table<BaseRow>;
      product_types: Table<BaseRow>;
      product_attributes: Table<BaseRow>;
      product_type_attributes: Table<BaseRow>;
      product_categories: Table<BaseRow>;
      product_specifications: Table<BaseRow>;
      product_variant_attributes: Table<BaseRow>;
      product_variant_values: Table<BaseRow>;
      product_variants: Table<BaseRow>;
      variant_value_links: Table<BaseRow>;
      product_images: Table<BaseRow>;
      product_batches: Table<BaseRow>;
      promotions: Table<BaseRow>;
      promotion_conditions: Table<BaseRow>;
      promotion_scopes: Table<BaseRow>;
      promotion_redemptions: Table<BaseRow>;
      orders: Table<BaseRow>;
      order_items: Table<BaseRow>;
      customers: Table<BaseRow>;
      inventory_audits: Table<BaseRow>;
      inventory_audit_lines: Table<BaseRow>;
      stock_movements: Table<BaseRow>;
    };
    Views: Record<string, never>;
    Functions: {
      save_product_engine: { Args: { payload: Json }; Returns: string };
      soft_delete_product: {
        Args: { product_id_input: string };
        Returns: BaseRow;
      };
      evaluate_promotions: {
        Args: {
          items_input: Json;
          customer_id_input?: string | null;
          coupon_code_input?: string | null;
        };
        Returns: Array<{
          promotion_id: string;
          name: string;
          discount_amount: number;
          free_shipping: boolean;
        }>;
      };
      adjust_variant_stock: {
        Args: {
          variant_id_input: string;
          quantity_delta_input: number;
          shelf_delta_input: number;
          reason_input?: string | null;
        };
        Returns: BaseRow;
      };
      receive_variant_stock: {
        Args: {
          variant_id_input: string;
          quantity_input: number;
          import_date_input?: string | null;
          expiry_date_input?: string | null;
        };
        Returns: BaseRow;
      };
      issue_variant_stock: {
        Args: {
          variant_id_input: string;
          quantity_input: number;
          reason_input: string;
        };
        Returns: BaseRow;
      };
      bulk_receive_variant_stock: {
        Args: { items_input: Json };
        Returns: number;
      };
      bulk_issue_variant_stock: {
        Args: { items_input: Json; reason_input: string };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export const productEngineClient = supabase as unknown as SupabaseClient<EngineDatabase>;
