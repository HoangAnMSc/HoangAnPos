export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: string;
          role_id: string | null;
          is_active: boolean;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: "admin" | "staff" | string;
          role_id?: string | null;
          is_active?: boolean;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          role?: "admin" | "staff" | string;
          role_id?: string | null;
          is_active?: boolean;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "app_roles";
            referencedColumns: ["id"];
          }
        ];
      };
      app_roles: {
        Row: {
          id: string;
          name: string;
          code: string;
          description: string | null;
          permissions: string[];
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code: string;
          description?: string | null;
          permissions?: string[];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          code?: string;
          description?: string | null;
          permissions?: string[];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          name: string;
          sku: string | null;
          category: string | null;
          description: string | null;
          price: number;
          cost_price: number;
          import_date: string | null;
          expiry_date: string | null;
          stock: number;
          image_url: string | null;
          is_active: boolean;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          sku?: string | null;
          category?: string | null;
          description?: string | null;
          price: number;
          cost_price?: number;
          import_date?: string | null;
          expiry_date?: string | null;
          stock?: number;
          image_url?: string | null;
          is_active?: boolean;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          sku?: string | null;
          category?: string | null;
          description?: string | null;
          price?: number;
          cost_price?: number;
          import_date?: string | null;
          expiry_date?: string | null;
          stock?: number;
          image_url?: string | null;
          is_active?: boolean;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cloudinary_images: {
        Row: {
          id: string;
          url: string;
          public_id: string | null;
          folder: string | null;
          delete_token: string | null;
          delete_token_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          url: string;
          public_id?: string | null;
          folder?: string | null;
          delete_token?: string | null;
          delete_token_expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          url?: string;
          public_id?: string | null;
          folder?: string | null;
          delete_token?: string | null;
          delete_token_expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_categories: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_batches: {
        Row: {
          id: string;
          product_id: string;
          quantity: number;
          import_date: string | null;
          expiry_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          quantity: number;
          import_date?: string | null;
          expiry_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          quantity?: number;
          import_date?: string | null;
          expiry_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_batches_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      customers: {
        Row: {
          id: string;
          name: string;
          phone: string | null;
          email: string | null;
          address: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          code: string;
          customer_id: string | null;
          cashier_id: string | null;
          subtotal: number;
          discount: number;
          total: number;
          payment_method: "cash" | "transfer";
          cash_received: number;
          change_amount: number;
          payment_proof_url: string | null;
          payment_proof_note: string | null;
          note: string | null;
          status: "paid" | "cancelled";
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          customer_id?: string | null;
          cashier_id?: string | null;
          subtotal: number;
          discount?: number;
          total: number;
          payment_method?: "cash" | "transfer";
          cash_received?: number;
          change_amount?: number;
          payment_proof_url?: string | null;
          payment_proof_note?: string | null;
          note?: string | null;
          status?: "paid" | "cancelled";
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          customer_id?: string | null;
          cashier_id?: string | null;
          subtotal?: number;
          discount?: number;
          total?: number;
          payment_method?: "cash" | "transfer";
          cash_received?: number;
          change_amount?: number;
          payment_proof_url?: string | null;
          payment_proof_note?: string | null;
          note?: string | null;
          status?: "paid" | "cancelled";
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_cashier_id_fkey";
            columns: ["cashier_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          }
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          batch_id: string | null;
          import_date: string | null;
          expiry_date: string | null;
          product_name: string;
          quantity: number;
          unit_price: number;
          line_total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          batch_id?: string | null;
          import_date?: string | null;
          expiry_date?: string | null;
          product_name: string;
          quantity: number;
          unit_price: number;
          line_total: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          batch_id?: string | null;
          import_date?: string | null;
          expiry_date?: string | null;
          product_name?: string;
          quantity?: number;
          unit_price?: number;
          line_total?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "product_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      payment_settings: {
        Row: {
          id: boolean;
          transfer_note: string | null;
          transfer_qr_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          transfer_note?: string | null;
          transfer_qr_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          transfer_note?: string | null;
          transfer_qr_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_pos_order: {
        Args: {
          cashier_id_input: string | null;
          cash_received_input: number;
          code_input: string;
          customer_id_input: string | null;
          discount_input: number;
          items_input: Json;
          note_input: string | null;
          payment_method_input: "cash" | "transfer";
          payment_proof_note_input: string | null;
          payment_proof_url_input: string | null;
        };
        Returns: {
          id: string;
          code: string;
          customer_id: string | null;
          cashier_id: string | null;
          subtotal: number;
          discount: number;
          total: number;
          payment_method: "cash" | "transfer";
          cash_received: number;
          change_amount: number;
          payment_proof_note: string | null;
          payment_proof_url: string | null;
          note: string | null;
          status: "paid" | "cancelled";
          created_at: string;
        };
      };
      decrement_product_stock: {
        Args: {
          product_id_input: string;
          quantity_input: number;
        };
        Returns: void;
      };
      receive_product_stock: {
        Args: {
          product_id_input: string;
          quantity_input: number;
          import_date_input: string | null;
          expiry_date_input: string | null;
        };
        Returns: {
          id: string;
          product_id: string;
          quantity: number;
          import_date: string | null;
          expiry_date: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      set_app_role_active: {
        Args: {
          role_id_input: string;
          is_active_input: boolean;
        };
        Returns: {
          id: string;
          name: string;
          code: string;
          description: string | null;
          permissions: string[];
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      touch_last_seen: {
        Args: Record<string, never>;
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
