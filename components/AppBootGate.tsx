"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import AppBusyOverlay from "@/components/AppBusyOverlay";
import { isAppOnline } from "@/lib/app-online";
import { fetchAuthMe } from "@/lib/auth-session-align";
import { hasOfflineSessionHint } from "@/lib/offline-session";
import { ensureInitialCloudSync } from "@/lib/progress-sync";

const HIDDEN_PREFIXES = ["/login", "/auth/"];

const BOOT_TIMEOUT_MS = 6000;

let bootCompletedThisSession = false;

function isHiddenBootRoute(pathname: string) {
  return HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function finishBoot(setBooting: (value: boolean) => void) {
  bootCompletedThisSession = true;
  setBooting(false);
  delete document.body.dataset.appBooting;
  window.dispatchEvent(new Event("bt:app-boot-complete"));
}

/** Einmal pro Session — offline sofort, online mit optionalem Cloud-Sync. */
export default function AppBootGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const hiddenRoute = isHiddenBootRoute(pathname);
  const [booting, setBooting] = useState(() => !hiddenRoute && !bootCompletedThisSession);
  const [label, setLabel] = useState("App wird geladen …");
  const [sublabel, setSublabel] = useState("Einen Moment — wir bereiten alles vor.");

  useEffect(() => {
    if (hiddenRoute) {
      setBooting(false);
      delete document.body.dataset.appBooting;
      return;
    }

    if (bootCompletedThisSession) {
      setBooting(false);
      delete document.body.dataset.appBooting;
      return;
    }

    let cancelled = false;
    setBooting(true);
    document.body.dataset.appBooting = "true";

    const run = async () => {
      await waitForPaint();
      if (cancelled) return;

      if (!isAppOnline()) {
        setLabel(hasOfflineSessionHint() ? "Offline-Modus" : "Keine Verbindung");
        setSublabel(
          hasOfflineSessionHint()
            ? "Dein letzter Stand wird aus dem lokalen Speicher geladen."
            : "Bitte später erneut verbinden, um dich anzumelden.",
        );
        await waitForPaint();
        if (!cancelled) finishBoot(setBooting);
        return;
      }

      setLabel("App wird geladen …");
      setSublabel("Lokal zuerst — Cloud-Updates im Hintergrund.");

      const bootWork = (async () => {
        const me = await fetchAuthMe();
        if (cancelled) return;
        if (me) {
          setLabel("Trainingsdaten werden vorbereitet …");
          await ensureInitialCloudSync().catch(() => undefined);
        }
        await waitForPaint();
      })();

      const timeout = new Promise<void>((resolve) => {
        window.setTimeout(resolve, BOOT_TIMEOUT_MS);
      });

      await Promise.race([bootWork, timeout]);
      if (cancelled) return;
      finishBoot(setBooting);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [hiddenRoute]);

  return (
    <>
      <AppBusyOverlay open={booting} label={label} sublabel={sublabel} />
      <div aria-hidden={booting} className={booting ? "pointer-events-none select-none" : undefined}>
        {children}
      </div>
    </>
  );
}
