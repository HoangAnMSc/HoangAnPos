import { authorizeApiRequest, userHasAnyPermission, userIsSuperAdmin } from "./_auth.js";

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizePhoneNumber(value) {
  const compact = String(value ?? "").trim().replace(/[\s().-]/g, "");
  let normalized = compact;

  if (/^0\d+$/.test(compact)) {
    normalized = `+84${compact.slice(1)}`;
  } else if (/^84\d+$/.test(compact)) {
    normalized = `+${compact}`;
  } else if (/^\d{9}$/.test(compact)) {
    normalized = `+84${compact}`;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw httpError(400, "So dien thoai khong hop le. Vi du: 0901234567 hoac +84901234567.");
  }

  return normalized;
}

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  if (request.parsedBody && typeof request.parsedBody === "object") {
    return request.parsedBody;
  }

  if (request.body && typeof request.body === "object") {
    request.parsedBody = request.body;
    return request.body;
  }

  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += String(chunk ?? "");
      if (body.length > 1_000_000) {
        reject(httpError(413, "Du lieu gui len qua lon."));
      }
    });
    request.on("end", () => {
      try {
        const parsedBody = body ? JSON.parse(body) : {};
        request.parsedBody = parsedBody;
        resolve(parsedBody);
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function getRequestUrl(request) {
  return new URL(request.url ?? "/api/admin-users", "http://localhost");
}

function isUserActive(user, profile) {
  return Boolean(profile?.is_active) && !user.banned_until;
}

function shapeUser(user, profiles, roles) {
  const profile = profiles.get(user.id) ?? null;
  const role = profile?.role_id ? roles.get(profile.role_id) ?? null : null;

  return {
    banned_until: user.banned_until ?? null,
    created_at: user.created_at ?? null,
    email: user.email ?? "",
    full_name: profile?.full_name ?? user.user_metadata?.full_name ?? null,
    id: user.id,
    is_active: isUserActive(user, profile),
    last_seen_at: profile?.last_seen_at ?? null,
    last_sign_in_at: user.last_sign_in_at ?? null,
    phone: user.phone ?? profile?.phone ?? "",
    profile,
    role,
    role_id: profile?.role_id ?? null,
  };
}

async function getRoles(admin) {
  const { data, error } = await admin.from("app_roles").select("*");

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((role) => [role.id, role]));
}

async function getProfiles(admin, userIds) {
  if (userIds.length === 0) {
    return new Map();
  }

  const { data, error } = await admin.from("profiles").select("*").in("id", userIds);

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((profile) => [profile.id, profile]));
}

async function getRoleById(admin, roleId) {
  const { data, error } = await admin
    .from("app_roles")
    .select("*")
    .eq("id", roleId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function getManagedUser(admin, userId) {
  const [{ data: userData, error: userError }, roles] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    getRoles(admin),
  ]);

  if (userError) {
    throw userError;
  }

  const profiles = await getProfiles(admin, [userId]);
  return shapeUser(userData.user, profiles, roles);
}

async function listUsers(admin, response) {
  const users = [];
  let page = 1;
  const perPage = 1000;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw error;
    }

    users.push(...(data.users ?? []));

    if (!data.users || data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  const userIds = users.map((user) => user.id);
  const [profiles, roles] = await Promise.all([getProfiles(admin, userIds), getRoles(admin)]);
  const shapedUsers = users.map((user) => shapeUser(user, profiles, roles));

  sendJson(response, 200, { users: shapedUsers });
}

async function createUser(admin, request, response, actor) {
  const body = await readJsonBody(request);
  const email = String(body.email ?? "").trim();
  const phone = normalizePhoneNumber(body.phone);
  const password = String(body.password ?? "");
  const fullName = String(body.full_name ?? "").trim();
  const roleId = String(body.role_id ?? "").trim();
  const isActive = Boolean(body.is_active);

  if (!password || !roleId) {
    sendJson(response, 400, { message: "So dien thoai, mat khau va role la bat buoc." });
    return;
  }

  const role = await getRoleById(admin, roleId);
  if (role.code === "admin" && !(await userIsSuperAdmin(admin, actor))) {
    throw httpError(403, "Chi super admin moi duoc gan vai tro admin.");
  }
  const attributes = {
    password,
    phone,
    phone_confirm: true,
    user_metadata: { full_name: fullName },
  };

  if (email) {
    attributes.email = email;
    attributes.email_confirm = true;
  }

  const { data, error } = await admin.auth.admin.createUser(attributes);

  if (error) {
    throw error;
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    full_name: fullName || phone,
    id: data.user.id,
    is_active: isActive,
    phone,
    role: role.code,
    role_id: role.id,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw profileError;
  }

  if (!isActive) {
    await admin.auth.admin.updateUserById(data.user.id, { ban_duration: "876000h" });
  }

  sendJson(response, 201, { user: await getManagedUser(admin, data.user.id) });
}

async function updateUser(admin, request, response, actor) {
  const url = getRequestUrl(request);
  const userId = url.searchParams.get("id");

  if (!userId) {
    sendJson(response, 400, { message: "Thieu user id." });
    return;
  }

  const body = await readJsonBody(request);
  let email = String(body.email ?? "").trim();
  let phone = String(body.phone ?? "").trim();
  let password = String(body.password ?? "");
  let fullName = String(body.full_name ?? "").trim();
  let roleId = String(body.role_id ?? "").trim();
  let isActive = Boolean(body.is_active);
  const canUpdateDetails = await userHasAnyPermission(admin, actor, ["users.update"]);
  const canToggleActive = await userHasAnyPermission(admin, actor, ["users.toggle-active"]);
  const existingUser = await getManagedUser(admin, userId);

  if (!canUpdateDetails) {
    email = existingUser?.email ?? email;
    phone = existingUser?.phone ?? phone;
    password = "";
    fullName = existingUser?.full_name ?? "";
    roleId = existingUser?.role_id ?? roleId;
  }

  if (!canToggleActive) {
    isActive = existingUser?.is_active ?? isActive;
  }

  if (!phone || !roleId) {
    sendJson(response, 400, { message: "So dien thoai va role la bat buoc." });
    return;
  }

  phone = normalizePhoneNumber(phone);

  const role = await getRoleById(admin, roleId);
  const actorIsSuperAdmin = await userIsSuperAdmin(admin, actor);
  if ((role.code === "admin" || existingUser?.role?.code === "admin") && !actorIsSuperAdmin) {
    throw httpError(403, "Chi super admin moi duoc thay doi tai khoan admin.");
  }
  const attributes = {
    ban_duration: isActive ? "none" : "876000h",
    phone,
    phone_confirm: true,
    user_metadata: { full_name: fullName },
  };

  if (email) {
    attributes.email = email;
    attributes.email_confirm = true;
  }

  if (password) {
    attributes.password = password;
  }

  const { error } = await admin.auth.admin.updateUserById(userId, attributes);

  if (error) {
    throw error;
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    full_name: fullName || phone,
    id: userId,
    is_active: isActive,
    phone,
    role: role.code,
    role_id: role.id,
  });

  if (profileError) {
    throw profileError;
  }

  sendJson(response, 200, { user: await getManagedUser(admin, userId) });
}

