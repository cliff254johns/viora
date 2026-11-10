/* ═══════════════════════════════════════════════════════════════
   VIORA — SERVICE WORKER  (v1.4.2)
   ─────────────────────────────────────────────────────────────
   Registered by main/sw-bootstrap.js at scope '/'.

   Legacy v1.1.0 fixes retained:
     • Cross-origin requests are NO LONGER intercepted.
       Fixes: "Module source URI is not allowed in this document"
              "NS_ERROR_CORRUPTED_CONTENT" on Firebase modules.
     • NETWORK_ONLY_HOSTS expanded to include:
         www.gstatic.com, cdnjs.cloudflare.com, cdn.jsdelivr.net,
         unpkg.com, esm.sh, static.cloudflareinsights.com
       Fixes: 503s on Font Awesome & Chart.js, CORS/SRI errors
              on the Cloudflare analytics beacon.
     • isStaticAsset() no longer misclassifies ES modules as
       immutable static chunks. Precedence was broken in v1.0.0.
     • Cache version bumped → old bad caches are purged on activate.

   Strategy (v1.4.2):
     • Reviewed VIORA entry pages + core modules → stale-while-revalidate
     • Static assets (images, fonts, media)      → cache-first
     • Firebase / Worker / CDN libs / auth       → NETWORK-ONLY (no SW)
     • Industry microsites and unreviewed routes → network-only
     • Google Fonts                              → dedicated cache

   Never intercepts:
     • non-GET requests
     • cross-origin API/CDN requests (except Google Fonts, which use a dedicated cache)
     • /main/*.js ES modules — they are shell, cached by SWR, but
       never returned from the "static" bucket
     • /.well-known/ (Firebase Auth handshakes)
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─── Version bump invalidates every cache below ─────────────── */
const SW_VERSION = 'viora-v1.4.2';
const CACHE_SHELL  = `${SW_VERSION}-shell`;
const CACHE_STATIC = `${SW_VERSION}-static`;
const CACHE_FONTS  = `${SW_VERSION}-fonts`;

/* ─── App shell — cached on install so first paint is offline ── */
const PRECACHE_URLS = [
  '/',
  '/main.html',
  '/main.css',
  '/main.js',
  '/manifest.webmanifest',
  '/viora.png',
  '/v0.html',
  '/market.html',
  '/client.html',
  '/training.html',
  '/patner.html',
];

/* ─── Hosts we must NEVER cache / intercept ────────────────────
   Anything here is left entirely to the browser's network stack.
   ──────────────────────────────────────────────────────────── */
const NETWORK_ONLY_HOSTS = new Set([
  // ── Firebase (realtime DB, auth, FCM, installations) ──
  'cliffclient-35ec5.firebaseio.com',
  'cliffclient-35ec5-default-rtdb.europe-west1.firebasedatabase.app',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'fcm.googleapis.com',
  'firebaseinstallations.googleapis.com',

  // ── Firebase SDK CDN (ES modules — SW must not touch) ──
  'www.gstatic.com',
  'gstatic.com',

  // ── VIORA Worker API ──
  'viora-api.cliff254johns.workers.dev',

  // ── Time / weather / FX APIs ──
  'worldtimeapi.org',
  'timeapi.io',
  'api.open-meteo.com',
  'exchangerate.host',

  // ── Third-party CDN libraries (ES modules and UMD bundles) ──
  //    Chart.js, Font Awesome, and anything else loaded via CDN.
  //    These MUST hit the network every time.
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'esm.sh',

  // ── Analytics beacons (intercepting breaks CORS + SRI) ──
  'static.cloudflareinsights.com',
  'cloudflareinsights.com',
  'cloudflare.com',
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
        if (res && res.ok && isCacheableResponse(res)) {
          await cache.put(url, res);
        } else {
          console.warn('[sw] precache skipped', url, res && res.status);
        }
      } catch (e) {
        console.warn('[sw] precache failed', url, e && e.message);
      }
    }));

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
        if (keep.has(key) || !key.startsWith('viora-')) return null;
        console.info('[sw] deleting stale VIORA cache', key);
        return caches.delete(key);
      })
    );

  })());
});

/* ═══════════════════════════════════════════════════════════════
   MESSAGE HANDLER
   ═══════════════════════════════════════════════════════════════ */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'PING' && event.source && event.source.postMessage) {
    event.source.postMessage({ type: 'PONG', version: SW_VERSION });
  }
});

