// Minimal service worker: exists only so the site is installable ("Add to Home
// Screen"). It deliberately does NOT intercept any request — re-issuing a POST
// body through a service worker can truncate multipart uploads on iOS Safari
// ("Unexpected end of form"). Everything goes straight to the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  /* no-op: never intercept — let the browser handle every request natively */
});
