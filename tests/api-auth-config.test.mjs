import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

async function loadAuth(client) {
  globalThis.authConfigTestClient = client;
  const result = await build({
    entryPoints: ["api/_auth.js"], bundle: true, write: false, format: "esm", platform: "node",
    plugins: [{
      name: "mock-supabase",
      setup(builder) {
        builder.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: "supabase", namespace: "mock" }));
        builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
          contents: "export function createClient(url, key) { globalThis.authConfigTestClient.calls.push({url, key}); return globalThis.authConfigTestClient; }",
        }));
        builder.onResolve({ filter: /^ws$/ }, () => ({ path: "ws", namespace: "mock-ws" }));
        builder.onLoad({ filter: /.*/, namespace: "mock-ws" }, () => ({ contents: "export default class WebSocket {}" }));
      },
    }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

function legacyKey(role) {
  return `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.test-signature`;
}

test("server APIs reject public, missing and sample keys without treating configuration failures as expired sessions", async () => {
  const previousEnv = { ...process.env };
  const client = {
    calls: [], userChecks: 0,
    auth: { getUser: async () => {
      client.userChecks++;
      return { data: { user: { id: "admin", app_metadata: { role: "admin" } } }, error: null };
    } },
  };
  const { authorizeApiRequest } = await loadAuth(client);
  const request = { headers: { authorization: "Bearer valid-user-session" } };
  process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
  delete process.env.SUPABASE_URL;
  try {
    for (const key of ["", "your-supabase-service-role-key", "sb_publishable_public", legacyKey("anon"), "not-a-key"]) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = key;
      const result = await authorizeApiRequest(request, ["products.update"]);
      assert.equal(result.status, 500);
      assert.equal(result.ok, false);
      assert.match(result.message, /Supabase/);
      if (key) assert.ok(!result.message.includes(key), "Never expose credentials in an error response");
    }
    assert.equal(client.calls.length, 0, "Invalid server credentials must not reach Supabase");
    assert.equal(client.userChecks, 0, "A valid user session is not at fault");
    for (const key of ["sb_secret_backend", legacyKey("service_role")]) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = `  ${key}  `;
      const result = await authorizeApiRequest(request, ["products.update"]);
      assert.equal(result.ok, true);
      assert.equal(client.calls.at(-1).key, key);
      assert.equal(client.calls.at(-1).url, "https://test.supabase.co");
    }
    const unsigned = await authorizeApiRequest({ headers: {} }, ["products.update"]);
    assert.equal(unsigned.status, 401, "Missing user authentication still requires a login");
  } finally {
    for (const key of ["SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
    delete globalThis.authConfigTestClient;
  }
});
