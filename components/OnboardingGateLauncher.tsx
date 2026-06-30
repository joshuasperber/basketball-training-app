"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import InitialSetupWizard from "@/components/InitialSetupWizard";
import { INITIAL_SETUP_UPDATED_EVENT, isInitialSetupComplete } from "@/lib/onboarding-gate";
import { ensureInitialCloudSync } from "@/lib/progress-sync";

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

      const meRes = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
      if (cancelled) return;

      if (!meRes.ok) {
        setLoggedIn(false);
        setShowWizard(false);
        setAuthReady(true);
        return;
      }

      const me = (await meRes.json()) as { email?: string };
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
  }, [pathname, hiddenRoute]);

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

  if (hiddenRoute || !loggedIn || !authReady || !showWizard) return null;

  return (
    <InitialSetupWizard
      authEmail={authEmail}
      onComplete={() => {
        setShowWizard(false);
      }}
    />
  );
}
