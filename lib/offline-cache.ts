const USER_ROUTE_PREFIXES = [
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
  "/exercises",
];

function isUserRoute(url: string) {
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    return USER_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  } catch {
    return false;
  }
}

/** Removes cached authenticated documents/RSC payloads without deleting the static offline shell. */
export async function clearOfflineUserCache() {
  if (typeof window === "undefined") return;

  navigator.serviceWorker?.controller?.postMessage({ type: "clear-user-data" });
  if (!("caches" in window)) return;

  const names = await window.caches.keys().catch(() => [] as string[]);
  await Promise.all(
    names
      .filter((name) => name.startsWith("bt-app-cache-"))
      .map(async (name) => {
        const cache = await window.caches.open(name);
        const requests = await cache.keys();
        await Promise.all(requests.filter((request) => isUserRoute(request.url)).map((request) => cache.delete(request)));
      }),
  );
}
