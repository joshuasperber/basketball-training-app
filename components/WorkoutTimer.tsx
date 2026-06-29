"use client";

import { useEffect, useMemo, useState } from "react";

type WorkoutTimerProps = {
  startedAtIso?: string;
  lastSetCompletedAtIso?: string;
  status: "not_started" | "in_progress" | "completed";
};

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function WorkoutTimer({ startedAtIso, lastSetCompletedAtIso, status }: WorkoutTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status !== "in_progress") return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [status]);

  const totalElapsed = useMemo(() => {
    if (!startedAtIso) return 0;
    const startedAt = Date.parse(startedAtIso);
    if (!Number.isFinite(startedAt)) return 0;
    return Math.floor((now - startedAt) / 1000);
  }, [now, startedAtIso]);

  const restElapsed = useMemo(() => {
    if (!lastSetCompletedAtIso || status !== "in_progress") return 0;
    const lastSet = Date.parse(lastSetCompletedAtIso);
    if (!Number.isFinite(lastSet)) return 0;
    return Math.max(0, Math.floor((now - lastSet) / 1000));
  }, [lastSetCompletedAtIso, now, status]);

  if (status === "not_started") {
    return (
      <div className="app-card--flat px-4 py-3">
        <p className="section-eyebrow">Stoppuhr</p>
        <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-strong">00:00</p>
        <p className="mt-1 text-xs text-faint">Starte das Workout oder den ersten Satz.</p>
      </div>
    );
  }

  const restTone =
    restElapsed >= 180 ? "text-amber-600"
    : restElapsed >= 90 ? "text-emerald-600"
    : "text-strong";

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="app-card--accent-violet px-4 py-3">
        <p className="section-eyebrow">Workout-Zeit</p>
        <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-strong">
          {formatDuration(totalElapsed)}
        </p>
        <p className="mt-1 text-xs text-faint">{status === "completed" ? "Fertig" : "Läuft"}</p>
      </div>
      <div className="app-card--flat px-4 py-3">
        <p className="section-eyebrow">Pause seit letztem Satz</p>
        <p className={`mt-1 text-2xl font-bold tabular-nums tracking-tight ${restTone}`}>
          {lastSetCompletedAtIso ? formatDuration(restElapsed) : "—"}
        </p>
        <p className="mt-1 text-xs text-faint">
          {!lastSetCompletedAtIso
            ? "Erster Satz noch nicht abgeschlossen"
            : restElapsed < 60
              ? "Atem holen…"
              : restElapsed < 120
                ? "Bereit für nächsten Satz"
                : restElapsed < 180
                  ? "Pause läuft – fokussiert bleiben"
                  : "Lange Pause – wieder einsteigen"}
        </p>
      </div>
    </div>
  );
}
