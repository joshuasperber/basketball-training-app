import * as Sentry from "@sentry/nextjs";
import { sentryBeforeSend } from "@/lib/sentry-scrub";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const serverTelemetryEnabled = process.env.SENTRY_SERVER_ENABLED === "true";

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn) && serverTelemetryEnabled,
  tracesSampleRate: 0.05,
  sendDefaultPii: false,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  beforeSend: sentryBeforeSend,
});
