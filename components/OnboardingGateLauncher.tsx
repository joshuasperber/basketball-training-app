"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import InitialSetupWizard from "@/components/InitialSetupWizard";
import {
  INITIAL_SETUP_UPDATED_EVENT,
  isInitialSetupComplete,
  mergePersistedProfileIntoCache,
  persistHydratedProfileCache,
  type PersistedProfileShape,
  type ProfileCacheShape,
} from "@/lib/onboarding-gate";
import { hasOfflineSessionHint } from "@/lib/offline-session";
import { ensureInitialCloudSync, pushProgressToCloudWithRetry } from "@/lib/progress-sync";
import { fetchAuthMeState } from "@/lib/auth-session-align";

const HIDDEN_PREFIXES = ["/login", "/auth/"];

export default function OnboardingGateLauncher() {
  const pathname = usePathname() ?? "";
  const hiddenRoute = HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));

  const [showWizard, setShowWizard] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [checkRevision, setCheckRevision] = useState(0);

  useEffect(() => {
    if (hiddenRoute) return;
    const retry = () => setCheckRevision((current) => current + 1);
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    window.addEventListener("bt:cloud-progress-applied", retry);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
      window.removeEventListener("bt:cloud-progress-applied", retry);
    };
  }, [hiddenRoute]);

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

      const authState = await fetchAuthMeState();
      if (cancelled) return;

      if (authState.status !== "authenticated") {
        if (authState.status === "unavailable" && (authState.user || hasOfflineSessionHint())) {
          setLoggedIn(true);
          setAuthEmail(authState.user?.email?.trim().toLowerCase() ?? null);
          // A temporary outage cannot prove that onboarding is incomplete.
          // Keep the app usable and retry when auth/cloud are reachable again.
          setShowWizard(false);
          setAuthReady(true);
          return;
        }
        setLoggedIn(false);
        setShowWizard(false);
        setAuthReady(true);
        return;
      }

      const me = authState.user;
      setLoggedIn(true);
      setAuthEmail(me.email?.trim().toLowerCase() ?? null);

      const remote = await ensureInitialCloudSync();
      if (cancelled) return;

      // null bedeutet hier: Cloud/Auth vorübergehend nicht erreichbar. Daraus
      // darf niemals abgeleitet werden, dass ein vorhandenes Profil fehlt.
      if (remote === null) {
        setShowWizard(false);
        setAuthReady(true);
        return;
      }

      if (isInitialSetupComplete(remote?.playerIntake ?? null, remote?.profileCache ?? null)) {
        setShowWizard(false);
        setAuthReady(true);
        return;
      }

      // Compatibility for accounts created before profile_cache was synced:
      // the canonical profile row is still present and must win over an empty
      // browser cache on a second device.
      let profileResponse = await fetch("/api/profile", {
        credentials: "include",
        cache: "no-store",
      });
      if (profileResponse.status === 401) {
        const refreshed = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
        });
        if (refreshed.ok) {
          profileResponse = await fetch("/api/profile", {
            credentials: "include",
            cache: "no-store",
          });
        }
      }
      if (cancelled) return;

      // A failed profile request is not proof that no profile exists. Keep the
      // app usable and retry on focus/online instead of reopening onboarding.
      if (!profileResponse.ok) {
        setShowWizard(false);
        setAuthReady(true);
        return;
      }

      const profilePayload = (await profileResponse.json().catch(() => null)) as {
        profile?: PersistedProfileShape | null;
      } | null;
      if (cancelled) return;

      if (profilePayload?.profile) {
        let existingCache: ProfileCacheShape | null = null;
        try {
          const raw = window.localStorage.getItem("profile_cache_v4");
          existingCache = raw ? (JSON.parse(raw) as ProfileCacheShape) : null;
        } catch {
          existingCache = null;
        }
        const hydrated = mergePersistedProfileIntoCache(profilePayload.profile, {
          existingCache,
          persistedWeekConfig: remote.profileWeekConfig,
          email: me.email?.trim().toLowerCase() ?? null,
        });
        persistHydratedProfileCache(hydrated);

        const setupComplete = isInitialSetupComplete(
          remote.playerIntake ?? null,
          remote.profileCache ?? null,
        );
        if (!setupComplete) {
          // Persist the recovered legacy profile now, so the next device can
          // use the normal user_progress path even before onboarding finishes.
          await pushProgressToCloudWithRetry({
            profileCache: JSON.stringify(hydrated),
            profileUsername: hydrated.profile?.username ?? null,
            profileWeekConfig: hydrated.weekConfig ? JSON.stringify(hydrated.weekConfig) : null,
          });
        }
        if (cancelled) return;
        setShowWizard(!setupComplete);
      } else {
        setShowWizard(true);
      }
      setAuthReady(true);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [checkRevision, hiddenRoute]);

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
