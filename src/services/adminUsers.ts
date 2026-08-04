import type { AppRole, Profile } from "../types";
import { authenticatedFetch } from "../lib/apiClient";

export class AdminUsersApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminUsersApiError";
    this.status = status;
  }
}

export type ManagedUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole | null;
  role_id: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  banned_until: string | null;
  phone: string;
  profile: Profile | null;
};

export type UserInput = {
  email: string;
  full_name: string;
  is_active: boolean;
  password?: string;
  phone: string;
  role_id: string;
};

async function parseResponse<T>(response: Response) {
  const data = (await response.json()) as { message?: string } & T;

  if (!response.ok) {
    throw new AdminUsersApiError(
      response.status === 401
        ? "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại."
        : data.message || "Yêu cầu quản lý nhân viên thất bại.",
      response.status
    );
  }

  return data;
}

export async function fetchManagedUsers() {
  const response = await authenticatedFetch("/api/admin-users");
  const data = await parseResponse<{ users: ManagedUser[] }>(response);
  return data.users;
}

export async function createManagedUser(input: UserInput) {
  const response = await authenticatedFetch("/api/admin-users", {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const data = await parseResponse<{ user: ManagedUser }>(response);
  return data.user;
}

export async function updateManagedUser(id: string, input: UserInput) {
  const response = await authenticatedFetch(`/api/admin-users?id=${encodeURIComponent(id)}`, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
  const data = await parseResponse<{ user: ManagedUser }>(response);
  return data.user;
}

export async function deleteManagedUser(id: string) {
  const response = await authenticatedFetch(`/api/admin-users?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  await parseResponse<{ ok: boolean }>(response);
}
