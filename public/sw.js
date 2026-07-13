// Minimal service worker: enables "Add to Home Screen" / standalone display.
// Intentionally network-pass-through — media and API are private and change
// often, so we don't cache them (avoids stale content and auth surprises).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  // Pass through to the network. A fetch handler is required for installability.
  e.respondWith(fetch(e.request));
});
