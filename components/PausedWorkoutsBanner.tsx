"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { finishPausedWorkoutEntry } from "@/lib/finish-workout-session";
import { useAppDialog } from "@/components/ui/AppDialogProvider";
import {
  formatPausedWorkoutDuration,
  loadPausedWorkouts,
  refreshPausedWorkoutsRegistry,
  type PausedWorkoutEntry,
} from "@/lib/paused-workouts";

type PausedWorkoutsBannerProps = {
  className?: string;
};

export default function PausedWorkoutsBanner({ className = "" }: PausedWorkoutsBannerProps) {
  const [entries, setEntries] = useState<PausedWorkoutEntry[]>([]);
  const [endingId, setEndingId] = useState<string | null>(null);
  const appDialog = useAppDialog();

  useEffect(() => {
    const syncEntries = () => {
      setEntries(loadPausedWorkouts().slice().reverse());
    };
    const reconcile = () => {
      refreshPausedWorkoutsRegistry();
      syncEntries();
    };
    reconcile();
    window.addEventListener("bt:paused-workouts-updated", syncEntries);
    window.addEventListener("bt:workout-progress-updated", reconcile);
    window.addEventListener("bt:sessions-updated", reconcile);
    window.addEventListener("focus", reconcile);
    window.addEventListener("storage", reconcile);
    return () => {
      window.removeEventListener("bt:paused-workouts-updated", syncEntries);
      window.removeEventListener("bt:workout-progress-updated", reconcile);
      window.removeEventListener("bt:sessions-updated", reconcile);
      window.removeEventListener("focus", reconcile);
      window.removeEventListener("storage", reconcile);
    };
  }, []);

  const handleEndWorkout = async (entry: PausedWorkoutEntry) => {
    const hasSets = Object.values(entry.progress.logs).some(
      (log) =>
        Boolean(
          log?.reps?.trim() ||
            log?.weight?.trim() ||
            log?.makes?.trim() ||
            log?.misses?.trim() ||
            log?.completed ||
            log?.completedAtIso,
        ),
    );
    const confirmed = await appDialog.confirm({
      message: hasSets
        ? `„${entry.progress.title}“ beenden? Erfasster Fortschritt wird in Stats gespeichert.`
        : `„${entry.progress.title}“ beenden? Es wurden noch keine Sätze erfasst.`,
      confirmLabel: "Beenden",
      tone: "danger",
    });
    if (!confirmed) return;

    setEndingId(entry.id);
    const result = finishPausedWorkoutEntry(entry);
    setEndingId(null);
    if (!result.ok) {
      void appDialog.alert({ message: result.error ?? "Workout konnte nicht beendet werden." });
      return;
    }
    if (result.levelDelta && result.levelDelta > 0) {
      void appDialog.alert({ message: `🎉 Level-Up! +${result.levelDelta} Level` });
    } else if (result.bannerMessage) {
      void appDialog.alert({ message: result.bannerMessage });
    }
    refreshPausedWorkoutsRegistry();
    setEntries(loadPausedWorkouts().slice().reverse());
  };

  if (entries.length === 0) return null;

  return (
    <section className={`app-card--accent-emerald ${className}`.trim()}>
      <p className="section-eyebrow">Pausierte Workouts</p>
      <p className="mt-1 text-sm text-muted">
        Fortsetzen oder beenden — erfasster Fortschritt landet in Stats (max. 2 gleichzeitig).
      </p>
      <ul className="mt-3 space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="list-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-strong">{entry.progress.title}</p>
                <p className="mt-0.5 text-xs text-faint">
                  {entry.progress.sport} · {entry.progress.subcategory}
                  {(entry.progress.elapsedSeconds ?? 0) > 0
                    ? ` · ${formatPausedWorkoutDuration(entry.progress.elapsedSeconds ?? 0)}`
                    : null}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link href={entry.resumeHref} className="btn btn-primary btn-xs">
                  Fortsetzen
                </Link>
                <button
                  type="button"
                  onClick={() => void handleEndWorkout(entry)}
                  disabled={endingId === entry.id}
                  className="btn btn-outline btn-xs disabled:opacity-50"
                >
                  {endingId === entry.id ? "Beendet…" : "Beenden"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
