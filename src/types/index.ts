import type { Database } from "./database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type AppRole = Database["public"]["Tables"]["app_roles"]["Row"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type InventoryAudit = Database["public"]["Tables"]["inventory_audits"]["Row"];
export type InventoryAuditLine = Database["public"]["Tables"]["inventory_audit_lines"]["Row"];
export type CloudinaryImage = Database["public"]["Tables"]["cloudinary_images"]["Row"];
export type ProductBatch = Database["public"]["Tables"]["product_batches"]["Row"];
export type Customer = Database["public"]["Tables"]["customers"]["Row"];
export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItem = Database["public"]["Tables"]["order_items"]["Row"];
export type PaymentSettings = Database["public"]["Tables"]["payment_settings"]["Row"];
export type AttendanceRecord = Database["public"]["Tables"]["attendance_records"]["Row"];

export type CartProductVariant = {
  id?: string;
  image_url?: string;
  key: string;
  label: string;
  linked_values?: Record<string, string>;
  source_values?: Record<string, string>[];
  shelf_stock: number;
  stock: number;
  values: Record<string, string | string[]>;
};

export type CartItem = {
  batch?: ProductBatch | null;
  product: Product;
  quantity: number;
  variant?: CartProductVariant | null;
};