/* ═══════════════════════════════════════════════════════════════
   FETCH — the critical path
   ═══════════════════════════════════════════════════════════════ */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only GET is cacheable.
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // ── (1) Never touch auth-sensitive / API / CDN hosts ──────
  //     This covers Firebase, the Worker, Chart.js, Font Awesome,
  //     analytics beacons, and every other "must hit network" host.
  if (NETWORK_ONLY_HOSTS.has(url.hostname)) return;

  // Sensitive same-origin endpoints and requests must bypass all caches.
  if (req.headers.has('authorization')) return;
  if (/^\/(?:api|auth|firebase|payment|payments|mpesa|webhook|tenant|tenants|user|users|session|sessions|uploads|private|account)(?:\/|$)/i.test(url.pathname)) return;
  if ([...url.searchParams.keys()].some((key) => /token|auth|session|tenant|user|uid|email|signature|secret|api[_-]?key/i.test(key))) return;

  // ── (2) Never intercept Firebase WebSocket / long-poll ────
  if (url.pathname.startsWith('/.well-known/')) return;

  // ── (3) Google Fonts → dedicated SWR cache ────────────────
  if (FONT_HOSTS.has(url.hostname)) {
    event.respondWith(fontsStrategy(req));
    return;
  }

  // ── (4) CROSS-ORIGIN — let the browser handle it directly ──
  //     This is the key fix. The SW MUST NOT intercept cross-origin
  //     requests. Doing so caused:
  //       • "Module source URI is not allowed in this document"
  //         on https://www.gstatic.com/firebasejs/12.18.0/firebase-*.js
  //       • NS_ERROR_CORRUPTED_CONTENT on firebase-database.js
  //       • 503s on Chart.js and Font Awesome when their CDN was
  //         momentarily unreachable
  //       • CORS + SRI failures on static.cloudflareinsights.com
  //     Any host not already filtered above still lands here — the
  //     safe answer is to do nothing and let the network resolve it.
  if (url.origin !== self.location.origin) return;

  // ── (5) SAME-ORIGIN — route by path ───────────────────────
  if (isAppShell(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, CACHE_SHELL));
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(req, CACHE_STATIC));
    return;
  }

  // Dynamic same-origin responses (API, JSON, user data, and unknown
  // routes) are network-only. Never put authenticated or tenant-specific
  // responses into Cache Storage; public HTML and static assets are handled
  // by the explicit shell/static branches above.
  return;
});

/* ═══════════════════════════════════════════════════════════════
   PATH CLASSIFIERS (Fix 4 — operator precedence corrected)
   ═══════════════════════════════════════════════════════════════ */

/**
 * True for immutable-ish same-origin assets that should be cached
 * forever (until SW_VERSION bumps).
 *
 * IMPORTANT: ES modules under /main/, main.js, and
 * campaigns-bootstrap.js are APP SHELL — they are handled by
 * staleWhileRevalidate, NOT by cacheFirst. The v1.0.0 version of
 * this function had broken operator precedence that let those
 * modules fall through to the "static" bucket, causing the SW to
 * serve stale copies after every code change.
 */
function isStaticAsset(pathname) {
  // Images
  if (/\.(?:png|jpe?g|gif|webp|svg|ico)$/i.test(pathname)) return true;
  // Fonts
  if (/\.(?:woff2?|ttf|otf|eot)$/i.test(pathname)) return true;
  // Geo data
  if (/\.(?:bin|geojson|topojson)$/i.test(pathname)) return true;
  // Audio
  if (/\.(?:mp3|wav|ogg)$/i.test(pathname)) return true;
  // CSS
  if (/\.css$/i.test(pathname)) return true;

  // JS — split carefully. Application ES modules are shell, NOT static.
  if (/\.js$/i.test(pathname)) {
    if (pathname === '/main.js') return false;
    if (/^\/main\//.test(pathname)) return false;                 // ES module dir
    if (/^\/campaigns-bootstrap\.js$/.test(pathname)) return false;
    // Any other root-level .js is treated as a static chunk
    // (e.g. a legacy bundled script you don't touch often).
    return true;
  }

  return false;
}

/**
 * True only for explicitly reviewed VIORA shell pages and core modules.
 * Authenticated portal content and industry microsites are never HTML-cached.
 */
const APP_SHELL_PATHS = new Set([
  '/',
  '/index.html',
  '/main.html',
  '/v0.html',
  '/market.html',
  '/client.html',
  '/training.html',
  '/patner.html',
]);

function isAppShell(pathname) {
  // Only explicitly reviewed VIORA entry points are eligible for HTML caching.
  // Industry microsites, dashboards and authenticated portal routes stay network-only.
  if (APP_SHELL_PATHS.has(pathname)) return true;
  if (pathname === '/main.js' || pathname === '/campaigns-bootstrap.js') return true;
  return /^\/main\/[^/]+\.js$/.test(pathname);
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

/** Stale-while-revalidate. Used only for the reviewed VIORA shell allowlist. */
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
    if (res && res.ok && isCacheableResponse(res)) {
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
     • opaque responses (status 0)
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
  if (/no-store|no-cache|private/i.test(cc)) return false;
  const vary = (res.headers.get('vary') || '').toLowerCase();
  if (vary === '*' || /(?:^|,)\s*(?:cookie|authorization)(?:\s*,|$)/.test(vary)) return false;

  return true;
}

/* ═══════════════════════════════════════════════════════════════
   PUSH NOTIFICATIONS
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
