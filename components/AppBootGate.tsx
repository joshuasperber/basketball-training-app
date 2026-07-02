"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import AppBusyOverlay from "@/components/AppBusyOverlay";
import { fetchAuthMe } from "@/lib/auth-session-align";
import { ensureInitialCloudSync } from "@/lib/progress-sync";

const HIDDEN_PREFIXES = ["/login", "/auth/"];

const BOOT_TIMEOUT_MS = 9000;

function isHiddenBootRoute(pathname: string) {
  return HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** Blockiert kurz Interaktionen beim App-Start, bis Auth + erster Cloud-Pull durch sind. */
export default function AppBootGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const hiddenRoute = isHiddenBootRoute(pathname);
  const [booting, setBooting] = useState(!hiddenRoute);
  const [label, setLabel] = useState("App wird geladen …");
  const [sublabel, setSublabel] = useState("Einen Moment — wir bereiten alles vor.");

  useEffect(() => {
    if (hiddenRoute) {
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

      setLabel("App wird geladen …");
      setSublabel("Einen Moment — wir bereiten alles vor.");

      const bootWork = (async () => {
        const me = await fetchAuthMe();
        if (cancelled) return;
        if (me) {
          setLabel("Trainingsdaten werden geladen …");
          setSublabel("Dein Fortschritt wird synchronisiert.");
          await ensureInitialCloudSync().catch(() => {
            /* Offline oder Cloud optional */
          });
        }
        await waitForPaint();
      })();

      const timeout = new Promise<void>((resolve) => {
        window.setTimeout(resolve, BOOT_TIMEOUT_MS);
      });

      await Promise.race([bootWork, timeout]);
      if (cancelled) return;
      setBooting(false);
      delete document.body.dataset.appBooting;
    };

    void run();

    return () => {
      cancelled = true;
      delete document.body.dataset.appBooting;
    };
  }, [hiddenRoute, pathname]);

  return (
    <>
      <AppBusyOverlay open={booting} label={label} sublabel={sublabel} />
      <div aria-hidden={booting} className={booting ? "pointer-events-none select-none" : undefined}>
        {children}
      </div>
    </>
  );
}
