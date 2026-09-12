// Minimal service worker — exists only so EBBLESS qualifies as an installable PWA.
// No offline caching: the app needs live network access (Spotify/YouTube fetches
// via the Worker) on every load, so this stays a pass-through fetch handler.
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { self.clients.claim(); });
self.addEventListener('fetch', () => {});
