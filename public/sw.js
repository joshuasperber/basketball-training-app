const CACHE_NAME = "bt-app-cache-v3";

/** Nur öffentliche Assets beim Install — geschützte Seiten brauchen Auth-Cookies (Client-Warmup). */
const INSTALL_SHELL = ["/manifest.webmanifest", "/favicon.ico", "/icon.png", "/apple-icon.png"];

const WARM_ROUTES = [
  "/dashboard",
  "/training",
  "/weekly-workout",
  "/workouts",
  "/stats",
  "/team",
  "/profile",
  "/tips",
  "/game-track",
  "/level",
  "/liga",
  "/review",
  "/create-exercise",
];

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const pendingReminderTimers = new Map();

function clearPendingReminders() {
  for (const timerId of pendingReminderTimers.values()) {
    clearTimeout(timerId);
  }
  pendingReminderTimers.clear();
}

function scheduleReminderItem(item) {
  const { title, body, tag, fireAtTs } = item || {};
  const reminderTag = tag || "workout-reminder";
  const existing = pendingReminderTimers.get(reminderTag);
  if (existing) clearTimeout(existing);

  const timerId = setTimeout(() => {
    pendingReminderTimers.delete(reminderTag);
    self.registration.showNotification(title || "Trainings-Reminder", {
      body: body || "Zeit fürs Workout! 🏀",
      tag: reminderTag,
      icon: "/icon.png",
      badge: "/icon.png",
      data: { url: "/weekly-workout" },
    });
  }, Math.max(0, (fireAtTs || 0) - Date.now()));

  pendingReminderTimers.set(reminderTag, timerId);
}

function isSameOrigin(url) {
  return url.startsWith(self.location.origin);
}

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/_next/image/");
}

async function putInCache(request, response) {
  if (!response || !response.ok) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone()).catch(() => undefined);
}

async function matchByPathname(request) {
  const pathname = new URL(request.url).pathname;
  const cache = await caches.open(CACHE_NAME);

  const direct = await cache.match(pathname);
  if (direct) return direct;

  const keys = await cache.keys();
  for (const cachedRequest of keys) {
    if (new URL(cachedRequest.url).pathname === pathname) {
      const match = await cache.match(cachedRequest);
      if (match) return match;
    }
  }

  return null;
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    await putInCache(request, response);
    return response;
  } catch {
    return (await matchByPathname(request)) || (await caches.match("/")) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(async (response) => {
      await putInCache(request, response);
      return response;
    })
    .catch(() => null);

  if (cached) {
    void networkPromise;
    return cached;
  }

  const network = await networkPromise;
  if (network) return network;

  const pathnameMatch = await matchByPathname(request);
  if (pathnameMatch) return pathnameMatch;

  const root = await caches.match("/");
  if (root) return root;

  return new Response("Offline — bitte einmal online alle Tabs öffnen.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function warmRoutesFromClient() {
  const cache = await caches.open(CACHE_NAME);
  for (const path of WARM_ROUTES) {
    try {
      const docRequest = new Request(path, { credentials: "include" });
      const docResponse = await fetch(docRequest);
      if (docResponse.ok) await cache.put(docRequest, docResponse.clone());

      const rscRequest = new Request(path, {
        credentials: "include",
        headers: {
          RSC: "1",
          "Next-Router-Prefetch": "1",
          "Next-Url": path,
        },
      });
      const rscResponse = await fetch(rscRequest);
      if (rscResponse.ok) await cache.put(rscRequest, rscResponse.clone());
    } catch {
      /* offline during warm */
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(INSTALL_SHELL)).catch(() => undefined),
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
  if (!isSameOrigin(event.request.url)) return;

  const url = new URL(event.request.url);
  if (isApiRequest(url)) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});

self.addEventListener("message", (event) => {
  const data = event.data || {};

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (data.type === "warm-routes") {
    event.waitUntil(warmRoutesFromClient());
    return;
  }

  if (data.type === "clear-reminders") {
    clearPendingReminders();
    return;
  }

  if (data.type === "sync-reminders") {
    clearPendingReminders();
    const items = Array.isArray(data.payload?.items) ? data.payload.items : [];
    for (const item of items) {
      scheduleReminderItem(item);
    }
    return;
  }

  if (data.type === "schedule-reminder") {
    scheduleReminderItem(data.payload || {});
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification && event.notification.data && event.notification.data.url) || "/weekly-workout";
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
