/* Offline support for the trip planner.
 *
 * The point of this is the mountains: Obertraun, Gosau and the passes have
 * patchy signal, and nobody wants to burn roaming to check what's on for
 * Tuesday. Once the page has been opened online, it opens with no signal.
 *
 * Update strategy is deliberate. The page is edited and re-pushed often, so
 * navigations go to the network FIRST and fall back to the cache. Online you
 * always get the newest build; offline you get the last one you saw. Icons
 * and the manifest never change, so those are served cache-first.
 *
 * Bump CACHE_VERSION on any release that must invalidate old copies.
 */
const CACHE_VERSION = "trip-v2";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      // one bad URL must not fail the whole install, so add them individually
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // leave third parties alone

  // The document itself: newest wins when there is a connection.
  if (req.mode === "navigate" || req.destination === "document") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // Everything else is static: serve it instantly, refresh quietly behind.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
