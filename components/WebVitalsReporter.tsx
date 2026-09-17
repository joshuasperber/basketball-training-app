"use client";

import * as Sentry from "@sentry/nextjs";
import { useReportWebVitals } from "next/web-vitals";
import { hasAnalyticsConsent } from "@/lib/privacy-consent";
import { initSentryIfConsented } from "@/lib/sentry-client-init";

/** Echte Nutzerwerte statt nur Lighthouse-Labordaten; strikt consent-gated. */
export default function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (!hasAnalyticsConsent()) return;
    initSentryIfConsented();
    Sentry.metrics.distribution("web_vital", metric.value, {
      attributes: {
        metric: metric.name,
        rating: metric.rating,
        path: window.location.pathname,
        navigationType: metric.navigationType,
      },
    });
  });

  return null;
}
