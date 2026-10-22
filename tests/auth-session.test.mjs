import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createClient } from "@supabase/supabase-js";

let instance = 0;
async function loadApiClient(auth) {
  globalThis.testSessionAuth = auth;
  const bundle = await build({
    entryPoints: ["src/lib/apiClient.ts"], bundle: true, write: false, format: "esm", platform: "node",
    plugins: [{
      name: "mock-session-auth",
      setup(builder) {
        builder.onLoad({ filter: /[\\/]lib[\\/]supabase\.ts$/ }, () => ({
          contents: "export const isSupabaseConfigured = true; export const supabase = { auth: globalThis.testSessionAuth };",
          loader: "js",
        }));
      },
    }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}#${instance++}`);
}

test("temporary refresh failures preserve the saved login and a later request can recover", async () => {
  let session = { access_token: "previous-token", refresh_token: "saved-refresh-token" };
  let refreshAvailable = false;
  let signOuts = 0;
  const originalFetch = globalThis.fetch;
  try {
    const { authenticatedFetch } = await loadApiClient({
      getSession: async () => ({ data: { session } }),
      refreshSession: async () => {
        if (!refreshAvailable) return { data: { session: null }, error: new Error("Network unavailable") };
        session = { ...session, access_token: "renewed-token" };
        return { data: { session }, error: null };
      },
      signOut: async () => { signOuts++; session = null; },
    });
    const requests = [];
    globalThis.fetch = async (_url, init) => {
      requests.push(init);
      return new Response(null, { status: init.headers.get("Authorization") === "Bearer renewed-token" ? 200 : 401 });
    };
    assert.equal((await authenticatedFetch("https://app.test/api/images")).status, 401);
    assert.equal(signOuts, 0, "A temporary connection error must not delete a persisted session");
    assert.equal(session.refresh_token, "saved-refresh-token");

    refreshAvailable = true;
    assert.equal((await authenticatedFetch("https://app.test/api/images", {
      method: "POST", body: "payload", headers: { "X-Request-ID": "retry-request" },
    })).status, 200);
    assert.equal(requests.length, 3);
    assert.equal(requests[2].method, "POST");
    assert.equal(requests[2].body, "payload");
    assert.equal(requests[2].headers.get("X-Request-ID"), "retry-request");
    assert.equal(requests[2].headers.get("Authorization"), "Bearer renewed-token");
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.testSessionAuth;
  }
});

test("a revoked refresh token still removes the persisted login through Supabase", async () => {
  const storageKey = "test-auth-session";
  const stored = new Map([[storageKey, JSON.stringify({
    access_token: "previous-token", refresh_token: "revoked-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "test-user", app_metadata: {}, user_metadata: {} },
  })]]);
  const storage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: (key) => stored.delete(key),
  };
  const client = createClient("https://session-test.supabase.co", "test-public-key", {
    auth: { storageKey, storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async () => Response.json({ code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" }, { status: 400 }) },
  });
  const originalFetch = globalThis.fetch;
  try {
    const { authenticatedFetch } = await loadApiClient(client.auth);
    assert.ok((await client.auth.getSession()).data.session);
    globalThis.fetch = async () => new Response(null, { status: 401 });
    assert.equal((await authenticatedFetch("https://app.test/api/images")).status, 401);
    assert.equal((await client.auth.getSession()).data.session, null);
    assert.equal(stored.has(storageKey), false);
  } finally {
    await client.auth.stopAutoRefresh();
    globalThis.fetch = originalFetch;
    delete globalThis.testSessionAuth;
  }
});
