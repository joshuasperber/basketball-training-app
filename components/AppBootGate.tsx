"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { isAppOnline } from "@/lib/app-online";
import { fetchAuthMe } from "@/lib/auth-session-align";
import { ensureInitialCloudSync } from "@/lib/progress-sync";

const HIDDEN_PREFIXES = ["/login", "/auth/"];

let bootCompletedThisSession = false;

function isHiddenBootRoute(pathname: string) {
  return HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

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
  const hiddenRoute = isHiddenBootRoute(pathname);

  useEffect(() => {
    if (hiddenRoute || bootCompletedThisSession) {
      delete document.body.dataset.appBooting;
      return;
    }

    let cancelled = false;

    const run = async () => {
      await waitForPaint();
      if (cancelled) return;
      finishBoot();

      if (!isAppOnline()) return;

      void fetchAuthMe().then((me) => {
        if (cancelled || !me) return;
        void ensureInitialCloudSync().catch(() => undefined);
      });
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [hiddenRoute]);

  return children;
}
