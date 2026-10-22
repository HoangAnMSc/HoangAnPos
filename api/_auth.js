import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

function getSupabaseConfig() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  let legacyRole;
  try {
    legacyRole = JSON.parse(Buffer.from(serviceRoleKey.split(".")[1] || "", "base64url").toString()).role;
  } catch {
    // New secret keys are opaque strings, rather than legacy JWTs.
  }

  if (serviceRoleKey.startsWith("sb_publishable_") || legacyRole === "anon") {
    throw new Error("Cấu hình Supabase trên máy chủ đang dùng khóa công khai. Cần thay bằng Secret key hoặc service_role key của cùng dự án Supabase.");
  }
  // This checks the key type only; Supabase still validates the credential.
  if (!serviceRoleKey.startsWith("sb_secret_") && legacyRole !== "service_role") {
    throw new Error("Khóa Supabase phía máy chủ chưa hợp lệ. Cần cấu hình Secret key hoặc service_role key thật của dự án.");
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
    realtime: {
      transport: WebSocket,
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
    .select("role, role_id, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Khong doc duoc profiles bang service role: ${error.message}`);
  }

  if (!profile || profile.is_active === false) {
    return false;
  }

  if (profile.role === "admin") {
    return true;
  }

  if (!profile.role_id) {
    return false;
  }

  const { data: role, error: roleError } = await admin
    .from("app_roles")
    .select("code, is_active, permissions")
    .eq("id", profile.role_id)
    .maybeSingle();

  if (roleError) {
    throw new Error(`Khong doc duoc app_roles bang service role: ${roleError.message}`);
  }

  if (!role || !role.is_active) return false;
  if (role.code === "admin") return true;

  return permissions.some((permission) => role.permissions?.includes(permission));
}

export async function userIsSuperAdmin(admin, user) {
  if (user.app_metadata?.role === "admin") return true;

  const { data: profile, error } = await admin
    .from("profiles")
    .select("role, role_id, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Khong doc duoc profiles bang service role: ${error.message}`);
  }

  if (!profile || profile.is_active === false) return false;
  if (profile.role === "admin") return true;
  if (!profile.role_id) return false;

  const { data: role, error: roleError } = await admin
    .from("app_roles")
    .select("code, is_active")
    .eq("id", profile.role_id)
    .maybeSingle();

  if (roleError) {
    throw new Error(`Khong doc duoc app_roles bang service role: ${roleError.message}`);
  }

  return role?.code === "admin" && role.is_active !== false;
}

export async function authorizeApiRequest(request, permissions) {
  let admin;
  try {
    admin = getAdminClient();
  } catch (configError) {
    return {
      message: configError instanceof Error ? configError.message : "Cấu hình Supabase trên máy chủ chưa hợp lệ.",
      ok: false,
      status: 500,
    };
  }

  if (!admin) {
    return {
      message: "Máy chủ chưa được cấu hình kết nối quản trị Supabase. Vui lòng liên hệ quản trị viên.",
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

  let allowed;

  try {
    allowed = await userHasAnyPermission(admin, data.user, permissions);
  } catch (permissionError) {
    return {
      message:
        permissionError instanceof Error
          ? permissionError.message
          : "Khong kiem tra duoc quyen tai khoan.",
      ok: false,
      status: 500,
    };
  }

  if (!allowed) {
    return {
      message: "Ban khong co quyen thuc hien chuc nang nay.",
      ok: false,
      status: 403,
    };
  }

  return { admin, ok: true, user: data.user };
}
