const CACHE_NAME = 'ggmt-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/scanner.js',
  './js/db.js',
  './js/parser-gncpuluf.js',
  './js/export-txt.js',
  './js/export-pdf.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/beep.ogg',
  './assets/error.ogg',
  // CDN (offline için önbelleğe al)
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/umd/index.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Cache-first, network fallback
self.addEventListener('fetch', (e) => {
  const req = e.request;
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => {
          // Sadece GET ve aynı origin + whitelisted CDNs
          try {
            const okCdn = /cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/.test(new URL(req.url).host);
            if (req.method === 'GET' && (new URL(req.url).origin === location.origin || okCdn)) {
              cache.put(req, copy);
            }
          } catch(_) {}
        });
        return res;
      }).catch(() => cached || new Response('Offline', {status: 503}));
    })
  );
});
