"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import InitialSetupWizard from "@/components/InitialSetupWizard";
import { INITIAL_SETUP_UPDATED_EVENT, isInitialSetupComplete } from "@/lib/onboarding-gate";
import { hasOfflineSessionHint } from "@/lib/offline-session";
import { ensureInitialCloudSync } from "@/lib/progress-sync";
import { fetchAuthMe } from "@/lib/auth-session-align";

const HIDDEN_PREFIXES = ["/login", "/auth/"];

export default function OnboardingGateLauncher() {
  const pathname = usePathname() ?? "";
  const hiddenRoute = HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));

  const [showWizard, setShowWizard] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (hiddenRoute) {
      setShowWizard(false);
      setLoggedIn(false);
      setAuthReady(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setAuthReady(false);

      const me = await fetchAuthMe();
      if (cancelled) return;

      if (!me) {
        if (!navigator.onLine && hasOfflineSessionHint()) {
          setLoggedIn(true);
          setShowWizard(!isInitialSetupComplete(null));
          setAuthReady(true);
          return;
        }
        setLoggedIn(false);
        setShowWizard(false);
        setAuthReady(true);
        return;
      }

      setLoggedIn(true);
      setAuthEmail(me.email?.trim().toLowerCase() ?? null);

      const remote = await ensureInitialCloudSync();
      if (cancelled) return;

      setShowWizard(!isInitialSetupComplete(remote?.playerIntake ?? null, remote?.profileCache ?? null));
      setAuthReady(true);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [hiddenRoute]);

  useEffect(() => {
    const refresh = () => {
      if (hiddenRoute || !loggedIn) return;
      setShowWizard(!isInitialSetupComplete(null));
    };
    window.addEventListener(INITIAL_SETUP_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(INITIAL_SETUP_UPDATED_EVENT, refresh);
  }, [hiddenRoute, loggedIn]);

  useEffect(() => {
    document.body.dataset.onboardingActive = showWizard && loggedIn ? "true" : "false";
    return () => {
      delete document.body.dataset.onboardingActive;
    };
  }, [showWizard, loggedIn]);

  if (hiddenRoute) return null;
  // Der lokale Seiteninhalt bleibt während der Hintergrundprüfung sichtbar.
  // Nur ein tatsächlich nötiges Onboarding öffnet anschließend den Wizard.
  if (!authReady) return null;
  if (!loggedIn || !showWizard) return null;

  return (
    <InitialSetupWizard
      authEmail={authEmail}
      onComplete={() => {
        setShowWizard(false);
      }}
    />
  );
}
