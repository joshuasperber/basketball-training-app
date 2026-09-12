"use client";

import { ErrorBoundary } from "@sentry/nextjs";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import { AppDialogProvider } from "@/components/ui/AppDialogProvider";
import { isProtectedAppPath } from "@/lib/app-routes";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

const AuthenticatedAppFeatures = dynamic(() => import("@/components/AuthenticatedAppFeatures"), {
  loading: () => (
    <main className="app-container flex min-h-screen items-center justify-center" role="status" aria-live="polite">
      <div className="app-card w-full max-w-sm text-center">
        <div className="app-busy-ball-ring mx-auto" aria-hidden><span className="app-busy-ball">🏀</span></div>
        <p className="app-busy-label mt-4">App wird vorbereitet …</p>
      </div>
    </main>
  ),
});

function AppFallback({ resetError }: { resetError: () => void }) {
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

export default function ClientShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const appFeaturesEnabled = isProtectedAppPath(pathname);

  return (
    <ErrorBoundary fallback={({ resetError }) => <AppFallback resetError={resetError} />}>
      <I18nProvider>
        <AppDialogProvider>
          {appFeaturesEnabled ? (
            <AuthenticatedAppFeatures>{children}</AuthenticatedAppFeatures>
          ) : (
            <>
              <CookieConsentBanner />
              {children}
            </>
          )}
        </AppDialogProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
