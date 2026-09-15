"use client";

import { useEffect, useRef, type ReactNode } from "react";
import AppBootGate from "@/components/AppBootGate";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import OfflineBanner from "@/components/OfflineBanner";
import OfflineRouteWarmup from "@/components/OfflineRouteWarmup";
import OfflineSessionGuard from "@/components/OfflineSessionGuard";
import OnboardingGateLauncher from "@/components/OnboardingGateLauncher";
import ProgressCelebrationHost from "@/components/ProgressCelebrationHost";
import SyncConflictBanner from "@/components/SyncConflictBanner";
import WorkoutReminderSync from "@/components/WorkoutReminderSync";
import { isAppOnline } from "@/lib/app-online";
import { LEAGUE_UPDATED_EVENT } from "@/lib/league";
import {
  ensureInitialCloudSync,
  markLocalProgressDirty,
  pushProgressToCloudWithRetry,
  resetInitialCloudSyncCache,
} from "@/lib/progress-sync";
import { syncWorkoutSessionsToCloud, syncWorkoutSessionsToCloudWithRetry } from "@/lib/sync-workout-sessions";
import { READINESS_UPDATED_EVENT } from "@/lib/readiness";

const PLAN_SYNC_EVENTS = [
  "bt:plan-updated",
  "bt:training-goals-updated",
  "bt:player-intake-updated",
  LEAGUE_UPDATED_EVENT,
  READINESS_UPDATED_EVENT,
] as const;

function CloudSyncBridge() {
  const planPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const pull = () => {
      if (document.visibilityState === "hidden" || !isAppOnline()) return;
      void ensureInitialCloudSync().catch(() => undefined);
    };
    const queuePlanPush = (event: Event) => {
      const source = (event as CustomEvent<{ source?: string }>).detail?.source;
      if (source === "remote") return;
      markLocalProgressDirty();
      if (!isAppOnline()) return;
      if (planPushTimerRef.current) clearTimeout(planPushTimerRef.current);
      planPushTimerRef.current = setTimeout(() => void pushProgressToCloudWithRetry(), 800);
    };
    const onSessionsUpdated = () => {
      if (!isAppOnline()) return markLocalProgressDirty();
      void syncWorkoutSessionsToCloud();
    };
    const onOnline = () => {
      resetInitialCloudSyncCache();
      void syncWorkoutSessionsToCloudWithRetry().then(() =>
        pushProgressToCloudWithRetry().then(() => ensureInitialCloudSync()),
      );
    };

    if (isAppOnline()) pull();
    window.addEventListener("focus", pull);
    window.addEventListener("online", onOnline);
    window.addEventListener("bt:sessions-updated", onSessionsUpdated);
    document.addEventListener("visibilitychange", pull);
    for (const eventName of PLAN_SYNC_EVENTS) window.addEventListener(eventName, queuePlanPush);

    return () => {
      if (planPushTimerRef.current) clearTimeout(planPushTimerRef.current);
      window.removeEventListener("focus", pull);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("bt:sessions-updated", onSessionsUpdated);
      document.removeEventListener("visibilitychange", pull);
      for (const eventName of PLAN_SYNC_EVENTS) window.removeEventListener(eventName, queuePlanPush);
    };
  }, []);

  return null;
}

export default function AuthenticatedAppFeatures({ children }: { children: ReactNode }) {
  return (
    <AppBootGate>
      <OfflineBanner />
      <CloudSyncBridge />
      <OfflineRouteWarmup />
      <OfflineSessionGuard />
      <SyncConflictBanner />
      <OnboardingGateLauncher />
      <CookieConsentBanner />
      <ProgressCelebrationHost />
      <WorkoutReminderSync />
      {children}
    </AppBootGate>
  );
}
