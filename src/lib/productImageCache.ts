const cacheName = "hoang-an-pos-product-images-v1";
const pendingImages = new Map<string, Promise<Blob | null>>();
const waitingDownloads: Array<() => void> = [];
const maxConcurrentDownloads = 4;
let activeDownloads = 0;

async function acquireDownloadSlot() {
  if (activeDownloads < maxConcurrentDownloads) {
    activeDownloads += 1;
    return;
  }
  await new Promise<void>((resolve) => waitingDownloads.push(resolve));
}

function releaseDownloadSlot() {
  const next = waitingDownloads.shift();
  if (next) next();
  else activeDownloads -= 1;
}

async function readProductImage(source: string, version: string): Promise<Blob | null> {
  if (!("caches" in globalThis) || !/^https?:\/\//i.test(source)) return null;
  let key: string;
  try { key = new URL(source).href; } catch { return null; }
  let cache: Cache | undefined;
  try {
    cache = await caches.open(cacheName);
    const cached = await cache.match(key);
    if (cached?.headers.get("X-Pos-Image-Version") === encodeURIComponent(version)) return await cached.blob();
  } catch {
    // Private browsing or a full cache must not prevent images from displaying.
  }
  await acquireDownloadSlot();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(source, {
      cache: version ? "reload" : "force-cache",
      credentials: "omit",
      signal: controller.signal,
    });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) return null;
    const blob = await response.blob();
    if (!blob.size) return null;
    try {
      await cache?.put(key, new Response(blob, { headers: {
        "Content-Type": blob.type,
        "X-Pos-Image-Version": encodeURIComponent(version),
      } }));
    } catch {
      // The downloaded image is still usable if persistence is unavailable.
    }
    return blob;
  } catch {
    // Hosts without CORS support fall back to the browser's normal image loading.
    return null;
  } finally {
    clearTimeout(timeout);
    releaseDownloadSlot();
  }
}

export function loadCachedProductImage(source: string, version = "") {
  const key = JSON.stringify([source, version]);
  const pending = pendingImages.get(key);
  if (pending) return pending;
  const request = readProductImage(source, version).finally(() => pendingImages.delete(key));
  pendingImages.set(key, request);
  return request;
}
