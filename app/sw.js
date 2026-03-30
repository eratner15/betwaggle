const CACHE_VERSION = 21;
const CACHE = `mg-2026-v${CACHE_VERSION}`;
const ASSETS = [
  "/app/",
  "/app/index.html",
  "/app/css/styles.css",
  "/app/js/app.js",
  "/app/js/data.js",
  "/app/js/storage.js",
  "/app/js/views.js",
  "/app/js/betting.js",
  "/app/js/sync.js",
  "/app/manifest.json"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Push Notifications ──
self.addEventListener("push", e => {
  if (!e.data) return;
  let data;
  try { data = e.data.json(); } catch { data = { title: 'Waggle', body: e.data.text() }; }

  const title = data.title || 'Waggle Update';
  const options = {
    body: data.body || '',
    icon: '/app/icon-180.svg',
    badge: '/app/icon-180.svg',
    tag: data.tag || 'waggle-update',
    renotify: true,
    data: { url: data.url || self.registration.scope },
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = e.notification.data?.url || self.registration.scope;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => c.url === url);
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});

// Cache-first for static assets (fast on spotty golf course WiFi/cellular)
// Network-first for HTML (ensures fresh config and content)
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.pathname.includes('/api/')) return;

  const isStatic = /\.(css|js|json|png|jpg|svg|woff2?)$/.test(url.pathname);

  if (isStatic) {
    // Network-first with 1.5s timeout: prevents stale flash on demo load
    // Falls back to cache on slow network (golf course cellular) or offline
    e.respondWith(
      Promise.race([
        fetch(e.request).then(r => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return r;
        }),
        new Promise(resolve =>
          setTimeout(() => caches.match(e.request).then(resolve), 1500)
        )
      ]).then(r => r || caches.match(e.request))
    );
  } else {
    // Network-first for HTML: ensures fresh content, falls back to cache offline
    e.respondWith(
      fetch(e.request).then(r => {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return r;
      }).catch(() => caches.match(e.request))
    );
  }
});
