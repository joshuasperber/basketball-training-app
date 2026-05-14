"use client";

import { ErrorBoundary } from "@sentry/nextjs";
import type { ReactNode } from "react";

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

export default function ClientShell({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary fallback={({ resetError }) => <CoachFallback resetError={resetError} />}>
      <CoachIntakeLauncher />
      {children}
    </ErrorBoundary>
  );
}
