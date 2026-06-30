"use client";

import Sheet from "@/components/ui/Sheet";
import WorkoutReminderSettings from "@/components/WorkoutReminderSettings";
import { clearPlayerIntake } from "@/lib/coach-intake";
import { pushProgressToCloud } from "@/lib/progress-sync";
import type { WeekConfig } from "@/lib/planner";
import { useRouter } from "next/navigation";

type ProfileSettingsSheetProps = {
  open: boolean;
  onClose: () => void;
  weekConfig: WeekConfig;
  onFeedback: (message: string, tone: "success" | "error") => void;
};

export default function ProfileSettingsSheet({ open, onClose, weekConfig, onFeedback }: ProfileSettingsSheetProps) {
  const router = useRouter();

  return (
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
        <p className="section-eyebrow">Session</p>
        <h2 className="section-title mt-1">Abmelden</h2>
        <p className="mt-1 text-sm text-muted">
          Beendet die Anmeldung auf diesem Gerät. Lokale Browser-Daten bleiben erhalten.
        </p>
        <button
          type="button"
          className="btn btn-outline btn-sm mt-3"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
            onClose();
            router.replace("/login");
          }}
        >
          Abmelden
        </button>
      </section>
    </Sheet>
  );
}
