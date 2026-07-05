const CACHE_NAME = "bt-app-cache-v5";

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

function isHtmlResponse(response) {
  if (!response || !response.ok) return false;
  const type = response.headers.get("content-type") || "";
  return type.includes("text/html");
}

function isRscRequest(request) {
  if (request.headers.get("RSC") === "1") return true;
  const accept = request.headers.get("Accept") || "";
  return accept.includes("text/x-component");
}

function isDocumentNavigation(request) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("Accept") || "";
  return accept.includes("text/html");
}

function isCacheableResponse(response) {
  return Boolean(response && response.ok && !isRedirectResponse(response));
}

async function putInCache(request, response) {
  if (!isCacheableResponse(response)) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone()).catch(() => undefined);
}

async function purgeBadEntries() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  await Promise.all(
    keys.map(async (request) => {
      const response = await cache.match(request);
      if (!response) return;
      if (isRedirectResponse(response)) {
        await cache.delete(request);
        return;
      }
      if (isDocumentNavigation(request) && !isHtmlResponse(response)) {
        await cache.delete(request);
      }
    }),
  );
}

async function matchHtmlByPathname(pathname) {
  const cache = await caches.open(CACHE_NAME);
  const direct = await cache.match(pathname);
  if (direct && isHtmlResponse(direct)) return direct;

  const keys = await cache.keys();
  for (const cachedRequest of keys) {
    if (new URL(cachedRequest.url).pathname !== pathname) continue;
    const match = await cache.match(cachedRequest);
    if (match && isHtmlResponse(match)) return match;
  }

  return null;
}

async function offlineFallback(pathname) {
  const preferred = [pathname, "/workouts", "/training", "/dashboard", "/offline.html", "/"];
  for (const path of preferred) {
    const match = await matchHtmlByPathname(path);
    if (match) return match;
  }
  return new Response(
    "<!DOCTYPE html><html lang=\"de\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Offline</title></head><body style=\"font-family:system-ui;padding:2rem;text-align:center\"><h1>Offline</h1><p>Seite noch nicht im Cache — bitte einmal online öffnen.</p><button onclick=\"location.replace('/training')\">Training</button></body></html>",
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function handleDocumentNavigation(request) {
  const pathname = new URL(request.url).pathname;
  const cached = await caches.match(request);
  if (cached && isHtmlResponse(cached)) return cached;

  const htmlByPath = await matchHtmlByPathname(pathname);
  if (htmlByPath) return htmlByPath;

  try {
    const response = await fetch(request);
    if (isHtmlResponse(response)) {
      await putInCache(request, response.clone());
      return response;
    }
    if (isRedirectResponse(response)) {
      const fallback = await matchHtmlByPathname(pathname);
      return fallback ?? (await offlineFallback(pathname));
    }
    const fallback = await matchHtmlByPathname(pathname);
    return fallback ?? (await offlineFallback(pathname));
  } catch {
    const fallback = await matchHtmlByPathname(pathname);
    return fallback ?? (await offlineFallback(pathname));
  }
}

async function handleRscRequest(request) {
  const cached = await caches.match(request);
  if (cached && !isRedirectResponse(cached)) return cached;

  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      await putInCache(request, response.clone());
      return response;
    }
    return cached ?? Response.error();
  } catch {
    if (cached && !isRedirectResponse(cached)) return cached;
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached && !isRedirectResponse(cached)) return cached;

  try {
    const response = await fetch(request);
    if (isRedirectResponse(response)) {
      const fallback = await matchHtmlByPathname(new URL(request.url).pathname);
      return fallback ?? (await offlineFallback(new URL(request.url).pathname));
    }
    await putInCache(request, response);
    return response;
  } catch {
    const fallback = await matchHtmlByPathname(new URL(request.url).pathname);
    return fallback ?? (await offlineFallback(new URL(request.url).pathname));
  }
}

async function warmPath(cache, path) {
  try {
    const docRequest = new Request(path, { credentials: "include" });
    const docResponse = await fetch(docRequest);
    if (isHtmlResponse(docResponse)) await cache.put(docRequest, docResponse.clone());

    const rscRequest = new Request(path, {
      credentials: "include",
      headers: {
        RSC: "1",
        "Next-Router-Prefetch": "1",
        "Next-Url": path.split("?")[0] ?? path,
      },
    });
    const rscResponse = await fetch(rscRequest);
    if (isCacheableResponse(rscResponse)) await cache.put(rscRequest, rscResponse.clone());
  } catch {
    /* offline during warm */
  }
}

async function warmRoutesFromClient(extraPaths = []) {
  const cache = await caches.open(CACHE_NAME);
  const seen = new Set();
  const allPaths = [...WARM_ROUTES, ...extraPaths];
  for (const path of allPaths) {
    const key = path.split("?")[0] ?? path;
    if (seen.has(key)) continue;
    seen.add(key);
    await warmPath(cache, path);
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
      await purgeBadEntries();
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

  if (isRscRequest(event.request)) {
    event.respondWith(handleRscRequest(event.request));
    return;
  }

  if (isDocumentNavigation(event.request)) {
    event.respondWith(handleDocumentNavigation(event.request));
    return;
  }

  event.respondWith(handleRscRequest(event.request));
});

self.addEventListener("message", (event) => {
  const data = event.data || {};

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (data.type === "warm-routes") {
    const paths = Array.isArray(data.payload?.paths) ? data.payload.paths : [];
    event.waitUntil(warmRoutesFromClient(paths));
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
