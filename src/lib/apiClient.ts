import { isSupabaseConfigured, supabase } from "./supabase";

export async function createAuthHeaders(headers?: HeadersInit) {
  const nextHeaders = new Headers(headers);

  if (!isSupabaseConfigured) {
    return nextHeaders;
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (token) {
    nextHeaders.set("Authorization", `Bearer ${token}`);
  }

  return nextHeaders;
}
