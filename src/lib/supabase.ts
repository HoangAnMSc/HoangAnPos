import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient<Database>(
  supabaseUrl || "https://example.supabase.co",
  supabaseAnonKey || "missing-anon-key",
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  }
);

export function requireSupabaseConfig() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Chưa cấu hình Supabase. Hãy tạo file .env từ .env.example và điền VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY."
    );
  }
}
