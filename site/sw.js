/* MHZALY service worker — instant loads + offline resilience.
   Only same-origin assets are cached; AI APIs are never intercepted. */
const CACHE = "mhzaly-v11";
const CORE = [
  "/",
  "/index.html",
  "/mhzaly-ar.html",
  "/lookbook.html",
  "/about.html",
  "/privacy.html",
  "/terms.html",
  "/404.html",
  "/offline.html",
  "/app.js",
  "/styles.css",
  "/pages.css",
  "/mhzaly-ar.css",
  "/fonts.css",
  "/manifest.json",
  "/pwa.js",
  "/vendor/three.module.js",
  "/vendor/addons/loaders/GLTFLoader.js",
  "/vendor/addons/environments/RoomEnvironment.js",
  "/vendor/addons/exporters/GLTFExporter.js",
  "/vendor/addons/utils/BufferGeometryUtils.js",
  "/vendor/addons/utils/TextureUtils.js",
  "/hero-look.jpg",
  "/img/icon-192.png",
  "/img/icon-512.png",
  "/img/lookbook/kurta-cream.jpg",
  "/img/lookbook/saree-emerald.jpg",
  "/img/lookbook/sherwani-navy.jpg",
  "/img/lookbook/bag-tan.jpg",
  "/img/lookbook/sneakers-white.jpg",
  "/img/lookbook/sofa-terracotta.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Add individually so one 404 cannot abort the whole precache.
      .then((cache) => Promise.allSettled(CORE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch AI endpoints

  const isHTML = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

  if (isHTML) {
    // Network-first for documents, offline page as the last resort.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match("/offline.html") || caches.match("/index.html"))
        )
    );
    return;
  }

  // Stale-while-revalidate for static assets.
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
