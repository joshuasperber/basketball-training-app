const CACHE_NAME = "bt-app-cache-v4";

const INSTALL_SHELL = ["/manifest.webmanifest", "/favicon.ico", "/icon.png", "/apple-icon.png", "/offline.html"];

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

function isAuthPath(pathname) {
  return pathname === "/login" || pathname.startsWith("/auth/");
}

function isApiRequest(pathname) {
  return pathname.startsWith("/api/");
}

function isStaticAsset(pathname) {
  return pathname.startsWith("/_next/static/") || pathname.startsWith("/_next/image/");
}

function isRedirectResponse(response) {
  if (!response) return false;
  if (response.type === "opaqueredirect") return true;
  return response.status >= 300 && response.status < 400;
}

function isCacheableResponse(response) {
  return Boolean(response && response.ok && !isRedirectResponse(response));
}

async function putInCache(request, response) {
  if (!isCacheableResponse(response)) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone()).catch(() => undefined);
}

async function purgeRedirectEntries() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  await Promise.all(
    keys.map(async (request) => {
      const response = await cache.match(request);
      if (response && isRedirectResponse(response)) {
        await cache.delete(request);
      }
    }),
  );
}

async function matchByPathname(request) {
  const pathname = new URL(request.url).pathname;
  const cache = await caches.open(CACHE_NAME);

  const direct = await cache.match(pathname);
  if (direct && !isRedirectResponse(direct)) return direct;

  const keys = await cache.keys();
  for (const cachedRequest of keys) {
    if (new URL(cachedRequest.url).pathname !== pathname) continue;
    const match = await cache.match(cachedRequest);
    if (match && !isRedirectResponse(match)) return match;
  }

  return null;
}

async function offlineFallback(pathname) {
  const cache = await caches.open(CACHE_NAME);
  const preferred = [pathname, "/dashboard", "/weekly-workout", "/training", "/offline.html", "/"];
  for (const path of preferred) {
    const match = await cache.match(path);
    if (match && !isRedirectResponse(match)) return match;
    const byPath = await matchByPathname(new Request(path));
    if (byPath) return byPath;
  }
  return new Response(
    "<!DOCTYPE html><html lang=\"de\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Offline</title></head><body style=\"font-family:system-ui;padding:2rem;text-align:center\"><h1>Offline</h1><p>Bitte einmal online die App öffnen, damit alle Seiten gespeichert werden.</p><button onclick=\"location.reload()\">Erneut versuchen</button></body></html>",
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached && !isRedirectResponse(cached)) return cached;

  try {
    const response = await fetch(request);
    if (isRedirectResponse(response)) {
      const fallback = await matchByPathname(request);
      return fallback ?? (await offlineFallback(new URL(request.url).pathname));
    }
    await putInCache(request, response);
    return response;
  } catch {
    const fallback = await matchByPathname(request);
    return fallback ?? (await offlineFallback(new URL(request.url).pathname));
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const safeCached = cached && !isRedirectResponse(cached) ? cached : null;

  const networkPromise = fetch(request)
    .then(async (response) => {
      if (isRedirectResponse(response)) {
        return null;
      }
      await putInCache(request, response);
      return response;
    })
    .catch(() => null);

  if (safeCached) {
    void networkPromise;
    return safeCached;
  }

  const network = await networkPromise;
  if (network) return network;

  const pathnameMatch = await matchByPathname(request);
  if (pathnameMatch) return pathnameMatch;

  return offlineFallback(new URL(request.url).pathname);
}

async function warmRoutesFromClient() {
  const cache = await caches.open(CACHE_NAME);
  for (const path of WARM_ROUTES) {
    try {
      const docRequest = new Request(path, { credentials: "include" });
      const docResponse = await fetch(docRequest);
      if (isCacheableResponse(docResponse)) await cache.put(docRequest, docResponse.clone());

      const rscRequest = new Request(path, {
        credentials: "include",
        headers: {
          RSC: "1",
          "Next-Router-Prefetch": "1",
          "Next-Url": path,
        },
      });
      const rscResponse = await fetch(rscRequest);
      if (isCacheableResponse(rscResponse)) await cache.put(rscRequest, rscResponse.clone());
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
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await purgeRedirectEntries();
    })(),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!isSameOrigin(event.request.url)) return;

  const url = new URL(event.request.url);
  if (isApiRequest(url.pathname) || isAuthPath(url.pathname)) return;

  if (isStaticAsset(url.pathname)) {
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
