/* ═══════════════════════════════════════════════════════════════
   VIORA — SERVICE WORKER  (v1.0)
   ─────────────────────────────────────────────────────────────
   Registered by main/sw-bootstrap.js at scope '/'.

   Strategy:
     • App shell (HTML, main.css, main.js)  → stale-while-revalidate
     • Static assets (images, fonts, .bin, .geojson)
                                            → cache-first, long TTL
     • Firebase / Worker API / auth          → network-only (never cache)
     • Google Fonts                          → stale-while-revalidate
     • Everything else same-origin           → network-first with
                                                cache fallback

   Messages handled:
     • SKIP_WAITING  → activates a waiting SW immediately
     • CLEAR_CACHE   → wipes all app caches (called by sw-bootstrap.js)

   Notes:
     • Never intercepts non-GET requests.
     • Never intercepts cross-origin API calls (they carry auth tokens
       and must reach the network).
     • Version bump → purge old caches on activate.
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─── Version bump invalidates every cache below ─────────────── */
const SW_VERSION = 'viora-v1.0.0';
const CACHE_SHELL  = `${SW_VERSION}-shell`;
const CACHE_STATIC = `${SW_VERSION}-static`;
const CACHE_FONTS  = `${SW_VERSION}-fonts`;

/* ─── App shell — cached on install so first paint is offline ── */
const PRECACHE_URLS = [
  '/',
  '/main.html',
  '/main.css',
  '/main.js',
  '/manifest.json',
  '/viora.png',
  '/v0.html',
  '/market.html',
  '/client.html',
  '/training.html',
  '/patner.html',
];

/* ─── Hosts we must NEVER cache (auth-sensitive or live) ────── */
const NETWORK_ONLY_HOSTS = new Set([
  'cliffclient-35ec5.firebaseio.com',
  'cliffclient-35ec5-default-rtdb.europe-west1.firebasedatabase.app',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'fcm.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'viora-api.cliff254johns.workers.dev',
  'worldtimeapi.org',
  'timeapi.io',
  'cloudflare.com',
  'api.open-meteo.com',
  'exchangerate.host',
]);

/* ─── Google Fonts gets its own cache ──────────────────────── */
const FONT_HOSTS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);

/* ═══════════════════════════════════════════════════════════════
   INSTALL — precache the app shell
   ═══════════════════════════════════════════════════════════════ */
self.addEventListener('install', (event) => {
  console.info('[sw] install', SW_VERSION);

  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_SHELL);

    // Precache one by one — a single 404 must not abort the whole install.
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res && res.ok) {
          await cache.put(url, res);
        } else {
          console.warn('[sw] precache skipped', url, res && res.status);
        }
      } catch (e) {
        console.warn('[sw] precache failed', url, e && e.message);
      }
    }));

    // Take over immediately on a fresh install.
    await self.skipWaiting();
  })());
});

/* ═══════════════════════════════════════════════════════════════
   ACTIVATE — purge old caches, claim clients
   ═══════════════════════════════════════════════════════════════ */
self.addEventListener('activate', (event) => {
  console.info('[sw] activate', SW_VERSION);

  event.waitUntil((async () => {
    const allKeys = await caches.keys();
    const keep = new Set([CACHE_SHELL, CACHE_STATIC, CACHE_FONTS]);

    await Promise.all(
      allKeys.map((key) => {
        if (keep.has(key)) return null;
        console.info('[sw] deleting stale cache', key);
        return caches.delete(key);
      })
    );

    // Take control of all open tabs so requests immediately go through us.
    await self.clients.claim();
  })());
});

/* ═══════════════════════════════════════════════════════════════
   MESSAGE HANDLER
   ═══════════════════════════════════════════════════════════════ */
self.addEventListener('message', (event) => {
  const data = event.data || {};

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'CLEAR_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      console.info('[sw] all caches cleared');
      // Notify any controlled client that the cache is empty.
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(c => c.postMessage({ type: 'CACHE_CLEARED' }));
    })());
    return;
  }

  if (data.type === 'PING') {
    // Simple liveness probe.
    if (event.source && event.source.postMessage) {
      event.source.postMessage({ type: 'PONG', version: SW_VERSION });
    }
  }
});

