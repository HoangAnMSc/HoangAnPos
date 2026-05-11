import { requireSupabaseConfig, supabase } from "../lib/supabase";

export type CustomerInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  note?: string | null;
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
