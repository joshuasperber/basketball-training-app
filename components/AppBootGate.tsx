"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { isProtectedAppPath } from "@/lib/app-routes";

let bootCompletedThisSession = false;

function waitForPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function finishBoot() {
  bootCompletedThisSession = true;
  delete document.body.dataset.appBooting;
  window.dispatchEvent(new Event("bt:app-boot-complete"));
}

/** Einmal pro Session — UI sofort aus Cache, Cloud-Sync im Hintergrund. */
export default function AppBootGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const hiddenRoute = !isProtectedAppPath(pathname);
  const [ready, setReady] = useState(() => hiddenRoute || bootCompletedThisSession);

  useEffect(() => {
    if (hiddenRoute || bootCompletedThisSession) {
      delete document.body.dataset.appBooting;
      setReady(true);
      return;
    }

    let cancelled = false;
    document.body.dataset.appBooting = "true";

    const run = async () => {
      await waitForPaint();
      if (cancelled) return;
      finishBoot();
      setReady(true);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [hiddenRoute]);

  if (!ready) {
    return (
      <main className="app-container flex min-h-screen items-center justify-center" role="status" aria-live="polite" aria-busy="true">
        <div className="app-card w-full max-w-sm text-center">
          <div className="app-busy-ball-ring mx-auto" aria-hidden>
            <span className="app-busy-ball">🏀</span>
          </div>
          <p className="app-busy-label mt-4">App wird vorbereitet …</p>
          <p className="app-busy-sublabel">Deine Trainingsdaten werden geladen.</p>
        </div>
      </main>
    );
  }

  return children;
}
