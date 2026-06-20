// Hand-rolled cache-first service worker.
//
// Strategy: cache-first for every same-origin GET (app shell + /pyodide/*).
// Pyodide assets and hashed JS/CSS are content-addressed, so cache-first is safe
// and makes the SECOND start work with the network fully disabled.
//
// Correction #1 — cache hygiene: bump CACHE_VERSION on every meaningful change.
// The activate handler deletes ALL caches whose name !== CACHE_VERSION, so stale
// hashed assets from previous rebuilds don't accumulate.
const CACHE_VERSION = "pyodide-spike-v1";

self.addEventListener("install", (event) => {
  // Activate this SW immediately rather than waiting for old tabs to close.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GETs. Anything cross-origin is left to the network
  // (there shouldn't be any — this spike makes no remote requests).
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(req);
      if (cached) return cached;

      // First time we see this asset: fetch, cache, return. After this, the
      // asset is available offline.
      const res = await fetch(req);
      if (res.ok && res.type === "basic") {
        cache.put(req, res.clone());
      }
      return res;
    })(),
  );
});
