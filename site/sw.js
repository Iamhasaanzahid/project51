/* MHZALY service worker — instant loads + offline resilience.
   Only same-origin assets are cached; AI APIs are never intercepted. */
const CACHE = "mhzaly-v19";
// three.js is served from jsDelivr: the same 1.27 MB file is cut short by the
// static host on slow links, and a truncated ES module cannot be recovered.
// A pinned version is immutable, so it is safe to cache for as long as we like.
const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0/";
const VENDOR = [
  THREE_CDN + "build/three.module.js",
  THREE_CDN + "examples/jsm/loaders/GLTFLoader.js",
  THREE_CDN + "examples/jsm/environments/RoomEnvironment.js",
  THREE_CDN + "examples/jsm/exporters/GLTFExporter.js",
  THREE_CDN + "examples/jsm/utils/BufferGeometryUtils.js",
  THREE_CDN + "examples/jsm/utils/TextureUtils.js",
];
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
      .then((cache) => Promise.allSettled(CORE.concat(VENDOR).map((url) => cache.add(url))))
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

  // three.js from the pinned CDN: cache-first so a repeat visit never waits
  // and the 3D studio still opens with no network at all.
  if (url.origin === "https://cdn.jsdelivr.net" && url.pathname.startsWith("/npm/three@0.160.0/")) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
          }
          return res;
        })
      )
    );
    return;
  }

  if (url.origin !== self.location.origin) return; // never touch AI endpoints
  // Never intercept blob:/data: — the 3D loader fetches GLB textures from
  // blob: URLs and a service worker cannot fetch those; it would break the model.
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Range requests are answered piece by piece. Each piece is kept so a
  // dropped connection can resume instead of starting the model over.
  if (req.headers.has("range")) {
    event.respondWith(
      (async () => {
        const range = req.headers.get("range") || "";
        const m = /bytes=(\d+)-(\d+)/.exec(range);
        const want = m ? Number(m[2]) - Number(m[1]) + 1 : 0;
        let cache = null, key = null;
        try {
          cache = await caches.open(CACHE);
          key = new Request(req.url + "?__range=" + encodeURIComponent(range));
          const hit = await cache.match(key);
          if (hit) return hit;
        } catch (e) {}
        const res = await fetch(req);
        if (cache && key && res && res.status === 206 && want > 0) {
          try {
            const body = await res.clone().arrayBuffer();
            if (body.byteLength === want) {
              const headers = new Headers(res.headers);
              headers.set("content-length", String(body.byteLength));
              headers.delete("content-range");
              await cache.put(key, new Response(body, { status: 200, headers }));
            }
          } catch (e) {}
        }
        return res;
      })()
    );
    return;
  }

  // Avatars are large. They are fetched from the network first and written
  // to the cache ONLY when the body arrived complete, so a dropped download
  // can never poison the cache. If the network fails we serve the last
  // complete copy instead of a broken model.
  if (url.pathname.startsWith("/models/")) {
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          if (res && res.ok) {
            try {
              const body = await res.clone().arrayBuffer();
              const expected = Number(res.headers.get("content-length") || 0);
              if (!expected || body.byteLength === expected) {
                const cache = await caches.open(CACHE);
                await cache.put(req, new Response(body, { headers: res.headers, status: res.status }));
              }
            } catch (e) {}
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/offline.html")))
    );
    return;
  }

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
