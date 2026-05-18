import type { AppRole, Profile } from "../types";
import { createAuthHeaders } from "../lib/apiClient";

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
  profile: Profile | null;
};

export type UserInput = {
  email: string;
  full_name: string;
  is_active: boolean;
  password?: string;
  role_id: string;
};

async function parseResponse<T>(response: Response) {
  const data = (await response.json()) as { message?: string } & T;

  if (!response.ok) {
    throw new Error(data.message || "Yeu cau quan ly user that bai.");
  }

  return data;
}

export async function fetchManagedUsers() {
  const response = await fetch("/api/admin-users", {
    headers: await createAuthHeaders(),
  });
  const data = await parseResponse<{ users: ManagedUser[] }>(response);
  return data.users;
}

export async function createManagedUser(input: UserInput) {
  const response = await fetch("/api/admin-users", {
    body: JSON.stringify(input),
    headers: await createAuthHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });
  const data = await parseResponse<{ user: ManagedUser }>(response);
  return data.user;
}

export async function updateManagedUser(id: string, input: UserInput) {
  const response = await fetch(`/api/admin-users?id=${encodeURIComponent(id)}`, {
    body: JSON.stringify(input),
    headers: await createAuthHeaders({ "Content-Type": "application/json" }),
    method: "PATCH",
  });
  const data = await parseResponse<{ user: ManagedUser }>(response);
  return data.user;
}

export async function deleteManagedUser(id: string) {
  const response = await fetch(`/api/admin-users?id=${encodeURIComponent(id)}`, {
    headers: await createAuthHeaders(),
    method: "DELETE",
  });
  await parseResponse<{ ok: boolean }>(response);
}
