"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { OFFLINE_APP_ROUTES } from "@/lib/offline-routes";
import { hasOfflineSessionHint } from "@/lib/offline-session";

const WARMUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

function postSwMessage(type: string, payload?: unknown) {
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage({ type, payload });
  });
}

async function warmRouteDocument(path: string) {
  try {
    await fetch(path, { credentials: "include", cache: "no-cache" });
  } catch {
    /* offline or blocked */
  }

  try {
    await fetch(path, {
      credentials: "include",
      cache: "no-cache",
      headers: {
        RSC: "1",
        "Next-Router-Prefetch": "1",
        "Next-Url": path,
      },
    });
  } catch {
    /* optional RSC warmup */
  }
}

/** Prefetch aller Haupt-Routen für Offline-Navigation (beliebige Tab-Reihenfolge). */
export default function OfflineRouteWarmup() {
  const router = useRouter();
  const lastWarmupRef = useRef(0);

  useEffect(() => {
    const warm = (force = false) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (!hasOfflineSessionHint()) return;

      const now = Date.now();
      if (!force && lastWarmupRef.current > 0 && now - lastWarmupRef.current < WARMUP_INTERVAL_MS) {
        return;
      }
      lastWarmupRef.current = now;

      postSwMessage("warm-routes");

      for (const path of OFFLINE_APP_ROUTES) {
        router.prefetch(path);
      }

      void (async () => {
        for (const path of OFFLINE_APP_ROUTES) {
          await warmRouteDocument(path);
        }
      })();
    };

    void warm(true);
    const retryWarm = window.setTimeout(() => warm(true), 4000);

    const onOnline = () => warm(true);
    window.addEventListener("online", onOnline);

    return () => {
      window.clearTimeout(retryWarm);
      window.removeEventListener("online", onOnline);
    };
  }, [router]);

  return null;
}
