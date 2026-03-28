const CACHE_VERSION = 15;
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

// Network-first for EVERYTHING during tournament — cache is only for offline fallback
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.pathname.includes('/api/')) return;

  e.respondWith(
    fetch(e.request).then(r => {
      const clone = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
