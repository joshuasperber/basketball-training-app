"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getWorkoutSessions } from "@/lib/session-storage";
import { loadGameStats } from "@/lib/game-stats";
import { loadExercises, loadWorkouts } from "@/lib/training-storage";
import { loadTrainingGoalsBundle } from "@/lib/training-goals";
import { getProgressionState } from "@/lib/level-system";
import { applyWeekConfigToCalendar } from "@/lib/activity-calendar";
import {
  buildRecentTrainingLog14d,
  buildWorkoutCatalogForCoach,
  countSubcategories14d,
} from "@/lib/coach-training-context";
import { sanitizeCoachWorkoutByDay } from "@/lib/coach-workout-by-day";
import { pushProgressToCloud } from "@/lib/progress-sync";
import type { DayKey, WeekConfig } from "@/lib/planner";
import { mergeAiWeekConfigPreservingUserMinutes } from "@/lib/week-config-merge";
import { formatPlayerIntakeForPrompt, loadPlayerIntake } from "@/lib/coach-intake";

type CoachCoachingResponse = {
  headline: string;
  bullets: string[];
  source?: "heuristic" | "llm";
  warning?: string;
  error?: string;
};

type CoachWeeklyResponse = CoachCoachingResponse & {
  weekConfig?: WeekConfig;
  coachWorkoutByDay?: Partial<Record<DayKey, string>>;
};

const COACH_WEEKLY_NOTE_STORAGE_KEY = "bt.coach-weekly-context";

function buildPayload() {
  const allSessions = getWorkoutSessions();
  const ms14 = 14 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - ms14;
  const sessionsInWindow = allSessions.filter((s) => new Date(s.dateISO).getTime() >= cutoff);
  const games = loadGameStats().slice(0, 8);
  const exerciseLookup = new Map(loadExercises().map((exercise) => [exercise.id, exercise]));
  const workoutLookup = new Map(loadWorkouts().map((workout) => [workout.id, workout]));
  const goals = loadTrainingGoalsBundle();
  const profileCache = (() => {
    try {
      const raw = window.localStorage.getItem("profile_cache_v4");
      return raw
        ? (JSON.parse(raw) as {
            profile?: {
              favorite_position?: string | null;
              height_cm?: number | null;
              weight_kg?: number | null;
              full_name?: string | null;
            };
            playStyle?: string;
            weekConfig?: Record<string, { mode: string; minutes: number }>;
            bodyMetrics?: {
              wingspan_cm?: number | null;
              standing_reach_cm?: number | null;
              body_fat_pct?: number | null;
            };
          })
        : null;
    } catch {
      return null;
    }
  })();

  const recentSessions = sessionsInWindow.slice(0, 32).map((session) => {
    const exercise = session.logs.map((log) => exerciseLookup.get(log.exerciseId)).find(Boolean);
    const totalMakes = session.logs.reduce((sum, log) => sum + (log.made ?? 0), 0);
    const totalAttempts = session.logs.reduce((sum, log) => sum + (log.attempts ?? 0), 0);
    const totalReps = session.logs.reduce((sum, log) => sum + (log.completedValue ?? 0), 0);
    const maxWeight = session.logs.reduce((max, log) => Math.max(max, log.weightKg ?? 0), 0);
    const fromLogs = session.logs.map((l) => l.rpe).filter((v): v is number => typeof v === "number");
    const avgLogRpe =
      fromLogs.length > 0 ? Math.round((fromLogs.reduce((a, b) => a + b, 0) / fromLogs.length) * 10) / 10 : null;
    const rpe = typeof session.avgRpe === "number" && Number.isFinite(session.avgRpe) ? session.avgRpe : avgLogRpe;
    return {
      date: session.dateISO.slice(0, 10),
      category: (exercise?.category as string) ?? session.workoutCategory ?? "Basketball",
      subcategory: exercise?.subcategory ?? session.workoutSubcategory ?? "",
      setCount: session.logs.length,
      rpe,
      makes: totalMakes,
      attempts: totalAttempts,
      weightKg: maxWeight,
      reps: totalReps,
    };
  });

  const recentTraining14d = buildRecentTrainingLog14d(allSessions, exerciseLookup, workoutLookup);
  const subcategoryCounts14d = countSubcategories14d(recentTraining14d);
  const workoutCatalog = buildWorkoutCatalogForCoach(loadWorkouts(), 80);

  const activeGoals = (goals.gymGoals ?? []).map((goal) => {
    const exerciseName = exerciseLookup.get(goal.exerciseId)?.name ?? goal.exerciseId;
    return `${exerciseName}: ${goal.weightKg} kg × ${goal.targetReps} Reps`;
  });

  const injuryExerciseNames = (goals.injuryExerciseIds ?? [])
    .map((id) => exerciseLookup.get(id)?.name)
    .filter((name): name is string => Boolean(name));

  let coachNote: string | undefined;
  try {
    const t = window.localStorage.getItem(COACH_WEEKLY_NOTE_STORAGE_KEY)?.trim();
    coachNote = t ? t.slice(0, 600) : undefined;
  } catch {
    coachNote = undefined;
  }

  const intake = loadPlayerIntake();
  const playerIntakeSummaryRaw = formatPlayerIntakeForPrompt(intake);
  const playerIntakeSummary = playerIntakeSummaryRaw ? playerIntakeSummaryRaw.slice(0, 2000) : undefined;
  const intakeAge =
    intake && !intake.skipped && intake.ageYears != null && intake.ageYears > 0 ? intake.ageYears : null;

  return {
    position: profileCache?.profile?.favorite_position ?? "sg",
    playStyle: profileCache?.playStyle ?? "",
    level: getProgressionState().level,
    mesocyclePhase: goals.mesocyclePhase,
    profile: {
      heightCm: profileCache?.profile?.height_cm ?? null,
      weightKg: profileCache?.profile?.weight_kg ?? null,
      bodyFatPct: profileCache?.bodyMetrics?.body_fat_pct ?? null,
      wingspanCm: profileCache?.bodyMetrics?.wingspan_cm ?? null,
      standingReachCm: profileCache?.bodyMetrics?.standing_reach_cm ?? null,
      fullName: profileCache?.profile?.full_name ?? null,
      age: intakeAge,
    },
    weekAvailability: profileCache?.weekConfig ?? undefined,
    activeGoals,
    injuryExerciseNames,
    recentSessions,
    recentTraining14d,
    subcategoryCounts14d,
    workoutCatalog,
    recentGames: games.map((g) => ({
      date: g.date,
      context: g.context,
      points: g.points,
      assists: g.assists,
      rebounds: g.rebounds,
      steals: g.steals,
    })),
    coachNote,
    playerIntakeSummary,
  };
}

