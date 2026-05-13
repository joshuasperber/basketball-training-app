"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getWorkoutSessions } from "@/lib/session-storage";
import { loadGameStats } from "@/lib/game-stats";
import { loadExercises } from "@/lib/training-storage";
import { loadTrainingGoalsBundle } from "@/lib/training-goals";
import { getProgressionState } from "@/lib/level-system";

type CoachResponse = {
  headline: string;
  bullets: string[];
  source?: "heuristic" | "llm";
  warning?: string;
  error?: string;
};

function buildPayload() {
  const sessions = getWorkoutSessions().slice(0, 14);
  const games = loadGameStats().slice(0, 8);
  const exerciseLookup = new Map(loadExercises().map((exercise) => [exercise.id, exercise]));
  const goals = loadTrainingGoalsBundle();
  const profile = (() => {
    try {
      const raw = window.localStorage.getItem("profile_cache_v4");
      return raw
        ? (JSON.parse(raw) as {
            profile?: { favorite_position?: string | null };
            playStyle?: string;
          })
        : null;
    } catch {
      return null;
    }
  })();

  const recentSessions = sessions.map((session) => {
    const exercise = session.logs.map((log) => exerciseLookup.get(log.exerciseId)).find(Boolean);
    const totalMakes = session.logs.reduce((sum, log) => sum + (log.made ?? 0), 0);
    const totalAttempts = session.logs.reduce((sum, log) => sum + (log.attempts ?? 0), 0);
    const totalReps = session.logs.reduce((sum, log) => sum + (log.completedValue ?? 0), 0);
    const maxWeight = session.logs.reduce((max, log) => Math.max(max, log.weightKg ?? 0), 0);
    return {
      date: session.dateISO.slice(0, 10),
      category: (exercise?.category as string) ?? session.workoutCategory ?? "Basketball",
      subcategory: exercise?.subcategory ?? session.workoutSubcategory ?? "",
      setCount: session.logs.length,
      rpe: null,
      makes: totalMakes,
      attempts: totalAttempts,
      weightKg: maxWeight,
      reps: totalReps,
    };
  });

  return {
    position: profile?.profile?.favorite_position ?? "sg",
    playStyle: profile?.playStyle ?? "",
    level: getProgressionState().level,
    mesocyclePhase: goals.mesocyclePhase,
    recentSessions,
    recentGames: games.map((g) => ({
      date: g.date,
      context: g.context,
      points: g.points,
      assists: g.assists,
      rebounds: g.rebounds,
      steals: g.steals,
    })),
  };
}

export default function CoachInsight() {
  const [data, setData] = useState<CoachResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCoach = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = buildPayload();
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await response.json()) as CoachResponse;
      if (!response.ok && !json?.headline) {
        throw new Error(json?.error ?? `HTTP ${response.status}`);
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coach nicht erreichbar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCoach();
  }, [fetchCoach]);

  const badge = useMemo(() => {
    if (!data?.source) return null;
    if (data.source === "llm") return { label: "KI-Coach", className: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" };
    return { label: "Regel-Coach", className: "border-cyan-400/40 bg-cyan-500/10 text-cyan-200" };
  }, [data]);

  return (
    <section className="app-card--brand">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="section-eyebrow">Coach</p>
          <h3 className="section-title mt-1">{data?.headline ?? "Empfehlungen für deine Woche"}</h3>
        </div>
        <div className="flex items-center gap-2">
          {badge ? (
            <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${badge.className}`}>
              {badge.label}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void fetchCoach()}
            disabled={loading}
            className="btn btn-ghost btn-xs"
          >
            {loading ? "lädt…" : "Aktualisieren"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-rose-200">{error}</p>
      ) : data ? (
        <ul className="mt-3 space-y-2 text-sm text-strong">
          {data.bullets.map((bullet, index) => (
            <li key={`bullet-${index}`} className="flex gap-2">
              <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">{loading ? "Coach analysiert…" : "Noch keine Daten."}</p>
      )}

      {data?.warning ? (
        <p className="mt-2 text-[11px] text-amber-200">Hinweis: {data.warning}</p>
      ) : null}
    </section>
  );
}
