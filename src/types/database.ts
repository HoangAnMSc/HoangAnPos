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
          phone: string | null;
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
          phone?: string | null;
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
          phone?: string | null;
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
          shelf_stock: number;
          image_url: string | null;
          is_active: boolean;
          is_reward: boolean;
          reward_points_cost: number;
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
          shelf_stock?: number;
          image_url?: string | null;
          is_active?: boolean;
          is_reward?: boolean;
          reward_points_cost?: number;
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
          shelf_stock?: number;
          image_url?: string | null;
          is_active?: boolean;
          is_reward?: boolean;
          reward_points_cost?: number;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stock_movements: {
        Row: {
          id: string;
          product_id: string;
          movement_type: "in" | "out" | "to_shelf" | "to_warehouse";
          quantity: number;
          reason: string | null;
          actor_id: string | null;
          actor_name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          movement_type: "in" | "out" | "to_shelf" | "to_warehouse";
          quantity: number;
          reason?: string | null;
          actor_id?: string | null;
          actor_name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          movement_type?: "in" | "out" | "to_shelf" | "to_warehouse";
          quantity?: number;
          reason?: string | null;
          actor_id?: string | null;
          actor_name?: string;
          created_at?: string;
        };
        Relationships: [{
          foreignKeyName: "stock_movements_product_id_fkey";
          columns: ["product_id"];
          isOneToOne: false;
          referencedRelation: "products";
          referencedColumns: ["id"];
        }];
      };
      inventory_audits: {
        Row: {
          id: string;
          created_by: string;
          staff_name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          created_by: string;
          staff_name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          created_by?: string;
          staff_name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      inventory_audit_lines: {
        Row: {
          id: string;
          audit_id: string;
          product_id: string | null;
          product_name: string;
          ean13: string;
          counted: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          audit_id: string;
          product_id?: string | null;
          product_name: string;
          ean13: string;
          counted: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          audit_id?: string;
          product_id?: string | null;
          product_name?: string;
          ean13?: string;
          counted?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_audit_lines_audit_id_fkey";
            columns: ["audit_id"];
            isOneToOne: false;
            referencedRelation: "inventory_audits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_audit_lines_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
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
          shelf_quantity: number;
          import_date: string | null;
          expiry_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          quantity: number;
          shelf_quantity?: number;
          import_date?: string | null;
          expiry_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          quantity?: number;
          shelf_quantity?: number;
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
          points: number;
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
          points?: number;
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
          points?: number;
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
          cash_session_id: string | null;
          cashier_id: string | null;
          cashier_name: string | null;
          subtotal: number;
          discount: number;
          total: number;
          payment_method: "cash" | "transfer";
          cash_received: number;
          change_amount: number;
          payment_proof_url: string | null;
          payment_proof_note: string | null;
          print_count: number;
          note: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          cancel_reason: string | null;
          points_earned: number;
          points_redeemed: number;
          status: "paid" | "cancelled";
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          customer_id?: string | null;
          cash_session_id?: string | null;
          cashier_id?: string | null;
          cashier_name?: string | null;
          subtotal: number;
          discount?: number;
          total: number;
          payment_method?: "cash" | "transfer";
          cash_received?: number;
          change_amount?: number;
          payment_proof_url?: string | null;
          payment_proof_note?: string | null;
          print_count?: number;
          note?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          cancel_reason?: string | null;
          points_earned?: number;
          points_redeemed?: number;
          status?: "paid" | "cancelled";
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          customer_id?: string | null;
          cash_session_id?: string | null;
          cashier_id?: string | null;
          cashier_name?: string | null;
          subtotal?: number;
          discount?: number;
          total?: number;
          payment_method?: "cash" | "transfer";
          cash_received?: number;
          change_amount?: number;
          payment_proof_url?: string | null;
          payment_proof_note?: string | null;
          print_count?: number;
          note?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          cancel_reason?: string | null;
          points_earned?: number;
          points_redeemed?: number;
          status?: "paid" | "cancelled";
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_cash_session_id_fkey";
            columns: ["cash_session_id"];
            isOneToOne: false;
            referencedRelation: "cash_drawer_sessions";
            referencedColumns: ["id"];
          },
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
      cash_drawer_sessions: {
        Row: {
          id: string;
          cashier_id: string;
          cashier_name: string;
          expected_opening_cash: number;
          opening_cash: number;
          opening_variance: number;
          opening_evidence_urls: string[];
          cash_sales: number;
          transfer_sales: number;
          expected_cash: number;
          counted_cash: number | null;
          variance: number | null;
          status: "open" | "closed";
          opened_at: string;
          closed_at: string | null;
          closed_by: string | null;
          close_evidence_urls: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cashier_id: string;
          cashier_name: string;
          expected_opening_cash?: number;
          opening_cash?: number;
          opening_variance?: number;
          opening_evidence_urls?: string[];
          cash_sales?: number;
          transfer_sales?: number;
          expected_cash?: number;
          counted_cash?: number | null;
          variance?: number | null;
          status?: "open" | "closed";
          opened_at?: string;
          closed_at?: string | null;
          closed_by?: string | null;
          close_evidence_urls?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cashier_id?: string;
          cashier_name?: string;
          expected_opening_cash?: number;
          opening_cash?: number;
          opening_variance?: number;
          opening_evidence_urls?: string[];
          cash_sales?: number;
          transfer_sales?: number;
          expected_cash?: number;
          counted_cash?: number | null;
          variance?: number | null;
          status?: "open" | "closed";
          opened_at?: string;
          closed_at?: string | null;
          closed_by?: string | null;
          close_evidence_urls?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cash_drawer_checks: {
        Row: {
          id: string;
          attendance_record_id: string;
          employee_id: string;
          employee_name: string;
          cash_session_id: string | null;
          expected_cash: number;
          actual_cash: number | null;
          is_match: boolean | null;
          evidence_urls: string[];
          checked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          attendance_record_id: string;
          employee_id: string;
          employee_name: string;
          cash_session_id?: string | null;
          expected_cash?: number;
          actual_cash?: number | null;
          is_match?: boolean | null;
          evidence_urls?: string[];
          checked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          attendance_record_id?: string;
          employee_id?: string;
          employee_name?: string;
          cash_session_id?: string | null;
          expected_cash?: number;
          actual_cash?: number | null;
          is_match?: boolean | null;
          evidence_urls?: string[];
          checked_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cash_drawer_checks_attendance_record_id_fkey";
            columns: ["attendance_record_id"];
            isOneToOne: true;
            referencedRelation: "attendance_records";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cash_drawer_checks_cash_session_id_fkey";
            columns: ["cash_session_id"];
            isOneToOne: false;
            referencedRelation: "cash_drawer_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cash_drawer_checks_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      order_audit_events: {
        Row: {
          id: number;
          order_id: string;
          actor_id: string | null;
          event_type: "created" | "cancelled" | "printed" | "deleted";
          reason: string | null;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: number;
          order_id: string;
          actor_id?: string | null;
          event_type: "created" | "cancelled" | "printed" | "deleted";
          reason?: string | null;
          details?: Json;
          created_at?: string;
        };
        Update: {
          id?: number;
          order_id?: string;
          actor_id?: string | null;
          event_type?: "created" | "cancelled" | "printed" | "deleted";
          reason?: string | null;
          details?: Json;
          created_at?: string;
        };
        Relationships: [];
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
          reward_points_cost: number;
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
          reward_points_cost?: number;
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
          reward_points_cost?: number;
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
      attendance_records: {
        Row: {
          id: string;
          user_id: string;
          clock_in_at: string;
          clock_out_at: string | null;
          work_date: string;
          clock_in_latitude: number | null;
          clock_in_longitude: number | null;
          clock_in_accuracy_m: number | null;
          clock_out_latitude: number | null;
          clock_out_longitude: number | null;
          clock_out_accuracy_m: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          clock_in_at?: string;
          clock_out_at?: string | null;
          work_date?: string;
          clock_in_latitude?: number | null;
          clock_in_longitude?: number | null;
          clock_in_accuracy_m?: number | null;
          clock_out_latitude?: number | null;
          clock_out_longitude?: number | null;
          clock_out_accuracy_m?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          clock_in_at?: string;
          clock_out_at?: string | null;
          work_date?: string;
          clock_in_latitude?: number | null;
          clock_in_longitude?: number | null;
          clock_in_accuracy_m?: number | null;
          clock_out_latitude?: number | null;
          clock_out_longitude?: number | null;
          clock_out_accuracy_m?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_records_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      requires_cash_reconciliation: {
        Args: { user_id?: string };
        Returns: boolean;
      };
      list_cash_drawer_sessions: {
        Args: { limit_input?: number };
        Returns: {
          id: string;
          cashier_id: string;
          cashier_name: string;
          expected_opening_cash: number;
          opening_cash: number;
          opening_variance: number;
          opening_evidence_urls: string[];
          cash_sales: number;
          transfer_sales: number;
          expected_cash: number;
          counted_cash: number | null;
          variance: number | null;
          status: "open" | "closed";
          opened_at: string;
          closed_at: string | null;
          closed_by: string | null;
          close_evidence_urls: string[];
        }[];
      };
      get_cash_drawer_handover: {
        Args: Record<PropertyKey, never>;
        Returns: {
          expected_opening_cash: number;
          has_open_session: boolean;
          is_first_session: boolean;
          open_cashier_name: string | null;
        }[];
      };
      open_cash_drawer: {
        Args: { opening_cash_input: number; evidence_urls_input?: string[] };
        Returns: {
          id: string;
          cashier_id: string;
          cashier_name: string;
          expected_opening_cash: number;
          opening_cash: number;
          opening_variance: number;
          opening_evidence_urls: string[];
          cash_sales: number;
          transfer_sales: number;
          expected_cash: number;
          counted_cash: number | null;
          variance: number | null;
          status: "open" | "closed";
          opened_at: string;
          closed_at: string | null;
          closed_by: string | null;
          close_evidence_urls: string[];
          created_at: string;
          updated_at: string;
        };
      };
      close_cash_drawer: {
        Args: {
          session_id_input: string;
          counted_cash_input: number;
          evidence_urls_input?: string[];
        };
        Returns: {
          id: string;
          cashier_id: string;
          cashier_name: string;
          expected_opening_cash: number;
          opening_cash: number;
          opening_variance: number;
          opening_evidence_urls: string[];
          cash_sales: number;
          transfer_sales: number;
          expected_cash: number;
          counted_cash: number | null;
          variance: number | null;
          status: "open" | "closed";
          opened_at: string;
          closed_at: string | null;
          closed_by: string | null;
          close_evidence_urls: string[];
          created_at: string;
          updated_at: string;
        };
      };
      list_attendance_history: {
        Args: { month_start_input: string };
        Returns: {
          id: string;
          user_id: string;
          employee_name: string;
          clock_in_at: string;
          clock_out_at: string | null;
          work_date: string;
          clock_in_latitude: number | null;
          clock_in_longitude: number | null;
          clock_in_accuracy_m: number | null;
          clock_out_latitude: number | null;
          clock_out_longitude: number | null;
          clock_out_accuracy_m: number | null;
          created_at: string;
          updated_at: string;
        }[];
      };
      submit_attendance_cash_check: {
        Args: {
          attendance_record_id_input: string;
          actual_cash_input: number;
          evidence_urls_input?: string[];
        };
        Returns: {
          id: string;
          attendance_record_id: string;
          employee_id: string;
          employee_name: string;
          cash_session_id: string | null;
          expected_cash: number;
          actual_cash: number | null;
          is_match: boolean | null;
          evidence_urls: string[];
          checked_at: string | null;
          created_at: string;
        };
      };
      update_cash_reconciliation: {
        Args: {
          check_id_input: string;
          actual_cash_input: number;
          evidence_urls_input?: string[];
        };
        Returns: Database["public"]["Tables"]["cash_drawer_checks"]["Row"];
      };
      delete_cash_reconciliation: {
        Args: { check_id_input: string };
        Returns: undefined;
      };
      clock_in_attendance: {
        Args: {
          accuracy_input: number | null;
          latitude_input: number;
          longitude_input: number;
        };
        Returns: {
          id: string;
          user_id: string;
          clock_in_at: string;
          clock_out_at: string | null;
          work_date: string;
          clock_in_latitude: number | null;
          clock_in_longitude: number | null;
          clock_in_accuracy_m: number | null;
          clock_out_latitude: number | null;
          clock_out_longitude: number | null;
          clock_out_accuracy_m: number | null;
          created_at: string;
          updated_at: string;
        };
      };
      clock_out_attendance: {
        Args: {
          accuracy_input?: number | null;
          latitude_input?: number | null;
          longitude_input?: number | null;
          record_id_input: string;
        };
        Returns: {
          id: string;
          user_id: string;
          clock_in_at: string;
          clock_out_at: string | null;
          work_date: string;
          clock_in_latitude: number | null;
          clock_in_longitude: number | null;
          clock_in_accuracy_m: number | null;
          clock_out_latitude: number | null;
          clock_out_longitude: number | null;
          clock_out_accuracy_m: number | null;
          created_at: string;
          updated_at: string;
        };
      };
      delete_attendance_record: {
        Args: {
          record_id_input: string;
        };
        Returns: void;
      };
      update_attendance_record: {
        Args: {
          clock_in_at_input: string;
          clock_out_at_input: string | null;
          record_id_input: string;
        };
        Returns: {
          id: string;
          user_id: string;
          clock_in_at: string;
          clock_out_at: string | null;
          work_date: string;
          clock_in_latitude: number | null;
          clock_in_longitude: number | null;
          clock_in_accuracy_m: number | null;
          clock_out_latitude: number | null;
          clock_out_longitude: number | null;
          clock_out_accuracy_m: number | null;
          created_at: string;
          updated_at: string;
        };
      };
      issue_product_stock: {
        Args: { product_id_input: string; quantity_input: number; reason_input: string };
        Returns: Database["public"]["Tables"]["products"]["Row"];
      };
      transfer_product_shelf: {
        Args: {
          batch_id_input: string;
          direction_input: "to_shelf" | "to_warehouse";
          product_id_input: string;
          quantity_input: number;
        };
        Returns: Database["public"]["Tables"]["product_batches"]["Row"];
      };
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
          cash_session_id: string | null;
          cashier_id: string | null;
          cashier_name: string | null;
          subtotal: number;
          discount: number;
          total: number;
          payment_method: "cash" | "transfer";
          cash_received: number;
          change_amount: number;
          payment_proof_note: string | null;
          payment_proof_url: string | null;
          print_count: number;
          note: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          cancel_reason: string | null;
          points_earned: number;
          points_redeemed: number;
          status: "paid" | "cancelled";
          created_at: string;
        };
      };
      cancel_pos_order: {
        Args: {
          order_id_input: string;
          reason_input: string;
        };
        Returns: {
          id: string;
          code: string;
          customer_id: string | null;
          cash_session_id: string | null;
          cashier_id: string | null;
          cashier_name: string | null;
          subtotal: number;
          discount: number;
          total: number;
          payment_method: "cash" | "transfer";
          cash_received: number;
          change_amount: number;
          payment_proof_note: string | null;
          payment_proof_url: string | null;
          print_count: number;
          note: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          cancel_reason: string | null;
          points_earned: number;
          points_redeemed: number;
          status: "paid" | "cancelled";
          created_at: string;
        };
      };
      delete_pos_orders: {
        Args: {
          order_ids_input: string[];
          reason_input: string;
        };
        Returns: number;
      };
      record_order_print: {
        Args: {
          order_id_input: string;
        };
        Returns: {
          id: string;
          code: string;
          customer_id: string | null;
          cash_session_id: string | null;
          cashier_id: string | null;
          cashier_name: string | null;
          subtotal: number;
          discount: number;
          total: number;
          payment_method: "cash" | "transfer";
          cash_received: number;
          change_amount: number;
          payment_proof_note: string | null;
          payment_proof_url: string | null;
          print_count: number;
          note: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          cancel_reason: string | null;
          points_earned: number;
          points_redeemed: number;
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
      set_product_active: {
        Args: { product_id_input: string; is_active_input: boolean };
        Returns: Database["public"]["Tables"]["products"]["Row"];
      };
      soft_delete_product: {
        Args: { product_id_input: string };
        Returns: Database["public"]["Tables"]["products"]["Row"];
      };
      clear_products_image_url: {
        Args: { image_url_input: string };
        Returns: number;
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
          shelf_quantity: number;
          import_date: string | null;
          expiry_date: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      submit_inventory_audit: {
        Args: {
          lines_input: Json;
          staff_name_input: string;
        };
        Returns: string;
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
