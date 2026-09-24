/* ============================================================
 * FuelUp service worker (vanilla — no build step, no dependencies).
 *
 * WHAT IT CACHES (application shell + static assets only):
 *  - precached: /offline page, icons, manifest
 *  - runtime CacheFirst: /_next/static/* (hashed, immutable),
 *    icons/images/fonts (public resources)
 *  - runtime NetworkFirst: navigations (same-URL shell copy, LRU 25)
 *
 * NEVER CACHED HERE (network-only, always):
 *  - /api/* (incl. /api/sync/*) — domain data lives in IndexedDB
 *  - Clerk hosts/responses, sign-in/sign-up pages
 *  - Next.js RSC flight payloads (?_rsc=) — user-specific
 *  - anything non-GET
 *
 * This worker NEVER touches IndexedDB, localStorage, or auth. It only
 * keeps resources loadable. Domain data + sync stay in the page
 * (Zustand → repositories → IndexedDB → syncNow()).
 *
 * Cache versioning below is independent of the IndexedDB schema version.
 * ============================================================ */

// Single version source for Cache Storage (bump to invalidate shell caches).
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `fuelup-static-${CACHE_VERSION}`;
const PAGES_CACHE = `fuelup-pages-${CACHE_VERSION}`;
const CURRENT_CACHES = [STATIC_CACHE, PAGES_CACHE];
const OFFLINE_URL = '/offline';
const MAX_NAV_ENTRIES = 25;
const NAV_TIMEOUT_MS = 5000;

const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  // Precache only. No skipWaiting here: a waiting worker lets the page show
  // "New version available" and the user chooses when to reload — an active
  // workout is never interrupted by a deploy.
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { credentials: 'same-origin' }))))
      )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('fuelup-') && !CURRENT_CACHES.includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isApiRequest(url, request) {
  if (url.pathname.startsWith('/api/')) return true;
  if (request.url.includes('_rsc=')) return true; // Next.js flight data
  return false;
}

function isAuthRelated(url, request) {
  if (url.pathname.startsWith('/sign-in') || url.pathname.startsWith('/sign-up')) return true;
  const host = url.hostname;
  if (host.includes('clerk')) return true;
  const dest = request.destination;
  if (dest === '' && url.pathname.startsWith('/__clerk')) return true;
  return false;
}

function isStaticAsset(url, request) {
  if (url.pathname.startsWith('/_next/static/')) return true;
  if (url.pathname.startsWith('/icons/')) return true;
  if (url.pathname === '/favicon.svg' || url.pathname === '/favicon.ico') return true;
  if (url.pathname === '/manifest.webmanifest') return true;
  if (request.destination === 'image' || request.destination === 'font') return true;
  return false;
}

function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: false });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone()).catch(() => undefined);
  }
  return response;
}

async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxEntries) {
      await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
    }
  } catch (_) {
    /* cache trimming is best-effort */
  }
}

async function navigationFallback(request) {
  try {
    const response = await fetchWithTimeout(request, NAV_TIMEOUT_MS);
    if (response && response.ok) {
      const cache = await caches.open(PAGES_CACHE);
      cache.put(request, response.clone()).catch(() => undefined);
      trimCache(PAGES_CACHE, MAX_NAV_ENTRIES).catch(() => undefined);
      return response;
    }
    throw new Error('bad-response');
  } catch (_) {
    const cache = await caches.open(PAGES_CACHE);
    const cachedShell = await cache.match(request, { ignoreSearch: true }).catch(() => undefined);
    if (cachedShell) return cachedShell;
    const offline = await caches.match(OFFLINE_URL).catch(() => undefined);
    if (offline) return offline;
    return new Response('FuelUp is offline.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Private/dynamic traffic: never intercept beyond passing through.
  if (isApiRequest(url, request) || isAuthRelated(url, request)) return;
  if (!isSameOrigin(url) && !isStaticAsset(url, request)) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationFallback(request));
    return;
  }
  if (isSameOrigin(url) && isStaticAsset(url, request)) {
    event.respondWith(
      cacheFirst(request, STATIC_CACHE).catch(() => fetch(request))
    );
    return;
  }
  // Same-origin public images/fonts referenced cross-page.
  if (request.destination === 'image' || request.destination === 'font') {
    event.respondWith(
      cacheFirst(request, STATIC_CACHE).catch(() => fetch(request))
    );
  }
});

// Optional Background Sync: wake the page so the EXISTING syncNow() runs.
// No sync logic lives here; unsupported browsers simply never fire this.
self.addEventListener('sync', (event) => {
  if (event.tag !== 'fuelup-sync') return;
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        clients.forEach((client) => {
          try {
            client.postMessage({ type: 'FUELUP_SYNC_NOW' });
          } catch (_) {
            /* client gone */
          }
        });
      })
      .catch(() => undefined)
  );
});

// Controlled updates only: skipWaiting runs on explicit user action.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting().catch(() => undefined);
  }
});
