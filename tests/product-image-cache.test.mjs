import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

let instance = 0;
async function loadCache() {
  const result = await build({ entryPoints: ["src/lib/productImageCache.ts"], bundle: true, write: false, format: "esm", platform: "node" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}#${instance++}`);
}

async function withImageCache(run) {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const entries = new Map();
  const calls = [];
  const cache = {
    match: async (key) => entries.get(key)?.clone(),
    put: async (key, response) => { entries.set(key, response.clone()); },
  };
  globalThis.caches = { open: async () => cache };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response("image-bytes", { headers: { "Content-Type": "image/webp" } });
  };
  try { await run({ calls, entries, cache }); }
  finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  }
}

test("product images persist across page reloads and fetch again only when the data version changes", async () => {
  await withImageCache(async ({ calls, entries }) => {
    const source = "https://res.cloudinary.com/shop/image/upload/v123/a.webp";
    const firstPage = await loadCache();
    assert.equal(await (await firstPage.loadCachedProductImage(source, "version-1")).text(), "image-bytes");
    assert.equal(calls.length, 1);
    assert.equal(entries.size, 1);
    const reloadedPage = await loadCache();
    assert.equal(await (await reloadedPage.loadCachedProductImage(source, "version-1")).text(), "image-bytes");
    assert.equal(calls.length, 1, "Unchanged data must use persisted bytes without a network request");
    await reloadedPage.loadCachedProductImage(source, "version-2");
    assert.equal(calls.length, 2);
    assert.equal(entries.size, 1, "Updating the same photo replaces its old cached revision");
    assert.equal(calls[1].url, source, "The storage version must not alter signed delivery URLs");
    assert.equal(calls[1].options.cache, "reload", "A new version must bypass stale HTTP cache entries");
    await reloadedPage.loadCachedProductImage(`${source}?asset=new`, "version-2");
    assert.equal(calls.length, 3, "A changed image URL is a separate resource");
  });
});

test("simultaneous cards share one image download", async () => {
  await withImageCache(async ({ calls }) => {
    const { loadCachedProductImage } = await loadCache();
    const source = "https://images.test/a.webp";
    const first = loadCachedProductImage(source, "v1");
    const second = loadCachedProductImage(source, "v1");
    assert.equal(first, second);
    assert.equal((await first).type, "image/webp");
    assert.equal(calls.length, 1);
  });
});

test("large image grids bound simultaneous downloads and continue after a failed image", async () => {
  await withImageCache(async () => {
    const { loadCachedProductImage } = await loadCache();
    let active = 0, peak = 0;
    const requests = [];
    globalThis.fetch = async (url) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => requests.push(resolve));
      active--;
      if (new URL(url).pathname === "/0.webp") throw new Error("Image unavailable");
      return new Response("image", { headers: { "Content-Type": "image/webp" } });
    };
    const images = Array.from({ length: 12 }, (_, index) => loadCachedProductImage(`https://images.test/${index}.webp`));
    // Release each batch as the next queued downloads acquire their slots.
    for (let completed = 0; completed < images.length;) {
      await new Promise((resolve) => setImmediate(resolve));
      const batch = requests.splice(0);
      completed += batch.length;
      batch.forEach((resolve) => resolve());
    }
    const results = await Promise.all(images);
    assert.equal(peak, 4);
    assert.equal(results[0], null);
    assert.ok(results.slice(1).every((blob) => blob instanceof Blob));
    assert.equal(active, 0);
  });
});

test("cache failures and invalid image responses preserve the normal image fallback", async () => {
  await withImageCache(async ({ cache }) => {
    const { loadCachedProductImage } = await loadCache();
    cache.put = async () => { throw new Error("Quota exceeded"); };
    assert.ok(await loadCachedProductImage("https://images.test/quota.webp", "v1") instanceof Blob);
    globalThis.caches.open = async () => { throw new Error("Private browsing"); };
    assert.ok(await loadCachedProductImage("https://images.test/private.webp", "v1") instanceof Blob);
    globalThis.fetch = async () => { throw new TypeError("CORS blocked"); };
    assert.equal(await loadCachedProductImage("https://images.test/blocked.webp", "v1"), null);
    globalThis.fetch = async () => new Response("offline", { status: 503 });
    assert.equal(await loadCachedProductImage("https://images.test/failing.webp", "v1"), null);
    globalThis.fetch = async () => new Response("not an image", { headers: { "Content-Type": "text/html" } });
    assert.equal(await loadCachedProductImage("https://images.test/html.webp", "v1"), null);
    assert.equal(await loadCachedProductImage("/relative-image.webp", "v1"), null);
    assert.equal(await loadCachedProductImage("https://[invalid", "v1"), null);
    delete globalThis.caches;
    assert.equal(await loadCachedProductImage("https://images.test/no-cache.webp", "v1"), null);
  });
});
