"use client";

import { PWA_INSTALL_DISMISS_KEY, usePwaInstall } from "@/lib/pwa-install";

type PwaInstallSectionProps = {
  compact?: boolean;
};

/** Installations-Hinweis für Einstellungen — Android/Chrome Prompt oder iOS-Anleitung. */
export default function PwaInstallSection({ compact = false }: PwaInstallSectionProps) {
  const { installed, canPromptInstall, iosHint, promptInstall } = usePwaInstall();

  if (installed) {
    return (
      <p className="mt-2 text-sm text-muted">
        Die App läuft als Home-Bildschirm-App. Trainingsdaten bleiben lokal verfügbar und werden bei
        Internetverbindung synchronisiert.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-3">
      {iosHint ? (
        <p className="text-sm text-muted">
          In Safari: <strong className="text-strong">Teilen</strong> →{" "}
          <strong className="text-strong">Zum Home-Bildschirm</strong>. Danach startest du die App wie
          eine native App — auch offline mit deinen gespeicherten Workouts.
        </p>
      ) : (
        <p className="text-sm text-muted">
          Füge die App zum Home-Bildschirm hinzu für schnelleren Start, Vollbild-Modus und besseren
          Offline-Zugriff auf Trainingsplan und Workouts.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {canPromptInstall ? (
          <button
            type="button"
            className={`btn btn-primary ${compact ? "btn-xs" : "btn-sm"}`}
            onClick={() => {
              void promptInstall().then((accepted) => {
                if (accepted) {
                  window.localStorage.setItem(PWA_INSTALL_DISMISS_KEY, String(Date.now()));
                }
              });
            }}
          >
            Zum Home-Bildschirm hinzufügen
          </button>
        ) : null}
        {!canPromptInstall && !iosHint ? (
          <p className="text-xs text-faint">
            Im Browser-Menü „App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen (Chrome /
            Edge / Samsung Internet).
          </p>
        ) : null}
      </div>
    </div>
  );
}