/* ═══════════════════════════════════════════════════════════════
   FETCH
   ═══════════════════════════════════════════════════════════════ */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only GET is cacheable.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never touch auth-sensitive or API hosts.
  if (NETWORK_ONLY_HOSTS.has(url.hostname)) return;

  // Never intercept Firebase WebSocket handshakes or long-poll.
  if (url.pathname.startsWith('/.well-known/')) return;

  // Google Fonts → stale-while-revalidate (dedicated cache).
  if (FONT_HOSTS.has(url.hostname)) {
    event.respondWith(fontsStrategy(req));
    return;
  }

  // Same-origin → route by path.
  if (url.origin === self.location.origin) {
    if (isStaticAsset(url.pathname)) {
      event.respondWith(cacheFirst(req, CACHE_STATIC));
      return;
    }
    if (isAppShell(url.pathname)) {
      event.respondWith(staleWhileRevalidate(req, CACHE_SHELL));
      return;
    }
    // Any other same-origin request → network-first with cache fallback.
    event.respondWith(networkFirst(req, CACHE_STATIC));
    return;
  }

  // Cross-origin, non-blocked → network-first with cache fallback.
  // This covers CDN-hosted libs (Chart.js, FontAwesome, jsDelivr).
  event.respondWith(networkFirst(req, CACHE_STATIC));
});

/* ═══════════════════════════════════════════════════════════════
   PATH CLASSIFIERS
   ═══════════════════════════════════════════════════════════════ */
function isStaticAsset(pathname) {
  return (
    /\.(?:png|jpe?g|gif|webp|svg|ico)$/i.test(pathname) ||
    /\.(?:woff2?|ttf|otf|eot)$/i.test(pathname) ||
    /\.(?:bin|geojson|topojson|json)$/i.test(pathname) ||
    /\.(?:mp3|wav|ogg)$/i.test(pathname) ||
    /\.(?:css)$/i.test(pathname) ||
    /\.(?:js)$/i.test(pathname) && !/\/main\.js$/.test(pathname) &&
      !/\/main\/[^/]+\.js$/.test(pathname)
  );
}

function isAppShell(pathname) {
  return (
    pathname === '/' ||
    pathname.endsWith('.html') ||
    pathname === '/main.js' ||
    /\/main\/[^/]+\.js$/.test(pathname)
  );
}

/* ═══════════════════════════════════════════════════════════════
   STRATEGIES
   ═══════════════════════════════════════════════════════════════ */

