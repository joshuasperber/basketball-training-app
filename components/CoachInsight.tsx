"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { buildCoachHeuristicResponse } from "@/lib/coach-heuristic";
import { readStoredCoachingCache, writeStoredCoachingCache } from "@/lib/coach-llm-cache";
import { sanitizeCoachWorkoutByDay } from "@/lib/coach-workout-by-day";
import { pushProgressToCloud } from "@/lib/progress-sync";
import type { DayKey, WeekConfig } from "@/lib/planner";
import { mergeAiWeekConfigPreservingUserMinutes } from "@/lib/week-config-merge";
import { formatPlayerIntakeForPrompt, loadPlayerIntake } from "@/lib/coach-intake";
import {
  getIsoWeekKey,
  isSignificantWeekConfigChange,
  loadWeekConfigFromProfileCache,
  shouldAutoRunWeeklyPlanLlm,
  weekConfigSignature,
  writeCoachLlmWeeklyMarkers,
} from "@/lib/coach-trigger";

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
  const games = loadGameStats().slice(0, 5);
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

  const recentSessions = sessionsInWindow.slice(0, 16).map((session) => {
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
  const workoutCatalog = buildWorkoutCatalogForCoach(loadWorkouts(), 40);

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
    coachNote = t ? t.slice(0, 400) : undefined;
  } catch {
    coachNote = undefined;
  }

  const intake = loadPlayerIntake();
  const playerIntakeSummaryRaw = formatPlayerIntakeForPrompt(intake);
  const playerIntakeSummary = playerIntakeSummaryRaw ? playerIntakeSummaryRaw.slice(0, 900) : undefined;
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

function buildLocalHeuristic(): CoachCoachingResponse {
  const payload = buildPayload();
  return buildCoachHeuristicResponse({
    mesocyclePhase: payload.mesocyclePhase,
    recentSessions: payload.recentSessions,
    recentGames: payload.recentGames,
  });
}

function parseWeekFromSignature(sig: string): Partial<Record<DayKey, { mode: string; minutes: number }>> {
  const week: Partial<Record<DayKey, { mode: string; minutes: number }>> = {};
  for (const part of sig.split("|")) {
    const [day, mode, minutes] = part.split(":");
    if (day && mode) week[day as DayKey] = { mode, minutes: Number(minutes) || 0 };
  }
  return week;
}

export default function CoachInsight() {
  const [data, setData] = useState<CoachCoachingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [planNote, setPlanNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weeklyCoachNote, setWeeklyCoachNote] = useState("");
  const weekSigRef = useRef("");
  const autoWeeklyRunningRef = useRef(false);
  const planDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      setWeeklyCoachNote(window.localStorage.getItem(COACH_WEEKLY_NOTE_STORAGE_KEY) ?? "");
    } catch {
      setWeeklyCoachNote("");
    }

    const cached = readStoredCoachingCache();
    const weekKey = getIsoWeekKey();
    if (cached && cached.weekKey === weekKey) {
      setData({
        headline: cached.headline,
        bullets: cached.bullets,
        source: cached.source,
        warning: cached.warning,
      });
    } else {
      setData(buildLocalHeuristic());
    }

    weekSigRef.current = weekConfigSignature(loadWeekConfigFromProfileCache());
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
    const sig = weekConfigSignature(week);
    weekSigRef.current = sig;
    writeCoachLlmWeeklyMarkers(getIsoWeekKey(), sig);
    window.dispatchEvent(new Event("bt:plan-updated"));
    window.dispatchEvent(new Event("storage"));
  }, []);

  const syncWeeklyPlanLlm = useCallback(
    async (skipCache = false) => {
      if (autoWeeklyRunningRef.current) return;
      autoWeeklyRunningRef.current = true;
      setPlanNote(null);
      try {
        const payload = buildPayload();
        const response = await fetch("/api/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, intent: "weekly_plan", skipCache }),
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
        setPlanNote("Wochenplan wurde per KI abgestimmt und ins Weekly übernommen.");
      } catch {
        setPlanNote("Wochen-Sync fehlgeschlagen — Weekly zeigt weiter deine gespeicherte Woche.");
      } finally {
        autoWeeklyRunningRef.current = false;
      }
    },
    [persistWeekFromAi],
  );

  const fetchCoachingLlm = useCallback(async (skipCache = false) => {
    setLoading(true);
    setError(null);
    try {
      const payload = buildPayload();
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, intent: "coaching", skipCache }),
      });
      const json = (await response.json()) as CoachCoachingResponse;
      if (!response.ok && !json?.headline) {
        throw new Error(json?.error ?? `HTTP ${response.status}`);
      }
      const next = {
        headline: json.headline,
        bullets: json.bullets ?? [],
        source: json.source,
        warning: json.warning,
      };
      setData(next);
      writeStoredCoachingCache({
        headline: next.headline,
        bullets: next.bullets,
        source: next.source,
        warning: next.warning,
        weekKey: getIsoWeekKey(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coach nicht erreichbar.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCoachWithLlm = useCallback(async () => {
    await fetchCoachingLlm(true);
    await syncWeeklyPlanLlm(true);
  }, [fetchCoachingLlm, syncWeeklyPlanLlm]);

  useEffect(() => {
    const auto = shouldAutoRunWeeklyPlanLlm();
    if (auto.run) {
      void syncWeeklyPlanLlm(false);
    }
  }, [syncWeeklyPlanLlm]);

  useEffect(() => {
    const onPlanUpdated = () => {
      if (planDebounceRef.current) clearTimeout(planDebounceRef.current);
      planDebounceRef.current = setTimeout(() => {
        const prevSig = weekSigRef.current;
        const currentWeek = loadWeekConfigFromProfileCache();
        const nextSig = weekConfigSignature(currentWeek);
        if (
          prevSig &&
          nextSig !== prevSig &&
          isSignificantWeekConfigChange(prevSig, nextSig, parseWeekFromSignature(prevSig), currentWeek)
        ) {
          weekSigRef.current = nextSig;
          void syncWeeklyPlanLlm(false);
          return;
        }
        weekSigRef.current = nextSig;
      }, 900);
    };
    window.addEventListener("bt:plan-updated", onPlanUpdated);
    return () => {
      window.removeEventListener("bt:plan-updated", onPlanUpdated);
      if (planDebounceRef.current) clearTimeout(planDebounceRef.current);
    };
  }, [syncWeeklyPlanLlm]);

  const badge = useMemo(() => {
    if (!data?.source) return null;
    if (data.source === "llm") return { label: "KI-Coach", className: "chip chip-success" };
    return { label: "Regel-Coach", className: "chip chip-info" };
  }, [data]);

  return (
    <section className="app-card--brand">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="section-eyebrow">Coach</p>
          <h3 className="section-title mt-1">{data?.headline ?? "Empfehlungen für deine Woche"}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {badge ? (
            <span className={badge.className}>{badge.label}</span>
          ) : null}
          <button
            type="button"
            onClick={() => void refreshCoachWithLlm()}
            disabled={loading}
            className="btn btn-primary btn-xs whitespace-nowrap"
          >
            {loading ? "Coach…" : "Coach aktualisieren"}
          </button>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-muted">
        Standard: <strong className="text-strong">Regel-Coach</strong> ohne API-Kosten. KI läuft nur bei{" "}
        <strong className="text-strong">Coach aktualisieren</strong>, neuer Kalenderwoche oder starker Planänderung
        (Spieltag, Gym↔Basketball, …).
      </p>

      <div className="mt-3 app-card--flat">
        <label className="input-label" htmlFor="coach-weekly-note">
          Notiz für den Coach (optional, max. 400 Zeichen)
        </label>
        <textarea
          id="coach-weekly-note"
          rows={3}
          maxLength={400}
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
          placeholder="z. B. Turnier am Samstag, Knie zwickt, Fokus Dreier …"
          className="textarea mt-1.5 text-xs"
        />
      </div>

      {error ? (
        <p className="mt-3 alert-error text-sm">{error}</p>
      ) : data ? (
        <ul className="mt-3 space-y-2 text-sm text-strong">
          {data.bullets.map((bullet, index) => (
            <li key={`bullet-${index}`} className="flex gap-2">
              <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-emerald)]" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">Noch keine Daten.</p>
      )}

      {planNote ? <p className="mt-2 text-[11px] text-muted">{planNote}</p> : null}

      {data?.warning ? (
        <p className="mt-2 text-[11px] text-amber-200">Hinweis: {data.warning}</p>
      ) : null}
    </section>
  );
}
