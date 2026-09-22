const CACHE_NAME = "bt-app-cache-v15";

const INSTALL_SHELL = [
  "/manifest.webmanifest",
  "/icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-icon.png",
  "/offline.html",
];

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

function shouldBypassServiceWorker(url) {
  if (isAuthPath(url.pathname) || isApiRequest(url.pathname)) return true;
  return false;
}

function isStaticAsset(pathname) {
  return pathname.startsWith("/_next/static/") || pathname.startsWith("/_next/image/");
}

function isRedirectResponse(response) {
  if (!response) return false;
  if (response.redirected) return true;
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

function authRedirectTarget(response) {
  if (!response || response.type === "opaqueredirect") return null;
  try {
    if (response.redirected) {
      const finalUrl = new URL(response.url, self.location.origin);
      return isAuthPath(finalUrl.pathname) ? finalUrl.toString() : null;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      if (!location) return null;
      const target = new URL(location, self.location.origin);
      return isAuthPath(target.pathname) ? target.toString() : null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * A missing session redirects protected routes to /login. Returning that as a
 * network error hides the login page (notably in the installed mobile app).
 * Reissuing a real redirect lets the browser open /login, which bypasses this
 * worker. The login document is never cached under the protected URL.
 * Logged-in responses are not redirects, so they still take a single fetch.
 */
async function passthroughAuthRedirect(request) {
  const response = await fetch(request);
  const directTarget = authRedirectTarget(response);
  if (directTarget) return Response.redirect(directTarget, 302);
  if (response.type !== "opaqueredirect") return response;

  const followed = await fetch(request.url, {
    credentials: "include",
    redirect: "follow",
  });
  const followedTarget = authRedirectTarget(followed);
  if (followedTarget) return Response.redirect(followedTarget, 302);
  return Response.error();
}

async function sanitizeServiceWorkerResponse(response) {
  if (!response || isRedirectResponse(response) || !response.redirected) {
    return response;
  }
  const headers = new Headers(response.headers);
  const body = await response.arrayBuffer();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleDocumentNavigation(request) {
  const pathname = new URL(request.url).pathname;

  try {
    const response = await passthroughAuthRedirect(request);
    if (isRedirectResponse(response)) {
      return authRedirectTarget(response) ? response : Response.error();
    }
    const safe = await sanitizeServiceWorkerResponse(response);
    if (isHtmlResponse(safe)) {
      await putInCache(request, safe.clone());
      return safe;
    }
    const fallback = await matchHtmlByPathname(pathname);
    return fallback ?? (await offlineFallback(pathname));
  } catch {
    const cached = await caches.match(request);
    if (cached && isHtmlResponse(cached) && !isRedirectResponse(cached)) return cached;
    const fallback = await matchHtmlByPathname(pathname);
    return fallback ?? (await offlineFallback(pathname));
  }
}

async function handleRscRequest(request) {
  try {
    const response = await passthroughAuthRedirect(request);
    if (isRedirectResponse(response)) {
      return authRedirectTarget(response) ? response : Response.error();
    }
    const safe = await sanitizeServiceWorkerResponse(response);
    if (isCacheableResponse(safe)) {
      await putInCache(request, safe.clone());
      return safe;
    }
    const cached = await caches.match(request);
    return cached && !isRedirectResponse(cached) ? cached : Response.error();
  } catch {
    const cached = await caches.match(request);
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
      return Response.error();
    }
    const safe = await sanitizeServiceWorkerResponse(response);
    await putInCache(request, safe);
    return safe;
  } catch {
    const fallback = await matchHtmlByPathname(new URL(request.url).pathname);
    return fallback ?? (await offlineFallback(new URL(request.url).pathname));
  }
}

async function warmPath(cache, path) {
  try {
    const docRequest = new Request(path, { credentials: "include" });
    const docResponse = await fetch(docRequest);
    if (!isRedirectResponse(docResponse) && isHtmlResponse(docResponse) && !isAuthPath(new URL(docResponse.url).pathname)) {
      await cache.put(docRequest, docResponse.clone());
    }
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

async function clearUserCacheEntries() {
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  await Promise.all(
    requests.map((request) => {
      const pathname = new URL(request.url).pathname;
      const isUserRoute = WARM_ROUTES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
      );
      return isUserRoute ? cache.delete(request) : Promise.resolve(false);
    }),
  );
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
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1") return;
  if (shouldBypassServiceWorker(url)) return;

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

  if (data.type === "clear-user-data") {
    clearPendingReminders();
    event.waitUntil(clearUserCacheEntries());
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

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(self.registration.showNotification(payload.title || "Basketball Training", {
    body: payload.body || "Es gibt ein Update für dich.",
    tag: payload.tag || "bt-push-update",
    icon: "/icon.png",
    badge: "/icon.png",
    data: { url: payload.url || "/dashboard" },
  }));
});
