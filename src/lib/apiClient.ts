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

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const firstResponse = await fetch(input, {
    ...init,
    headers: await createAuthHeaders(init.headers),
  });

  if (firstResponse.status !== 401 || !isSupabaseConfigured) {
    return firstResponse;
  }

  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) {
    await supabase.auth.signOut({ scope: "local" });
    return firstResponse;
  }

  const retryHeaders = new Headers(init.headers);
  retryHeaders.set("Authorization", `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers: retryHeaders });
}
