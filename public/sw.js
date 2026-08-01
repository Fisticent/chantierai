const CACHE_NAME = 'chantierexpress-cache-v4';
// Precache only stable public assets. Hashed Vite bundles (/assets/*) are
// cached opportunistically after a successful network fetch.
// '/' et '/index.html' sont précachés pour que le 1er lancement hors-ligne
// d'une app installée affiche l'interface au lieu d'une page blanche.
const ASSETS = [
  '/',
  '/index.html',
  '/icon.svg',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  if (url.includes('googleapis.com') || url.includes('groq.com') || url.includes('fonts.g')) {
    return;
  }

  // Navigations + JS/CSS: network-first so deploys are visible immediately.
  // Stale cache-first was keeping users on old bundles (e.g. delete without confirm).
  const accept = e.request.headers.get('accept') || '';
  const isNavigation = e.request.mode === 'navigate' || accept.includes('text/html');
  const isAppShell = /\.(?:js|css)(?:$|\?)/.test(url) || url.includes('/assets/');
  // Le manifeste conditionne l'installabilité : servi en stale-while-revalidate,
  // un ancien manifeste en cache (ex. sans icône PNG) empêche Chrome de proposer
  // l'installation tant que le cache n'a pas tourné. Toujours réseau d'abord.
  const isManifest = /\/manifest\.json(?:$|\?)/.test(url);

  if (isNavigation || isAppShell || isManifest) {
    e.respondWith(
      fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone)).catch(() => {});
          }
          return networkResponse;
        })
        // En network-first la racine est cachée sous la clé '/', pas '/index.html' :
        // on essaie les deux, sinon le repli hors-ligne ne matche jamais.
        .catch(() => caches.match(e.request)
          .then((cached) => cached || caches.match('/index.html'))
          .then((cached) => cached || caches.match('/')))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(e.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse)).catch(() => {});
            }
          })
          .catch(() => {});
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone)).catch(() => {});
        }
        return networkResponse;
      });
    })
  );
});

// Make system notifications clickable (focus the app tab on click)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