async function deleteUser(admin, request, response, actor) {
  const url = getRequestUrl(request);
  const userId = url.searchParams.get("id");

  if (!userId) {
    sendJson(response, 400, { message: "Thieu user id." });
    return;
  }

  const target = await getManagedUser(admin, userId);
  if (target.role?.code === "admin" && !(await userIsSuperAdmin(admin, actor))) {
    throw httpError(403, "Chi super admin moi duoc xoa tai khoan admin.");
  }

  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    throw error;
  }

  sendJson(response, 200, { ok: true });
}

export default async function handler(request, response) {
  const methodPermissions = {
    DELETE: ["users.delete"],
    GET: ["users"],
    PATCH: ["users.update", "users.toggle-active"],
    POST: ["users.create"],
  };
  const auth = await authorizeApiRequest(request, methodPermissions[request.method] ?? ["users"]);

  if (!auth.ok) {
    sendJson(response, auth.status, { message: auth.message });
    return;
  }

  try {
    if (request.method === "GET") {
      await listUsers(auth.admin, response);
      return;
    }

    if (request.method === "POST") {
      await createUser(auth.admin, request, response, auth.user);
      return;
    }

    if (request.method === "PATCH") {
      await updateUser(auth.admin, request, response, auth.user);
      return;
    }

    if (request.method === "DELETE") {
      await deleteUser(auth.admin, request, response, auth.user);
      return;
    }

    sendJson(response, 405, { message: "Method not allowed." });
  } catch (error) {
    sendJson(response, Number.isInteger(error?.status) ? error.status : 500, {
      message: error instanceof Error ? error.message : "Yeu cau quan ly user that bai.",
    });
  }
}
