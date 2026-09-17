"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { isProtectedAppPath } from "@/lib/app-routes";
import AppRouteSkeleton from "@/components/AppRouteSkeleton";

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
    return <AppRouteSkeleton label="Deine Trainingsdaten werden geladen" />;
  }

  return children;
}
