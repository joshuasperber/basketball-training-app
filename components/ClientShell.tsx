"use client";

import { ErrorBoundary } from "@sentry/nextjs";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { ensureInitialCloudSync } from "@/lib/progress-sync";
import { syncWorkoutSessionsToCloud } from "@/lib/sync-workout-sessions";

function CoachFallback({ resetError }: { resetError: () => void }) {
  return (
    <div className="mx-auto max-w-md p-6 text-center">
      <p className="text-lg font-semibold text-white">Etwas ist schiefgelaufen</p>
      <p className="mt-2 text-sm text-zinc-400">Die App konnte diesen Bereich nicht laden. Bitte Seite neu laden.</p>
      <button
        type="button"
        className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
        onClick={() => resetError()}
      >
        Erneut versuchen
      </button>
    </div>
  );
}

import CoachIntakeLauncher from "@/components/CoachIntakeLauncher";

// #region agent log
function agentDebugLog(hypothesisId: string, message: string, data: Record<string, unknown>) {
  fetch("http://127.0.0.1:7908/ingest/88ac75e7-3e4c-4c76-9620-de72da587f9b", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e86b79" },
    body: JSON.stringify({ sessionId: "e86b79", runId: "app-audit-1", hypothesisId, location: "components/ClientShell.tsx", message, data, timestamp: Date.now() }),
  }).catch(() => {});
}
// #endregion

function CloudSyncBridge() {
  useEffect(() => {
    const sync = () => {
      void ensureInitialCloudSync()
        .then((remote) => {
          // #region agent log
          agentDebugLog("H1,H2", "cloud sync bridge result", {
            remoteExists: remote && typeof remote === "object" && "remoteExists" in remote ? remote.remoteExists : undefined,
            hasRemote: Boolean(remote),
            href: window.location.pathname,
          });
          // #endregion
        })
        .catch((error) => {
          // #region agent log
          agentDebugLog("H1", "cloud sync bridge failure", {
            errorName: error instanceof Error ? error.name : typeof error,
            errorMessage: error instanceof Error ? error.message : String(error),
            href: window.location.pathname,
          });
          // #endregion
        });
    };
    const onError = (event: ErrorEvent) => {
      // #region agent log
      agentDebugLog("H1", "global runtime error", { message: event.message, filename: event.filename, href: window.location.pathname });
      // #endregion
    };
    const onUnhandled = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      // #region agent log
      agentDebugLog("H1", "global unhandled rejection", {
        reasonName: reason instanceof Error ? reason.name : typeof reason,
        reasonMessage: reason instanceof Error ? reason.message : String(reason),
        href: window.location.pathname,
      });
      // #endregion
    };
    const onSessionsUpdated = () => {
      void syncWorkoutSessionsToCloud();
    };
    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("bt:sessions-updated", onSessionsUpdated);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("bt:sessions-updated", onSessionsUpdated);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return null;
}

export default function ClientShell({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary fallback={({ resetError }) => <CoachFallback resetError={resetError} />}>
      <CloudSyncBridge />
      <CoachIntakeLauncher />
      {children}
    </ErrorBoundary>
  );
}