/** Cache-first, network fallback. Good for immutable assets. */
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreSearch: false });
  if (cached) return cached;

  try {
    const res = await fetch(req);
    if (res && res.ok && isCacheableResponse(res)) {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (e) {
    // Offline and not cached. If it was an HTML nav, fall back to shell.
    if (req.mode === 'navigate') {
      const shell = await caches.match('/main.html');
      if (shell) return shell;
    }
    return new Response(
      '/* offline — resource not cached */',
      { status: 503, headers: { 'Content-Type': 'text/plain' } }
    );
  }
}

/** Stale-while-revalidate. Good for app shell + HTML. */
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);

  const networkPromise = fetch(req)
    .then((res) => {
      if (res && res.ok && isCacheableResponse(res)) {
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch(() => null);

  if (cached) {
    // Return cached immediately; refresh in the background.
    networkPromise.catch(() => {});
    return cached;
  }

  const network = await networkPromise;
  if (network) return network;

  // Offline + not cached. Navigations get the shell.
  if (req.mode === 'navigate') {
    const shell = await cache.match('/main.html');
    if (shell) return shell;
  }

  return new Response('Offline', {
    status: 503,
    headers: { 'Content-Type': 'text/plain' },
  });
}

/** Network-first with cache fallback. Good for "mostly fresh" resources. */
async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok && isCacheableResponse(res)) {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;

    if (req.mode === 'navigate') {
      const shell = await cache.match('/main.html');
      if (shell) return shell;
    }

    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/** Fonts — cache-first with network fill, long TTL handled by cache version. */
async function fontsStrategy(req) {
  const cache = await caches.open(CACHE_FONTS);
  const cached = await cache.match(req);
  if (cached) return cached;

  try {
    const res = await fetch(req);
    if (res && res.ok) {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (e) {
    // Return an empty CSS response so the page doesn't stall on fonts.
    if (req.destination === 'style') {
      return new Response('/* font offline */', {
        headers: { 'Content-Type': 'text/css' },
      });
    }
    return new Response('', { status: 504 });
  }
}

/* ═══════════════════════════════════════════════════════════════
   RESPONSE FILTER
   Don't cache:
     • opaque responses (status 0) — usually CDN with no CORS
     • partial content (206)
     • error responses
     • responses with no-cache headers
   ═══════════════════════════════════════════════════════════════ */
function isCacheableResponse(res) {
  if (!res) return false;
  if (res.status === 0) return false;         // opaque
  if (res.status === 206) return false;       // partial
  if (res.status >= 400) return false;

  const cc = res.headers.get('cache-control') || '';
  if (/no-store|no-cache/i.test(cc)) return false;

  return true;
}

/* ═══════════════════════════════════════════════════════════════
   PUSH NOTIFICATIONS
   ═══════════════════════════════════════════════════════════════
   firebase-messaging-sw.js is normally the one FCM talks to, but
   we register this SW at scope '/' so push events may land here.
   We forward them to a client if one is focused; otherwise show
   a system notification.
   ═══════════════════════════════════════════════════════════════ */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    try {
      payload = { notification: { title: 'VIORA', body: event.data.text() } };
    } catch (_) {
      payload = { notification: { title: 'VIORA', body: 'New notification' } };
    }
  }

  const n = payload.notification || {};
  const d = payload.data || {};
  const title = n.title || d.title || 'VIORA';
  const body  = n.body  || d.body  || '';
  const url   = d.url   || '/main.html';
  const icon  = n.icon  || '/viora.png';
  const badge = '/viora.png';

  event.waitUntil((async () => {
    // If a VIORA tab is focused, forward the event instead of showing
    // a system notification (avoids duplicate alerts).
    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    const focused = clients.find(c => c.focused);

    if (focused) {
      focused.postMessage({
        type: 'PUSH_FOREGROUND',
        title, body, url,
        data: d,
      });
      return;
    }

    await self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag: d.tag || 'viora',
      data: { url },
      vibrate: [80, 40, 80],
      requireInteraction: false,
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl =
    (event.notification.data && event.notification.data.url) ||
    '/main.html';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    // Prefer focusing an existing tab.
    for (const client of allClients) {
      try {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin) {
          await client.focus();
          client.postMessage({ type: 'NOTIFICATION_CLICK', url: targetUrl });
          return;
        }
      } catch (_) { /* ignore malformed URLs */ }
    }

    // No client open → open a new one.
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});

/* ═══════════════════════════════════════════════════════════════
   BACKGROUND SYNC  (optional — silently ignored on unsupported)
   ═══════════════════════════════════════════════════════════════
   main.js already drives queue flush via scheduleFlush(); this
   hook is here so a future `registration.sync.register('viora-flush')`
   can trigger it in the background.
   ═══════════════════════════════════════════════════════════════ */
self.addEventListener('sync', (event) => {
  if (event.tag !== 'viora-flush') return;

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    clients.forEach(c => c.postMessage({ type: 'FLUSH_OFFLINE_QUEUE' }));
  })());
});

/* ═══════════════════════════════════════════════════════════════
   ERROR LOGGING
   ═══════════════════════════════════════════════════════════════ */
self.addEventListener('error', (e) => {
  console.warn('[sw] error', e && (e.message || e));
});

self.addEventListener('unhandledrejection', (e) => {
  console.warn('[sw] unhandled rejection', e && (e.reason && e.reason.message || e.reason));
});

console.info('[sw] loaded', SW_VERSION);
