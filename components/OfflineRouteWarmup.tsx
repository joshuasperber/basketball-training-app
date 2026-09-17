"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { isAppOnline } from "@/lib/app-online";
import { OFFLINE_APP_ROUTES } from "@/lib/offline-routes";
import { hasOfflineSessionHint } from "@/lib/offline-session";

const WARMUP_INTERVAL_MS = 30 * 60 * 1000;
const LAST_WARMUP_KEY = "bt.offline-warmup-at.v1";

function postSwMessage(type: string, payload?: unknown) {
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage({ type, payload });
  });
}

/** Prefetch der stabilen Haupt-Routen für schnelle und offline-fähige Navigation. */
export default function OfflineRouteWarmup() {
  const router = useRouter();
  const lastWarmupRef = useRef(0);

  useEffect(() => {
    const warm = (force = false) => {
      if (!isAppOnline()) return;
      if (!hasOfflineSessionHint()) return;
      if (document.visibilityState === "hidden") return;

      const now = Date.now();
      const storedWarmupAt = Number(window.localStorage.getItem(LAST_WARMUP_KEY) ?? "0");
      const lastWarmupAt = Math.max(
        lastWarmupRef.current,
        Number.isFinite(storedWarmupAt) ? storedWarmupAt : 0,
      );
      if (!force && lastWarmupAt > 0 && now - lastWarmupAt < WARMUP_INTERVAL_MS) {
        return;
      }
      lastWarmupRef.current = now;
      window.localStorage.setItem(LAST_WARMUP_KEY, String(now));

      // Warm only stable top-level routes. Exercise/workout detail pages are
      // cached naturally when opened; eagerly fetching an entire user catalog
      // caused dozens of duplicate requests and delayed ordinary navigation.
      const paths = [...OFFLINE_APP_ROUTES];
      postSwMessage("warm-routes", { paths });

      for (const path of paths) {
        router.prefetch(path.split("?")[0] ?? path);
      }
    };

    // Do not compete with login hydration or the user's first navigation.
    const initialWarmup = window.setTimeout(() => warm(false), 5000);
    const onOnline = () => warm(true);

    window.addEventListener("online", onOnline);

    return () => {
      window.clearTimeout(initialWarmup);
      window.removeEventListener("online", onOnline);
    };
  }, [router]);

  return null;
}
