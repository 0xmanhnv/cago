// Minimal PWA service worker: read-cache for the kiosk so a flaky rural connection
// still shows the catalog. NEVER caches writes (POST) — only GET.
const CACHE = "cago-read-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // writes always go to the network
  const url = new URL(req.url);

  // Kiosk read APIs: network-first, fall back to cache when offline.
  if (url.pathname.startsWith("/api/method/cago.api.kiosk")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }

  // Never cache authenticated areas' navigation (shared tablet: don't serve an owner/staff
  // shell to the next guest). Only the public kiosk navigations are cached.
  const isKioskNav =
    url.pathname === "/" ||
    url.pathname.startsWith("/products") ||
    url.pathname === "/cart" ||
    url.pathname === "/assistant";
  if (req.mode === "navigate" && !isKioskNav) return; // owner/staff/login → always network

  // Kiosk shell / static / product images: stale-while-revalidate.
  if (req.mode === "navigate" || url.pathname.startsWith("/_next/") || url.pathname.startsWith("/files/")) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const net = fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          })
          .catch(() => cached);
        return cached || net;
      }),
    );
  }
});
