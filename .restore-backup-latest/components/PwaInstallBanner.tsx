"use client";

import { useCallback, useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt: () => Promise<void>;
};

const DISMISS_KEY = "bt.pwa-install.dismissed-at";
const DISMISS_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 14;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneMatch = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return standaloneMatch || iosStandalone;
}

function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIos && isSafari;
}

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) ?? "0");
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) return;

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    if (isIosSafari()) {
      const timer = window.setTimeout(() => {
        setShowIosHint(true);
        setVisible(true);
      }, 4000);
      return () => {
        window.removeEventListener("beforeinstallprompt", handler);
        window.clearTimeout(timer);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted" || choice.outcome === "dismissed") {
      setDeferredPrompt(null);
      setVisible(false);
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-24 left-1/2 z-40 w-[92%] max-w-sm -translate-x-1/2 app-card shadow-[var(--shadow-card)] p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/20 text-lg">
          🏀
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-strong">Zur Startseite hinzufügen</p>
          {showIosHint ? (
            <p className="mt-1 text-xs text-muted">
              In Safari: Teilen-Symbol antippen → „Zum Home‑Bildschirm“.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted">
              Installiere die App für schnelleren Zugriff & Offline-Modus.
            </p>
          )}
          <div className="mt-2 flex gap-2">
            {deferredPrompt ? (
              <button type="button" onClick={() => void handleInstall()} className="btn btn-primary btn-xs">
                Installieren
              </button>
            ) : null}
            <button type="button" onClick={handleDismiss} className="btn btn-ghost btn-xs">
              Später
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
