"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  denyAnalyticsConsent,
  grantAnalyticsConsent,
  hasAnalyticsConsent,
} from "@/lib/privacy-consent";
import { useT } from "@/lib/i18n/I18nProvider";
import { initSentryIfConsented } from "@/lib/sentry-client-init";

type AnalyticsConsentSettingsProps = {
  onFeedback?: (message: string, tone: "success" | "error" | "info") => void;
};

export default function AnalyticsConsentSettings({ onFeedback }: AnalyticsConsentSettingsProps) {
  const t = useT();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(hasAnalyticsConsent());
    const sync = () => setEnabled(hasAnalyticsConsent());
    window.addEventListener("bt:analytics-consent-updated", sync);
    return () => window.removeEventListener("bt:analytics-consent-updated", sync);
  }, []);

  const handleToggle = useCallback(() => {
    if (enabled) {
      denyAnalyticsConsent();
      onFeedback?.(t("analytics.disabled"), "info");
    } else {
      grantAnalyticsConsent();
      initSentryIfConsented();
      onFeedback?.(t("analytics.enabled"), "success");
    }
    setEnabled(hasAnalyticsConsent());
  }, [enabled, onFeedback, t]);

  return (
    <div className="mt-4 border-t border-[var(--surface-border)] pt-4">
      <p className="text-sm font-medium text-strong">{t("analytics.consentTitle")}</p>
      <p className="mt-1 text-xs text-muted">
        {t("analytics.consentHint")}{" "}
        <Link href="/datenschutz" className="underline text-[var(--brand-400)]">
          {t("common.details")}
        </Link>
      </p>
      <label className="mt-3 flex items-start gap-2 text-sm text-strong">
        <input type="checkbox" className="mt-0.5" checked={enabled} onChange={handleToggle} />
        <span>{t("analytics.consentLabel")}</span>
      </label>
    </div>
  );
}
