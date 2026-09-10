// Minimal service worker for now — just enough to make the app installable.
// Push notification handling will be added here in the next step.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
