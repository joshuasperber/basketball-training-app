"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AI_CONSENT_UPDATED_EVENT,
  grantAiConsent,
  hasAiConsent,
  revokeAiConsent,
} from "@/lib/ai-consent";
import { useT } from "@/lib/i18n/I18nProvider";

type AiConsentSettingsProps = {
  onFeedback?: (message: string, tone: "success" | "error" | "info") => void;
};

export default function AiConsentSettings({ onFeedback }: AiConsentSettingsProps) {
  const t = useT();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const sync = useCallback(() => {
    setEnabled(hasAiConsent());
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener(AI_CONSENT_UPDATED_EVENT, sync);
    return () => window.removeEventListener(AI_CONSENT_UPDATED_EVENT, sync);
  }, [sync]);

  const handleToggle = async () => {
    setBusy(true);
    try {
      if (enabled) {
        await revokeAiConsent();
        onFeedback?.(t("ai.disabled"), "info");
      } else {
        await grantAiConsent();
        onFeedback?.(t("ai.enabled"), "success");
      }
      setEnabled(hasAiConsent());
    } catch {
      onFeedback?.(t("ai.saveFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 border-t border-[var(--surface-border)] pt-4">
      <p className="text-sm font-medium text-strong">{t("ai.consentTitle")}</p>
      <p className="mt-1 text-xs text-muted">
        {t("ai.consentHint")}{" "}
        <Link href="/datenschutz" className="underline">
          {t("ai.consentDetails")}
        </Link>
      </p>
      <label className="mt-3 flex items-start gap-2 text-sm text-strong">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={enabled}
          disabled={busy}
          onChange={() => void handleToggle()}
        />
        <span>{t("ai.consentLabel")}</span>
      </label>
    </div>
  );
}
