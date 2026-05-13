const CACHE_NAME = "bt-app-cache-v1";
const APP_SHELL = [
  "/",
  "/training",
  "/Weekly-Workout",
  "/workouts",
  "/stats",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned)).catch(() => undefined);
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match("/")),
      ),
  );
});

// Workout-Reminder: lokaler Push aus dem Client via postMessage
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "schedule-reminder") {
    const { title, body, tag, fireAtTs } = data.payload || {};
    const delay = Math.max(0, (fireAtTs || 0) - Date.now());
    setTimeout(() => {
      self.registration.showNotification(title || "Trainings-Reminder", {
        body: body || "Zeit fürs Workout! 🏀",
        tag: tag || "workout-reminder",
        icon: "/icon.png",
        badge: "/icon.png",
        data: { url: "/Weekly-Workout" },
      });
    }, delay);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification && event.notification.data && event.notification.data.url) || "/Weekly-Workout";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl).catch(() => undefined);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
