import * as Sentry from "@sentry/nextjs";
import { hasAnalyticsConsent } from "@/lib/privacy-consent";
import { sentryBeforeSend } from "@/lib/sentry-scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/** Client Sentry only after analytics consent — see lib/sentry-client-init.ts */
Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn) && hasAnalyticsConsent(),
  tracesSampleRate: 0.08,
  sendDefaultPii: false,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  beforeSend: sentryBeforeSend,
});
