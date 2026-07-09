import * as Sentry from "@sentry/nextjs";
import { hasAnalyticsConsent } from "@/lib/privacy-consent";
import { sentryBeforeSend } from "@/lib/sentry-scrub";

let clientInitialized = false;

export function initSentryIfConsented() {
  if (clientInitialized || typeof window === "undefined") return;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || !hasAnalyticsConsent()) return;

  Sentry.init({
    dsn,
    enabled: true,
    tracesSampleRate: 0.08,
    sendDefaultPii: false,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    beforeSend: sentryBeforeSend,
  });
  clientInitialized = true;
}

export function captureExceptionIfConsented(error: unknown) {
  if (!hasAnalyticsConsent()) return;
  initSentryIfConsented();
  Sentry.captureException(error);
}
