import { requireSupabaseConfig, supabase } from "../lib/supabase";
import type { AppRole } from "../types";

export type RoleInput = {
  code: string;
  description?: string | null;
  is_active: boolean;
  name: string;
  permissions: string[];
};

function normalizeRoleCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, "")
    .replace(/\s+/g, "-");
}

export async function fetchRoles() {
  requireSupabaseConfig();

  const { data, error } = await supabase
    .from("app_roles")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function createRole(input: RoleInput) {
  requireSupabaseConfig();

  const payload = {
    ...input,
    code: normalizeRoleCode(input.code),
    description: input.description?.trim() || null,
    name: input.name.trim(),
  };

  const { data, error } = await supabase
    .from("app_roles")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateRole(id: string, input: RoleInput) {
  requireSupabaseConfig();

  const payload = {
    ...input,
    code: normalizeRoleCode(input.code),
    description: input.description?.trim() || null,
    name: input.name.trim(),
  };

  const { data, error } = await supabase
    .from("app_roles")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function setRoleActive(id: string, isActive: boolean) {
  requireSupabaseConfig();

  const { data, error } = await supabase.rpc("set_app_role_active", {
    is_active_input: isActive,
    role_id_input: id,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteRole(role: AppRole) {
  requireSupabaseConfig();

  if (role.code === "admin" || role.code === "staff") {
    throw new Error("Khong the xoa role he thong.");
  }

  const { error } = await supabase.from("app_roles").delete().eq("id", role.id);

  if (error) {
    throw error;
  }
}
