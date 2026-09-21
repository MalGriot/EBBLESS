// Service worker for EBBLESS.
//
// The app still needs live network access (Spotify/YouTube fetches via the
// Worker) on every load, so this does NOT turn into a full offline-caching
// service worker - API calls, audio, and images stay pure pass-through,
// uncached, exactly like before.
//
// What changed: EBBLESS is a single HTML file with no build step, so a
// deploy usually only changes index.html - it doesn't touch sw.js at all.
// A browser only re-checks/re-installs a service worker when the SW *file
// itself* is byte-different, so a version-less sw.js like the old one gave
// browsers nothing to notice, and installed/home-screen users could sit on
// a stale index.html indefinitely with no update ever firing. CACHE_VERSION
// below exists specifically to be bumped on every deploy: bumping it changes
// sw.js's bytes, which is what makes the browser notice there's a new
// worker, install it, and (via skipWaiting/clients.claim, kept from before)
// activate it promptly.
//
// Once activated, this worker also caches the app shell (this file's own
// scope, index.html, manifest.json) so there is something for `activate` to
// version and clean up - old shell caches from a previous CACHE_VERSION are
// deleted, which is the actual "stale cache invalidation" fix. Navigations
// are served network-first (always try for the freshest index.html; only
// fall back to the cached shell when offline), so this cache is a safety
// net for offline/flaky connections, not a way to ever serve older content
// over a fresh one.
//
// IMPORTANT: bump CACHE_VERSION on every deploy you want existing
// installs/tabs to pick up promptly.
const CACHE_VERSION = 'ebbless-shell-v2';
const SHELL_ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => Promise.all(
      SHELL_ASSETS.map((url) =>
        fetch(url, { cache: 'reload' })
          .then((res) => { if (res.ok) return cache.put(url, res); })
          .catch(() => {})
      )
    ))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Only the top-level navigation (index.html) is worth caching/versioning.
  // Everything else - Worker/Spotify/YouTube requests, audio, images - is
  // left completely alone, same as before.
  if (e.request.mode !== 'navigate') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((cached) => cached || caches.match('./index.html')))
  );
});
