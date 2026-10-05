// Service worker: an installable shell plus read-only offline access.
//
// Deliberately conservative. Picking requires the network — serving a cached
// pick screen would let someone fill in a card that silently fails to save, or
// show lines that have since moved. Standings and past results are safe to show
// stale, so they fall back to cache with a banner rendered by the page.

const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const PAGES = `pages-${VERSION}`;

const PRECACHE = ['/offline', '/icon.svg', '/manifest.webmanifest'];

// Pages worth showing stale rather than showing nothing.
const CACHEABLE_PAGES = ['/standings', '/profile', '/home'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses: picks, lock state and grading must be fresh, and
  // a stale pick response would misreport what was saved.
  if (url.pathname.startsWith('/api/')) return;

  // Auth routes must always hit the network or a stale redirect can trap a user
  // in a signed-out loop.
  if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/login')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request, url));
    return;
  }

  // Static assets: cache-first, since Next fingerprints their filenames.
  if (url.pathname.startsWith('/_next/static/') || PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

async function handleNavigation(request, url) {
  try {
    const response = await fetch(request);
    if (response.ok && CACHEABLE_PAGES.some((p) => url.pathname.startsWith(p))) {
      const copy = response.clone();
      const cache = await caches.open(PAGES);
      cache.put(request, copy);
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    const offline = await caches.match('/offline');
    if (offline) return offline;

    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

// Push ------------------------------------------------------------------------
//
// iOS delivers push only to a PWA added to the home screen, and only from
// 16.4 — in a Safari tab none of this ever fires.

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Sunday Showdown', body: event.data.text() };
  }

  const title = payload.title || 'Sunday Showdown';
  const options = {
    body: payload.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    // A tag collapses repeats of the same event into one notification rather
    // than stacking three lock reminders on the lock screen.
    tag: payload.tag || 'sunday-showdown',
    renotify: true,
    data: { url: payload.url || '/home' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/home';

  // Focus an open tab if there is one rather than opening a second copy.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