export default function CoachInsight() {
  const [data, setData] = useState<CoachCoachingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [planNote, setPlanNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weeklyCoachNote, setWeeklyCoachNote] = useState("");

  useEffect(() => {
    try {
      setWeeklyCoachNote(window.localStorage.getItem(COACH_WEEKLY_NOTE_STORAGE_KEY) ?? "");
    } catch {
      setWeeklyCoachNote("");
    }
  }, []);

  const persistWeekFromAi = useCallback((week: WeekConfig, coachWorkoutByDay?: Partial<Record<DayKey, string>> | null) => {
    const key = "profile_cache_v4";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(window.localStorage.getItem(key) || "{}") as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    parsed.weekConfig = week;
    if (coachWorkoutByDay != null) {
      if (Object.keys(coachWorkoutByDay).length === 0) {
        delete parsed.coachWorkoutByDay;
      } else {
        parsed.coachWorkoutByDay = coachWorkoutByDay;
      }
    }
    window.localStorage.setItem(key, JSON.stringify(parsed));
    applyWeekConfigToCalendar(week, 28);
    void pushProgressToCloud();
    window.dispatchEvent(new Event("bt:plan-updated"));
    window.dispatchEvent(new Event("storage"));
  }, []);

  const fetchCoachingOnly = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = buildPayload();
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, intent: "coaching" }),
      });
      const json = (await response.json()) as CoachCoachingResponse;
      if (!response.ok && !json?.headline) {
        throw new Error(json?.error ?? `HTTP ${response.status}`);
      }
      setData({
        headline: json.headline,
        bullets: json.bullets ?? [],
        source: json.source,
        warning: json.warning,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coach nicht erreichbar.");
    } finally {
      setLoading(false);
    }
  }, []);

  const syncWeeklyPlanSilently = useCallback(async () => {
    setPlanNote(null);
    try {
      const payload = buildPayload();
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, intent: "weekly_plan" }),
      });
      const json = (await response.json()) as CoachWeeklyResponse;
      if (!json.weekConfig) {
        setPlanNote(json.error ?? "Wochenplan konnte nicht geladen werden.");
        return;
      }
      const safeAssignments = sanitizeCoachWorkoutByDay(
        json.coachWorkoutByDay,
        json.weekConfig,
        payload.workoutCatalog,
      );
      let existingWeek: WeekConfig | undefined;
      try {
        const raw = window.localStorage.getItem("profile_cache_v4");
        if (raw) {
          const parsed = JSON.parse(raw) as { weekConfig?: WeekConfig };
          if (parsed.weekConfig) existingWeek = parsed.weekConfig;
        }
      } catch {
        existingWeek = undefined;
      }
      const mergedWeek = mergeAiWeekConfigPreservingUserMinutes(json.weekConfig, existingWeek);
      persistWeekFromAi(mergedWeek, safeAssignments ?? null);
      setPlanNote("Wochenplan wurde mit KI abgestimmt und ins Weekly übernommen.");
    } catch {
      setPlanNote("Wochen-Sync fehlgeschlagen — Weekly zeigt weiter deine gespeicherte Woche.");
    }
  }, [persistWeekFromAi]);

  const applyWeeklyPlanManual = useCallback(async () => {
    setPlanLoading(true);
    setPlanNote(null);
    try {
      await syncWeeklyPlanSilently();
    } finally {
      setPlanLoading(false);
    }
  }, [syncWeeklyPlanSilently]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await fetchCoachingOnly();
      if (cancelled) return;
      await syncWeeklyPlanSilently();
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchCoachingOnly, syncWeeklyPlanSilently]);

  const badge = useMemo(() => {
    if (!data?.source) return null;
    if (data.source === "llm") return null;
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
            onClick={() => void applyWeeklyPlanManual()}
            disabled={planLoading || loading}
            className="btn btn-primary btn-xs"
          >
            {planLoading ? "Plan…" : "Woche neu (KI)"}
          </button>
          <button
            type="button"
            onClick={() => void fetchCoachingOnly()}
            disabled={loading}
            className="btn btn-ghost btn-xs"
          >
            {loading ? "lädt…" : "Tipps aktualisieren"}
          </button>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-muted">
        Der Wochenplan läuft in <strong className="text-strong">zwei Coach-Schritten</strong> (Kurzgespräch → konkreter Plan), dann ins Weekly. Optional kannst du unten eine persönliche Notiz hinterlegen. Hier siehst du die Kurz-Tipps.
      </p>

      <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
        <label className="text-[11px] font-medium text-muted" htmlFor="coach-weekly-note">
          Notiz für den Coach (optional, max. 600 Zeichen)
        </label>
        <textarea
          id="coach-weekly-note"
          rows={3}
          maxLength={600}
          value={weeklyCoachNote}
          onChange={(e) => {
            const v = e.target.value;
            setWeeklyCoachNote(v);
            try {
              window.localStorage.setItem(COACH_WEEKLY_NOTE_STORAGE_KEY, v);
            } catch {
              /* ignore */
            }
          }}
          placeholder="z. B. Turnier am Samstag, Knie zwickt nach Sprüngen, Fokus Dreier, wenig Schlaf diese Woche …"
          className="mt-1.5 w-full resize-y rounded-md border border-white/10 bg-zinc-950/80 px-2 py-1.5 text-xs text-strong placeholder:text-muted"
        />
        <p className="mt-1 text-[10px] text-muted">
          Wird bei <span className="text-strong">Tipps aktualisieren</span> und <span className="text-strong">Woche neu (KI)</span> mitgeschickt.
        </p>
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

      {planNote ? <p className="mt-2 text-[11px] text-cyan-200/90">{planNote}</p> : null}

      {data?.warning ? (
        <p className="mt-2 text-[11px] text-amber-200">Hinweis: {data.warning}</p>
      ) : null}
    </section>
  );
}
