import { createClient } from "@supabase/supabase-js";

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return { serviceRoleKey, supabaseUrl };
}

export function getAdminClient() {
  const config = getSupabaseConfig();

  if (!config) {
    return null;
  }

  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getHeader(request, name) {
  if (typeof request.headers?.get === "function") {
    return request.headers.get(name);
  }

  return request.headers?.[name.toLowerCase()] ?? request.headers?.[name];
}

function getBearerToken(request) {
  const authorization = getHeader(request, "authorization") ?? "";
  const match = String(authorization).match(/^Bearer\s+(.+)$/i);

  return match?.[1] ?? "";
}

export async function userHasAnyPermission(admin, user, permissions) {
  if (user.app_metadata?.role === "admin") {
    return true;
  }

  const { data: profile, error } = await admin
    .from("profiles")
    .select("role, is_active, app_roles(code, is_active, permissions)")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile || profile.is_active === false) {
    return false;
  }

  const role = Array.isArray(profile.app_roles)
    ? profile.app_roles[0] ?? null
    : profile.app_roles ?? null;

  if (profile.role === "admin" || role?.code === "admin") {
    return true;
  }

  if (!role?.is_active) {
    return false;
  }

  return permissions.some((permission) => role.permissions?.includes(permission));
}

export async function authorizeApiRequest(request, permissions) {
  const admin = getAdminClient();

  if (!admin) {
    return {
      message: "Can cau hinh SUPABASE_SERVICE_ROLE_KEY cho API quan tri.",
      ok: false,
      status: 500,
    };
  }

  const token = getBearerToken(request);

  if (!token) {
    return {
      message: "Can dang nhap de thuc hien yeu cau nay.",
      ok: false,
      status: 401,
    };
  }

  const { data, error } = await admin.auth.getUser(token);

  if (error || !data.user) {
    return {
      message: "Phien dang nhap khong hop le.",
      ok: false,
      status: 401,
    };
  }

  const allowed = await userHasAnyPermission(admin, data.user, permissions);

  if (!allowed) {
    return {
      message: "Ban khong co quyen thuc hien chuc nang nay.",
      ok: false,
      status: 403,
    };
  }

  return { admin, ok: true, user: data.user };
}
