// PayHub service worker
// Hand-rolled to avoid webpack-only deps (Serwist/Workbox require webpack,
// but this project pins Turbopack). Bump CACHE_VERSION to invalidate.

const CACHE_VERSION = 'payhub-v1';
const OFFLINE_URL = '/offline';

// Precache the offline fallback at install time.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.add(OFFLINE_URL)));
  // Activate the new SW immediately on first install, no waiting for tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

const CACHE_FIRST_PATHS = [/_next\/static\//, /\/icons\//, /\.(?:png|jpg|jpeg|svg|webp|woff2?)$/];

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET; skip non-http(s) and cross-origin.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, fall back to cached /offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache a copy of successful HTML for future offline reads.
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_VERSION);
          const cached = await cache.match(request);
          return cached || cache.match(OFFLINE_URL);
        }),
    );
    return;
  }

  // Cache-first for hashed static assets and icons.
  if (CACHE_FIRST_PATHS.some((re) => re.test(url.pathname))) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response && response.status === 200) {
              const copy = response.clone();
              caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
