"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { isAppOnline } from "@/lib/app-online";
import { collectCatalogWarmPaths, OFFLINE_APP_ROUTES } from "@/lib/offline-routes";
import { hasOfflineSessionHint } from "@/lib/offline-session";
import { loadExercises, loadWorkouts } from "@/lib/training-storage";

const WARMUP_INTERVAL_MS = 30 * 60 * 1000;

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
        "Next-Url": path.split("?")[0] ?? path,
      },
    });
  } catch {
    /* optional RSC warmup */
  }
}

function buildAllWarmPaths() {
  const catalog = new Set(collectCatalogWarmPaths());
  for (const exercise of loadExercises()) {
    catalog.add(`/exercises/${exercise.id}`);
  }
  for (const workout of loadWorkouts()) {
    catalog.add(`/workouts?workoutId=${encodeURIComponent(workout.id)}`);
  }
  return [...OFFLINE_APP_ROUTES, ...catalog];
}

/** Prefetch aller Haupt-Routen + Katalog für Offline-Navigation. */
export default function OfflineRouteWarmup() {
  const router = useRouter();
  const lastWarmupRef = useRef(0);

  useEffect(() => {
    const warm = (force = false) => {
      if (!isAppOnline()) return;
      if (!hasOfflineSessionHint()) return;

      const now = Date.now();
      if (!force && lastWarmupRef.current > 0 && now - lastWarmupRef.current < WARMUP_INTERVAL_MS) {
        return;
      }
      lastWarmupRef.current = now;

      const paths = buildAllWarmPaths();
      postSwMessage("warm-routes", { paths });

      for (const path of paths) {
        router.prefetch(path.split("?")[0] ?? path);
      }

      void (async () => {
        for (let index = 0; index < paths.length; index += 1) {
          await warmRouteDocument(paths[index]!);
          if (index > 0 && index % 12 === 0) {
            await new Promise((resolve) => window.setTimeout(resolve, 50));
          }
        }
      })();
    };

    void warm(true);
    const retryWarm = window.setTimeout(() => warm(true), 3000);
    const onBootComplete = () => warm(true);
    const onOnline = () => warm(true);

    window.addEventListener("bt:app-boot-complete", onBootComplete);
    window.addEventListener("online", onOnline);

    return () => {
      window.clearTimeout(retryWarm);
      window.removeEventListener("bt:app-boot-complete", onBootComplete);
      window.removeEventListener("online", onOnline);
    };
  }, [router]);

  return null;
}
