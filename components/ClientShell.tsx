"use client";

import { ErrorBoundary } from "@sentry/nextjs";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  ensureInitialCloudSync,
  markLocalProgressDirty,
  pushProgressToCloudWithRetry,
} from "@/lib/progress-sync";
import { syncWorkoutSessionsToCloud, syncWorkoutSessionsToCloudWithRetry } from "@/lib/sync-workout-sessions";

function CoachFallback({ resetError }: { resetError: () => void }) {
  return (
    <div className="app-container flex min-h-[50vh] items-center justify-center">
      <div className="app-card max-w-md w-full text-center">
        <p className="text-lg font-semibold text-strong">Etwas ist schiefgelaufen</p>
        <p className="mt-2 text-sm text-muted">Die App konnte diesen Bereich nicht laden. Bitte Seite neu laden.</p>
        <button type="button" className="btn btn-primary btn-sm mt-4" onClick={() => resetError()}>
          Erneut versuchen
        </button>
      </div>
    </div>
  );
}

import OfflineRouteWarmup from "@/components/OfflineRouteWarmup";
import OfflineSessionGuard from "@/components/OfflineSessionGuard";
import OnboardingGateLauncher from "@/components/OnboardingGateLauncher";
import AppBootGate from "@/components/AppBootGate";
import OfflineBanner from "@/components/OfflineBanner";
import SyncConflictBanner from "@/components/SyncConflictBanner";
import { AppDialogProvider } from "@/components/ui/AppDialogProvider";

const PLAN_SYNC_EVENTS = ["bt:plan-updated", "bt:training-goals-updated", "bt:player-intake-updated"] as const;

function CloudSyncBridge() {
  const planPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const pull = () => {
      if (document.visibilityState === "hidden") return;
      void ensureInitialCloudSync().catch(() => {
        /* Cloud optional */
      });
    };

    const queuePlanPush = (event: Event) => {
      const source = (event as CustomEvent<{ source?: string }>).detail?.source;
      if (source === "remote") return;
      markLocalProgressDirty();
      if (planPushTimerRef.current) clearTimeout(planPushTimerRef.current);
      planPushTimerRef.current = setTimeout(() => {
        void pushProgressToCloudWithRetry();
      }, 800);
    };

    const onSessionsUpdated = () => {
      void syncWorkoutSessionsToCloud();
    };

    const onOnline = () => {
      void syncWorkoutSessionsToCloudWithRetry().then(() =>
        pushProgressToCloudWithRetry().then(() => ensureInitialCloudSync()),
      );
    };

    pull();
    window.addEventListener("focus", pull);
    window.addEventListener("online", onOnline);
    window.addEventListener("bt:sessions-updated", onSessionsUpdated);
    document.addEventListener("visibilitychange", pull);
    for (const eventName of PLAN_SYNC_EVENTS) {
      window.addEventListener(eventName, queuePlanPush);
    }

    return () => {
      if (planPushTimerRef.current) clearTimeout(planPushTimerRef.current);
      window.removeEventListener("focus", pull);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("bt:sessions-updated", onSessionsUpdated);
      document.removeEventListener("visibilitychange", pull);
      for (const eventName of PLAN_SYNC_EVENTS) {
        window.removeEventListener(eventName, queuePlanPush);
      }
    };
  }, []);

  return null;
}

export default function ClientShell({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary fallback={({ resetError }) => <CoachFallback resetError={resetError} />}>
      <AppDialogProvider>
        <AppBootGate>
        <OfflineBanner />
        <CloudSyncBridge />
        <OfflineRouteWarmup />
        <OfflineSessionGuard />
        <SyncConflictBanner />
        <OnboardingGateLauncher />
        {children}
        </AppBootGate>
      </AppDialogProvider>
    </ErrorBoundary>
  );
}
