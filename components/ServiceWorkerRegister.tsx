"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloadScheduled = false;

    const scheduleReloadForNewWorker = () => {
      if (reloadScheduled) return;
      reloadScheduled = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", scheduleReloadForNewWorker);

    void navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.update().catch(() => undefined);

        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch(() => {
        // noop
      });
  }, []);

  return null;
}
