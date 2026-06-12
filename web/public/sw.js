// Minimal PWA service worker: read-cache for the kiosk so a flaky rural connection
// still shows the catalog. NEVER caches writes (POST) — only GET.
// Bumped v2→v3: only successful responses are cached now, so purge any error pages a prior
// version may have stored as a fallback.
const CACHE = "cago-read-v3";

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
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
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
    url.pathname === "/map" ||
    url.pathname === "/assistant";
  // The sell screen is the one staff page that MUST open offline. Its shell carries no session
  // data (everything is fetched client-side from the API / IndexedDB cache), so caching it is
  // safe on a shared till; network-first means a redeploy still wins.
  const isSellNav = url.pathname === "/pos/sell" || url.pathname === "/pos/pending";
  if (req.mode === "navigate" && !isKioskNav && !isSellNav) return; // other owner/staff/login → always network

  // Kiosk navigation (the HTML shell): NETWORK-FIRST so a redeploy is picked up immediately
  // (an old cached shell can reference deleted /_next chunks → blank page); cache is only the
  // offline fallback.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        // ignoreSearch: the cached shell is keyed on the bare path, so /pos/sell?wanted=X must still
        // fall back to the cached /pos/sell rather than erroring out when offline.
        .catch(() => caches.match(req, { ignoreSearch: true })),
    );
    return;
  }

  // Static chunks / product images: stale-while-revalidate (hashed names → safe to cache).
  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/files/")) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const net = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || net;
      }),
    );
  }
});
