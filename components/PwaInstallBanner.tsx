"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n/I18nProvider";
import {
  PWA_INSTALL_DISMISS_COOLDOWN_MS,
  PWA_INSTALL_DISMISS_KEY,
  isStandaloneDisplay,
  usePwaInstall,
} from "@/lib/pwa-install";

export default function PwaInstallBanner() {
  const t = useT();
  const { installed, canPromptInstall, iosHint, promptInstall } = usePwaInstall();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (installed || isStandaloneDisplay()) return;

    const dismissedAt = Number(window.localStorage.getItem(PWA_INSTALL_DISMISS_KEY) ?? "0");
    if (dismissedAt && Date.now() - dismissedAt < PWA_INSTALL_DISMISS_COOLDOWN_MS) return;

    if (canPromptInstall) {
      setVisible(true);
      return;
    }

    if (iosHint) {
      const timer = window.setTimeout(() => setVisible(true), 4000);
      return () => window.clearTimeout(timer);
    }
  }, [canPromptInstall, installed, iosHint]);

  const handleInstall = useCallback(async () => {
    const accepted = await promptInstall();
    setVisible(false);
    window.localStorage.setItem(PWA_INSTALL_DISMISS_KEY, String(Date.now()));
    return accepted;
  }, [promptInstall]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    window.localStorage.setItem(PWA_INSTALL_DISMISS_KEY, String(Date.now()));
  }, []);

  if (!visible || installed) return null;

  return (
    <div className="fixed bottom-24 left-1/2 z-40 w-[92%] max-w-sm -translate-x-1/2 app-card shadow-[var(--shadow-card)] p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/20 text-lg">
          🏀
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-strong">{t("pwa.title")}</p>
          {iosHint ? (
            <p className="mt-1 text-xs text-muted">{t("pwa.hintIos")}</p>
          ) : (
            <p className="mt-1 text-xs text-muted">{t("pwa.hintAndroid")}</p>
          )}
          <div className="mt-2 flex gap-2">
            {canPromptInstall ? (
              <button type="button" onClick={() => void handleInstall()} className="btn btn-primary btn-xs">
                {t("pwa.install")}
              </button>
            ) : null}
            <button type="button" onClick={handleDismiss} className="btn btn-ghost btn-xs">
              {t("common.later")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
