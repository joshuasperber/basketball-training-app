"use client";

import { useState } from "react";
import AppBusyOverlay from "@/components/AppBusyOverlay";
import Sheet from "@/components/ui/Sheet";
import PwaInstallSection from "@/components/PwaInstallSection";
import WorkoutReminderSettings from "@/components/WorkoutReminderSettings";
import { clearPlayerIntake } from "@/lib/coach-intake";
import { pushProgressToCloud, pushProgressToCloudWithRetry } from "@/lib/progress-sync";
import type { WeekConfig } from "@/lib/planner";

type ProfileSettingsSheetProps = {
  open: boolean;
  onClose: () => void;
  weekConfig: WeekConfig;
  onFeedback: (message: string, tone: "success" | "error") => void;
};

export default function ProfileSettingsSheet({ open, onClose, weekConfig, onFeedback }: ProfileSettingsSheetProps) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Daten werden gespeichert …");
  const [busySublabel, setBusySublabel] = useState("Dein Fortschritt wird in der Cloud gesichert.");

  return (
    <>
      <AppBusyOverlay open={loggingOut} label={busyLabel} sublabel={busySublabel} />
      <Sheet
        open={open}
        onClose={onClose}
        title="Einstellungen"
        description="Reminder, Coach und weitere App-Optionen."
      >
        <section className="app-card">
          <p className="section-eyebrow">Coach</p>
          <h2 className="section-title mt-1">Kennenlern-Chat</h2>
          <p className="mt-1 text-sm text-muted">
            Setzt Stärken, Schwächen und Rolle zurück — der Dialog erscheint beim nächsten App-Start erneut.
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-sm mt-3"
            onClick={() => {
              clearPlayerIntake();
              void pushProgressToCloud({ playerIntake: "" });
              onFeedback("Kennenlern-Chat zurückgesetzt.", "success");
            }}
          >
            Kennenlern-Chat erneut starten
          </button>
        </section>

        <div className="mt-4">
          <WorkoutReminderSettings weekConfig={weekConfig} />
        </div>

        <section className="app-card mt-4">
          <p className="section-eyebrow">App</p>
          <h2 className="section-title mt-1">Zum Home-Bildschirm</h2>
          <PwaInstallSection compact />
        </section>

        <section className="app-card mt-4">
          <p className="section-eyebrow">Session</p>
          <h2 className="section-title mt-1">Abmelden</h2>
          <p className="mt-1 text-sm text-muted">
            Speichert deine Daten in der Cloud und beendet die Anmeldung auf diesem Gerät.
          </p>
          <button
            type="button"
            className="btn btn-outline btn-sm mt-3"
            disabled={loggingOut}
            onClick={async () => {
              setLoggingOut(true);
              setBusyLabel("Daten werden gespeichert …");
              setBusySublabel("Dein Fortschritt wird in der Cloud gesichert.");
              try {
                await pushProgressToCloudWithRetry();
                setBusyLabel("Abmelden …");
                setBusySublabel("Session wird beendet.");
                await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                onClose();
                window.location.assign("/login");
              } catch {
                setLoggingOut(false);
                onFeedback("Abmelden fehlgeschlagen. Bitte erneut versuchen.", "error");
              }
            }}
          >
            {loggingOut ? "Abmelden …" : "Abmelden"}
          </button>
        </section>
      </Sheet>
    </>
  );
}
