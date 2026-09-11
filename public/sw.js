// Minimal service worker — install-to-home-screen + push notifications.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Show a notification when a push arrives
self.addEventListener("push", (event) => {
  let data = { title: "New message", body: "You have a new message in Circle" };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    // fall back to default text above
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "circle-message",
      renotify: true,
      data: { url: "/" },
    })
  );
});

// Clicking the notification focuses/opens the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
