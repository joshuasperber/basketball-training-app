"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  denyAnalyticsConsent,
  grantAnalyticsConsent,
  hasAnalyticsConsent,
  hasConsentUiDecision,
} from "@/lib/privacy-consent";
import { useT } from "@/lib/i18n/I18nProvider";
import { initSentryIfConsented } from "@/lib/sentry-client-init";

export default function CookieConsentBanner() {
  const t = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (hasConsentUiDecision()) {
      if (hasAnalyticsConsent()) initSentryIfConsented();
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), 400);
    return () => window.clearTimeout(timer);
  }, []);

  const handleAccept = useCallback(() => {
    grantAnalyticsConsent();
    initSentryIfConsented();
    setVisible(false);
  }, []);

  const handleDecline = useCallback(() => {
    denyAnalyticsConsent();
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-height,4rem)+0.75rem)] z-50 px-4"
      role="dialog"
      aria-labelledby="cookie-consent-title"
    >
      <div className="mx-auto w-full max-w-lg app-card border border-[var(--surface-border)] p-4">
        <p id="cookie-consent-title" className="text-sm font-semibold text-strong">
          {t("cookie.title")}
        </p>
        <p className="mt-2 text-xs text-muted leading-relaxed">
          {t("cookie.body")}{" "}
          <Link href="/datenschutz" className="text-[var(--brand-400)] underline">
            {t("cookie.privacyLink")}
          </Link>
          .
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary btn-xs" onClick={handleAccept}>
            {t("cookie.accept")}
          </button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={handleDecline}>
            {t("cookie.decline")}
          </button>
        </div>
      </div>
    </div>
  );
}
