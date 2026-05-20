"use client";

import { useEffect, useMemo, useState } from "react";

type WorkoutTimerProps = {
  startedAtIso?: string;
  endedAtIso?: string;
  elapsedSeconds?: number;
  status: "not_started" | "in_progress" | "completed";
};

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function WorkoutTimer({ startedAtIso, endedAtIso, elapsedSeconds = 0, status }: WorkoutTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status !== "in_progress") return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [status]);

  const totalElapsed = useMemo(() => {
    const savedElapsed = Math.max(0, elapsedSeconds || 0);
    if (!startedAtIso) return savedElapsed;
    const startedAt = Date.parse(startedAtIso);
    if (!Number.isFinite(startedAt)) return savedElapsed;
    const parsedEnd = status === "in_progress" ? now : endedAtIso ? Date.parse(endedAtIso) : startedAt;
    const end = Number.isFinite(parsedEnd) ? parsedEnd : now;
    return savedElapsed + Math.max(0, Math.floor((end - startedAt) / 1000));
  }, [elapsedSeconds, endedAtIso, now, startedAtIso, status]);

  if (status === "not_started") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <p className="section-eyebrow">Stoppuhr</p>
        <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-strong">{formatDuration(elapsedSeconds)}</p>
        <p className="mt-1 text-xs text-faint">Starte das Workout oder den ersten Satz — die Stoppuhr beginnt sofort mit der Gesamtzeit.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="rounded-2xl border border-orange-400/40 bg-orange-500/10 px-4 py-3">
        <p className="section-eyebrow">Workout-Zeit</p>
        <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-strong">
          {formatDuration(totalElapsed)}
        </p>
        <p className="mt-1 text-xs text-faint">{status === "completed" ? "Fertig" : "Läuft"}</p>
      </div>
    </div>
  );
}
