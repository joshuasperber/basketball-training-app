"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { type Category } from "@/lib/training-data";
import { CompletedWorkoutHistoryEntry, WORKOUT_HISTORY_KEY } from "@/lib/workout";
import {
  getWorkoutSessions,
  updateWorkoutSession,
  updateWorkoutSessionLogNote,
  type WorkoutSessionEntry,
} from "@/lib/session-storage";
import { toLocalDateKey } from "@/lib/workout";
import { loadExercises, loadWorkouts } from "@/lib/training-storage";
import GameStatsSearchPanel from "@/components/GameStatsSearchPanel";
import GameTrainingInsights from "@/components/GameTrainingInsights";
import MatchupHintsCard from "@/components/MatchupHintsCard";
import GymGoalsManager from "@/components/GymGoalsManager";
import TopSubTabs from "@/components/TopSubTabs";
import GradientFadeList from "@/components/GradientFadeList";
import ShootingZoneHeatmap from "@/components/ShootingZoneHeatmap";
import PageHeader from "@/components/PageHeader";
import TrendChart, { type TrendPoint } from "@/components/TrendChart";
import { useT } from "@/lib/i18n/I18nProvider";
import { ensureInitialCloudSync, pushProgressToCloud } from "@/lib/progress-sync";
import { loadGameStats } from "@/lib/game-stats";
import { countStrictTrackedSetsInLogs, countTrackedSetsInLogs, logCountsAsTrackedSet, sessionHasCompletedWork } from "@/lib/workout-session-metrics";
import { repCountFromSessionLog } from "@/lib/workout-metrics";
import {
  aggregateShootingByZone,
  computeFieldGoalPercentage,
  computeThreePointPercentage,
  mergeShootingZoneTotals,
  shootingZoneRows,
} from "@/lib/shooting-zone-stats";
import { aggregateGameShootingByZone } from "@/lib/game-shooting-splits";

type CategorySlice = { label: string; value: number; color: string };
type SportCategory = "Basketball" | "Gym" | "Home" | "Regeneration";

type BasketballExerciseStat = {
  exerciseId: string;
  exerciseName: string;
  attempts: number;
  made: number;
  misses: number;
  quote: number | null;
  usesShotMetrics: boolean;
};

type TimedExerciseTrend = {
  exerciseId: string;
  exerciseName: string;
  subcategory: string;
  points: number[];
};

type GymExerciseGoalStat = {
  exerciseId: string;
  exerciseName: string;
  avgWeightKg: number;
  avgReps: number;
  maxWeightKg: number;
  maxRepsAtMaxWeight: number;
  suggestedWeightKg: number;
  suggestedReps: number;
  progressionHint: string;
};

type StatsRange = "all" | "monthly" | "weekly";
type StatsDetailTab = "overview" | "basketball" | "gym";

type HistorySportBucket = "Basketball" | "Gym" | "Home" | "Regeneration";

type HistoryItem = {
  id: string;
  title: string;
  dateISO: string;
  sportBucket: HistorySportBucket;
  exerciseCount: number;
  totalValue: number;
};

const PIE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6"];

function normalizeGymSubcategory(subcategory: string): string | null {
  const s = subcategory.trim().toLowerCase();
  if (s === "oberkörper" || s === "push") return "Oberkörper";
  if (s === "arme" || s === "pull") return "Arme";
  if (s === "beine" || s === "legs" || s === "beinkraft") return "Beine";
  if (s === "cardio") return "Cardio";
  if (s === "core" || s === "kraftaufbau" || s === "power") return "Core";
  return null;
}

function normalizeBasketballSubcategory(subcategory: string): string | null {
  const s = subcategory.trim().toLowerCase();
  if (s === "shooting") return "Shooting";
  if (s === "finishing") return "Finishing";
  if (s === "conditioning" || s === "defense") return "Conditioning";
  if (s === "handles" || s === "handling") return "Handles";
  return null;
}

function loadHistory(): CompletedWorkoutHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(WORKOUT_HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as CompletedWorkoutHistoryEntry[];
  } catch {
    return [];
  }
}

function loadCombinedHistory(): CompletedWorkoutHistoryEntry[] {
  const baseHistory = loadHistory();
  if (typeof window === "undefined") return baseHistory;

  const exercises = loadExercises();
  const workouts = loadWorkouts();
  const workoutLookup = new Map(workouts.map((workout) => [workout.id, workout]));
  const exerciseLookup = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const trackedSessions = getTrackedWorkoutSessions();
  const trackedSessionKeys = new Set(
    trackedSessions.map((session) => `${session.dateISO.slice(0, 10)}-${session.workoutId}`),
  );

  const sessionHistory = trackedSessions.flatMap((session) => {
    if (session.workoutId === "single-exercise-session") return [];
    if (!sessionHasCompletedWork(session)) return [];
    const totalSets = countStrictTrackedSetsInLogs(session.logs);
    const totalReps = session.logs.reduce((sum, log) => sum + repCountFromSessionLog(log, exerciseLookup.get(log.exerciseId)), 0);
    const totalVolumeKg = session.logs.reduce(
      (sum, log) => sum + repCountFromSessionLog(log, exerciseLookup.get(log.exerciseId)) * Math.max(0, log.weightKg ?? 0),
      0,
    );
    const workout = workoutLookup.get(session.workoutId);
    const fallbackExercise = session.logs.map((log) => exerciseLookup.get(log.exerciseId)).find(Boolean);
    const resolvedSport =
      (workout?.category ?? session.workoutCategory ?? fallbackExercise?.category ?? "Basketball") as SportCategory;

    const grouped = session.logs.reduce<Record<string, { sets: number; reps: number; volumeKg: number }>>((acc, log) => {
      const exercise = exerciseLookup.get(log.exerciseId);
      const raw =
        exercise?.subcategory ??
        workout?.subcategory ??
        session.workoutSubcategory ??
        fallbackExercise?.subcategory ??
        (resolvedSport === "Gym" ? "Core" : resolvedSport === "Basketball" ? "Shooting" : "Recovery");

      const normalized =
        resolvedSport === "Gym"
          ? normalizeGymSubcategory(raw)
          : resolvedSport === "Basketball"
            ? normalizeBasketballSubcategory(raw)
            : raw;
      if (!normalized) return acc;

      const current = acc[normalized] ?? { sets: 0, reps: 0, volumeKg: 0 };
      const reps = repCountFromSessionLog(log, exercise);
      acc[normalized] = {
        sets: current.sets + (logCountsAsTrackedSet(log) ? 1 : 0),
        reps: current.reps + reps,
        volumeKg: current.volumeKg + Math.max(0, reps) * Math.max(0, log.weightKg ?? 0),
      };
      return acc;
    }, {});

    const groupedEntries = Object.entries(grouped).map(
      ([subcategory, values]) =>
        ({
          id: `${session.id}-${subcategory}`,
          date: session.dateISO.slice(0, 10),
          title: session.workoutName,
          sport: resolvedSport,
          subcategory,
          totalSets: values.sets,
          totalReps: values.reps,
          totalVolumeKg: values.volumeKg,
        }) satisfies CompletedWorkoutHistoryEntry,
    );

    if (groupedEntries.length > 0) return groupedEntries;

    return [
      {
        id: `${session.id}-fallback`,
        date: session.dateISO.slice(0, 10),
        title: session.workoutName,
        sport: resolvedSport,
        subcategory: resolvedSport === "Gym" ? "Core" : resolvedSport === "Basketball" ? "Shooting" : "Recovery",
        totalSets,
        totalReps,
        totalVolumeKg,
      } satisfies CompletedWorkoutHistoryEntry,
    ];
  });

  const unique = new Map<string, CompletedWorkoutHistoryEntry>();
  [
    ...sessionHistory,
    ...baseHistory.filter((entry) => !trackedSessionKeys.has(`${entry.date}-${entry.workoutId}`)),
  ].forEach((entry) => unique.set(entry.id, entry));
  return Array.from(unique.values());
}

function getTrackedWorkoutSessions() {
  return getWorkoutSessions().filter(sessionHasCompletedWork);
}

function countUniqueExercisesInSession(session: WorkoutSessionEntry) {
  return new Set(session.logs.filter(logCountsAsTrackedSet).map((log) => log.exerciseId)).size;
}

function filterSessionsByRange<T extends { dateISO: string }>(sessions: T[], range: StatsRange) {
  if (range === "all") return sessions;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (range === "weekly") start.setDate(start.getDate() - 6);
  if (range === "monthly") start.setDate(start.getDate() - 29);
  return sessions.filter((session) => new Date(session.dateISO) >= start);
}

function startOfIsoWeekMonday(ref: Date): Date {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function sessionAverageRpe(session: { avgRpe?: number | null; logs: { rpe?: number | null }[] }): number | null {
  if (typeof session.avgRpe === "number" && Number.isFinite(session.avgRpe)) return session.avgRpe;
  const fromLogs = session.logs.map((l) => l.rpe).filter((v): v is number => typeof v === "number");
  if (fromLogs.length === 0) return null;
  return Math.round((fromLogs.reduce((a, b) => a + b, 0) / fromLogs.length) * 10) / 10;
}

function buildBasketballExerciseStats(sessionsInput: WorkoutSessionEntry[], range: StatsRange): BasketballExerciseStat[] {
  const sessions = filterSessionsByRange(sessionsInput, range);
  const exercises = loadExercises();
  const exerciseLookup = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const map = new Map<string, { attempts: number; made: number; misses: number; usesShotMetrics: boolean }>();

  sessions.forEach((session) => {
    session.logs.forEach((log) => {
      const exercise = exerciseLookup.get(log.exerciseId);
      if (!exercise || exercise.category !== "Basketball") return;
      if (exercise.metricKeys.includes("time") && !exercise.metricKeys.includes("makes") && !exercise.metricKeys.includes("misses")) return;

      const current = map.get(log.exerciseId) ?? { attempts: 0, made: 0, misses: 0, usesShotMetrics: false };
      const hasShotInput = log.made != null || log.misses != null || log.attempts != null;

      let made = Math.max(0, log.made ?? 0);
      let misses = Math.max(0, log.misses ?? 0);
      let tries = Math.max(0, log.attempts ?? 0);
      if (hasShotInput) {
        if (log.made != null && log.misses != null) {
          tries = made + misses;
        } else if (log.made != null && log.attempts != null) {
          tries = Math.max(0, log.attempts ?? 0);
          misses = Math.max(0, tries - made);
        } else if (log.misses != null && log.attempts != null) {
          tries = Math.max(0, log.attempts ?? 0);
          made = Math.max(0, tries - misses);
        }
      }

      map.set(log.exerciseId, {
        attempts: current.attempts + tries,
        made: current.made + made,
        misses: current.misses + misses,
        usesShotMetrics: current.usesShotMetrics || hasShotInput,
      });
    });
  });

  return Array.from(map.entries())
    .map(([exerciseId, value]) => {
      const quote = value.usesShotMetrics && value.attempts > 0 ? Math.round((value.made / value.attempts) * 100) : null;
      return {
        exerciseId,
        exerciseName: exerciseLookup.get(exerciseId)?.name ?? exerciseId,
        attempts: value.attempts,
        made: value.made,
        misses: value.misses,
        quote,
        usesShotMetrics: value.usesShotMetrics,
      };
    })
    .filter((entry) => entry.usesShotMetrics)
    .sort((a, b) => b.attempts - a.attempts);
}

function buildTimedExerciseTrends(
  sessionsInput: WorkoutSessionEntry[],
  range: StatsRange,
  category: "Basketball" | "Gym",
): TimedExerciseTrend[] {
  const sessions = filterSessionsByRange(sessionsInput, range);
  const exercises = loadExercises();
  const exerciseLookup = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const map = new Map<string, number[]>();

  sessions.forEach((session) => {
    session.logs.forEach((log) => {
      const exercise = exerciseLookup.get(log.exerciseId);
      if (!exercise || exercise.category !== category) return;
      if (!exercise.metricKeys.includes("time") && !exercise.metricKeys.includes("distance")) return;
      const value = log.timeSeconds ?? log.distanceMeters ?? 0;
      if (value <= 0) return;
      map.set(log.exerciseId, [...(map.get(log.exerciseId) ?? []), value]);
    });
  });

  return Array.from(map.entries())
    .map(([exerciseId, points]) => ({
      exerciseId,
      exerciseName: exerciseLookup.get(exerciseId)?.name ?? exerciseId,
      subcategory:
        category === "Basketball"
          ? normalizeBasketballSubcategory(exerciseLookup.get(exerciseId)?.subcategory ?? "") ?? "Shooting"
          : normalizeGymSubcategory(exerciseLookup.get(exerciseId)?.subcategory ?? "") ?? "Core",
      points: points.slice(-10),
    }))
    .sort((a, b) => b.points.length - a.points.length);
}

function buildGymExerciseGoals(sessionsInput: WorkoutSessionEntry[], range: StatsRange): GymExerciseGoalStat[] {
  const sessions = filterSessionsByRange(sessionsInput, range);
  const exercises = loadExercises();
  const exerciseLookup = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const map = new Map<string, { weights: number[]; reps: number[]; latestISO: string | null; maxWeight: number; maxRepsAtMaxWeight: number }>();

  sessions.forEach((session) => {
    session.logs.forEach((log) => {
      const exercise = exerciseLookup.get(log.exerciseId);
      if (!exercise || exercise.category !== "Gym") return;
      const weight = log.weightKg ?? 0;
      const reps = repCountFromSessionLog(log, exercise);
      const current = map.get(log.exerciseId) ?? { weights: [], reps: [], latestISO: null, maxWeight: 0, maxRepsAtMaxWeight: 0 };
      if (weight > 0) current.weights.push(weight);
      if (reps > 0 && reps <= 30) current.reps.push(reps);
      if (weight >= current.maxWeight) {
        current.maxRepsAtMaxWeight = weight > current.maxWeight ? Math.max(0, reps) : Math.max(current.maxRepsAtMaxWeight, Math.max(0, reps));
        current.maxWeight = weight;
      }
      if (!current.latestISO || session.dateISO > current.latestISO) current.latestISO = session.dateISO;
      map.set(log.exerciseId, current);
    });
  });

  return Array.from(map.entries())
    .map(([exerciseId, data]) => {
      const avgWeightKg = data.weights.length ? data.weights.reduce((a, b) => a + b, 0) / data.weights.length : 0;
      const avgReps = data.reps.length ? data.reps.reduce((a, b) => a + b, 0) / data.reps.length : 0;
      const maxWeight = Math.max(0, Math.round(data.maxWeight * 10) / 10);
      const smallWeightStep = maxWeight > 0 && maxWeight <= 20 ? 2.5 : 0;
      const normalWeightStep = maxWeight > 20 ? 5 : 0;
      const suggestedWeightKg = Math.max(maxWeight, maxWeight + smallWeightStep + normalWeightStep);
      const baseReps = Math.max(3, Math.round(avgReps || data.maxRepsAtMaxWeight || 8));
      const suggestedReps = normalWeightStep > 0 || smallWeightStep > 0 ? baseReps : Math.min(20, baseReps + 1);
      const progressionHint =
        normalWeightStep > 0
          ? `+5 kg Ziel. Falls Satz 1 nicht klappt: Steigerung erst in Satz 2 oder 5 anwenden.`
          : smallWeightStep > 0
            ? `+2.5 kg Ziel (leichtere Last). Alternativ Reps in Satz 2 oder 5 steigern.`
            : "Gewicht beibehalten und Wiederholungen steigern (zur Not erst im Satz 2/5).";
      return {
        exerciseId,
        exerciseName: exerciseLookup.get(exerciseId)?.name ?? exerciseId,
        avgWeightKg: Math.round(avgWeightKg * 10) / 10,
        avgReps: Math.round(avgReps * 10) / 10,
        maxWeightKg: data.maxWeight,
        maxRepsAtMaxWeight: data.maxRepsAtMaxWeight,
        suggestedWeightKg: Math.round(suggestedWeightKg * 10) / 10,
        suggestedReps,
        progressionHint,
      };
    })
    .sort((a, b) => b.maxWeightKg - a.maxWeightKg);
}

function pieGradient(slices: CategorySlice[]) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return "conic-gradient(#27272a 0deg 360deg)";
  let start = 0;
  const segments = slices.map((slice) => {
    const degrees = (slice.value / total) * 360;
    const end = start + degrees;
    const segment = `${slice.color} ${start}deg ${end}deg`;
    start = end;
    return segment;
  });
  return `conic-gradient(${segments.join(", ")})`;
}

function PieCard({ title, slices }: { title: string; slices: CategorySlice[] }) {
  return (
    <section className="app-card">
      <p className="section-eyebrow">Verteilung</p>
      <h2 className="section-title mt-1">{title}</h2>
      <div className="mt-4 flex items-center gap-4">
        <div className="stat-pie h-28 w-28" style={{ background: pieGradient(slices) }} />
        <ul className="min-w-0 flex-1 space-y-1.5 text-sm text-strong">
          {slices.length === 0 ? (
            <li className="text-muted">Noch keine Daten vorhanden.</li>
          ) : (
            slices.map((slice) => (
              <li key={slice.label} className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slice.color }} />
                <span className="text-muted">
                  {slice.label}: <strong className="text-strong">{slice.value}</strong>
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}

function resolveHistorySport(session: WorkoutSessionEntry): HistorySportBucket {
  const exercises = loadExercises();
  const exerciseLookup = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const scores: Record<Category, number> = { Basketball: 0, Gym: 0, Home: 0, Regeneration: 0 };
  session.logs.forEach((log) => {
    const ex = exerciseLookup.get(log.exerciseId);
    if (!ex) return;
    const intensity = Math.max(1, (log.completedValue ?? 0) + (log.attempts ?? 0) + (log.weightKg ?? 0) * 0.1);
    scores[ex.category] += intensity;
  });
  if (scores.Regeneration >= scores.Basketball && scores.Regeneration >= scores.Gym && scores.Regeneration >= scores.Home) return "Regeneration";
  if (scores.Gym >= scores.Basketball && scores.Gym >= scores.Home) return "Gym";
  if (scores.Home >= scores.Basketball && scores.Home >= scores.Gym) return "Home";
  return "Basketball";
}

function StatsPageContent() {
  const t = useT();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const detailTab: StatsDetailTab =
    tabParam === "basketball" || tabParam === "gym" ? tabParam : "overview";
  const [history, setHistory] = useState<CompletedWorkoutHistoryEntry[]>(() =>
    typeof window !== "undefined" ? loadCombinedHistory() : [],
  );
  const [sessionDetails, setSessionDetails] = useState<WorkoutSessionEntry[]>(() =>
    typeof window !== "undefined" ? getTrackedWorkoutSessions() : [],
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [range, setRange] = useState<StatsRange>("all");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    games: true,
    trainingStats: false,
    basketballQuotes: false,
    timeExercises: false,
    history: false,
    gymGoals: false,
    basketballHistory: false,
    gymHistory: false,
  });
  const [username, setUsername] = useState("Spieler");  const [gameStats, setGameStats] = useState<ReturnType<typeof loadGameStats>>(() =>
    typeof window !== "undefined" ? loadGameStats() : [],
  );
  const [sessionNotesDraft, setSessionNotesDraft] = useState("");

  const refreshSessionDetails = useCallback(() => {
    setSessionDetails(getTrackedWorkoutSessions());
  }, []);

useEffect(() => {
    try {
      const cached = window.localStorage.getItem("profile_cache_v4");
      if (!cached) return;
      const parsed = JSON.parse(cached) as {
        profile?: { username?: string | null; full_name?: string | null; favorite_position?: string | null };
      };
      const nextName = parsed.profile?.username?.trim() || parsed.profile?.full_name?.trim() || "Spieler";      const timer = window.setTimeout(() => {
        setUsername(nextName);
      }, 0);
      return () => window.clearTimeout(timer);
    } catch {
      return undefined;
    }
  }, []);

useEffect(() => {
    setGameStats(loadGameStats());
    void ensureInitialCloudSync().then(() => {
      setGameStats(loadGameStats());
      setHistory(loadCombinedHistory());
      refreshSessionDetails();
    });
  }, [refreshSessionDetails]);

  useEffect(() => {
    const onGameStatsUpdate = () => setGameStats(loadGameStats());
    window.addEventListener("bt:game-stats-updated", onGameStatsUpdate);
    return () => window.removeEventListener("bt:game-stats-updated", onGameStatsUpdate);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHistory(loadCombinedHistory());
      refreshSessionDetails();
      setGameStats(loadGameStats());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshSessionDetails]);

  useEffect(() => {
    const onSessions = () => {
      setHistory(loadCombinedHistory());
      refreshSessionDetails();
    };
    window.addEventListener("bt:sessions-updated", onSessions);
    window.addEventListener("bt:workout-progress-updated", onSessions);
    return () => {
      window.removeEventListener("bt:sessions-updated", onSessions);
      window.removeEventListener("bt:workout-progress-updated", onSessions);
    };
  }, [refreshSessionDetails]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!selectedSessionId) {
        setSessionNotesDraft("");
        return;
      }
      const s = sessionDetails.find((x) => x.id === selectedSessionId);
      setSessionNotesDraft(s?.sessionNotes ?? "");
    }, 0);
    return () => window.clearTimeout(id);
  }, [selectedSessionId, sessionDetails]);

  const filteredHistory = useMemo(() => {
    if (range === "all") return history;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    if (range === "weekly") start.setDate(start.getDate() - 6);
    if (range === "monthly") start.setDate(start.getDate() - 29);
    return history.filter((entry) => new Date(entry.date) >= start);
  }, [history, range]);

  const filteredSessions = useMemo(() => filterSessionsByRange(sessionDetails, range), [range, sessionDetails]);
  const totalWorkoutCount = filteredSessions.length > 0
    ? filteredSessions.length
    : new Set(
        filteredHistory
          .filter((entry) => entry.totalSets > 0)
          .map((entry) => `${entry.date}-${entry.workoutId ?? entry.title}`),
      ).size;

  const weeklyLoadRpe = useMemo(() => {
    const monday = startOfIsoWeekMonday(new Date());
    const weekEnd = new Date(monday);
    weekEnd.setDate(monday.getDate() + 7);

    const weekSessions = sessionDetails.filter((s) => {
      const t = new Date(s.dateISO).getTime();
      return t >= monday.getTime() && t < weekEnd.getTime() && s.workoutCategory !== "Regeneration";
    });

    const dayLabels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    const points: TrendPoint[] = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = toLocalDateKey(d);
      const daySessions = weekSessions.filter((s) => toLocalDateKey(new Date(s.dateISO)) === key);
      const rpes = daySessions.map((s) => sessionAverageRpe(s)).filter((v): v is number => v != null);
      const avg = rpes.length > 0 ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : 0;
      points.push({ label: dayLabels[i], value: avg });
    }

    const allRpes = weekSessions.map((s) => sessionAverageRpe(s)).filter((v): v is number => v != null);
    const weekAvg =
      allRpes.length > 0 ? Math.round((allRpes.reduce((a, b) => a + b, 0) / allRpes.length) * 10) / 10 : null;

    let recommendation =
      "Noch zu wenig RPE-Daten diese Woche — trage beim nächsten Workout pro Satz ein RPE (1–10) ein.";
    let tone: "ok" | "watch" | "high" = "ok";
    if (weekAvg != null) {
      if (weekAvg >= 8.5) {
        recommendation =
          "Die wöchentliche Belastung wirkt sehr hoch. Deload oder eine leichte Erholungswoche einplanen und Schlaf priorisieren.";
        tone = "high";
      } else if (weekAvg >= 7.5) {
        recommendation =
          "Belastung ist erhöht — Volumen moderaten, Technik- und Regenerationseinheiten beibehalten oder leicht erhöhen.";
        tone = "watch";
      } else if (weekAvg <= 5.5 && allRpes.length >= 3) {
        recommendation =
          "Intensität war diese Woche eher moderat — du kannst 1–2 Einheiten gezielt fortschreiben (Volumen oder RPE leicht steigern).";
        tone = "ok";
      } else {
        recommendation = "Belastung liegt in einem gesunden Rahmen für kontinuierliches Training.";
        tone = "ok";
      }
    }

    const chartPoints = points.filter((p) => p.value > 0);
    return {
      points,
      chartPoints,
      weekAvg,
      sessionCount: weekSessions.length,
      rpeSampleCount: allRpes.length,
      recommendation,
      tone,
    };
  }, [sessionDetails]);

  const basketballStats = useMemo(() => buildBasketballExerciseStats(sessionDetails, range), [sessionDetails, range]);
  const basketballTimedTrends = useMemo(
    () => buildTimedExerciseTrends(sessionDetails, range, "Basketball"),
    [sessionDetails, range],
  );
  const gymTimedTrends = useMemo(
    () => buildTimedExerciseTrends(sessionDetails, range, "Gym"),
    [sessionDetails, range],
  );
  const gymGoals = useMemo(() => buildGymExerciseGoals(sessionDetails, range), [sessionDetails, range]);
  const exerciseLookupForSplit = useMemo(() => new Map(loadExercises().map((exercise) => [exercise.id, exercise])), []);

  const totalSetsFromSessions = filteredSessions.reduce((sum, session) => sum + countTrackedSetsInLogs(session.logs), 0);
  const totalSets = totalSetsFromSessions > 0
    ? totalSetsFromSessions
    : filteredHistory.reduce((sum, entry) => sum + entry.totalSets, 0);
  const totalRepsFromSessions = filteredSessions.reduce(
    (sum, session) =>
      sum +
      session.logs.reduce(
        (sessionSum, log) => sessionSum + repCountFromSessionLog(log, exerciseLookupForSplit.get(log.exerciseId)),
        0,
      ),
    0,
  );
  const totalReps = totalRepsFromSessions > 0
    ? totalRepsFromSessions
    : filteredHistory.reduce((sum, entry) => sum + entry.totalReps, 0);
  const totalCompletedExercisesFromSessions = filteredSessions.reduce((sum, session) => sum + countUniqueExercisesInSession(session), 0);
  const totalCompletedExercises =
    totalCompletedExercisesFromSessions > 0
      ? totalCompletedExercisesFromSessions
      : filteredHistory.reduce((sum, entry) => sum + (entry.totalSets > 0 ? 1 : 0), 0);
  const totalVolumeFromSessions = filteredSessions.reduce(
    (sum, session) =>
      sum +
      session.logs.reduce(
        (sessionSum, log) =>
          sessionSum + repCountFromSessionLog(log, exerciseLookupForSplit.get(log.exerciseId)) * Math.max(0, log.weightKg ?? 0),
        0,
      ),
    0,
  );
  const totalVolume = totalVolumeFromSessions > 0
    ? totalVolumeFromSessions
    : filteredHistory.filter((entry) => entry.sport === "Gym").reduce((sum, entry) => sum + entry.totalVolumeKg, 0);

  const basketballSessions = useMemo(
    () => filteredSessions.filter((session) => resolveHistorySport(session) === "Basketball"),
    [filteredSessions],
  );
  const basketballTotals = useMemo(() => {
    const sets = basketballSessions.reduce((sum, session) => sum + countTrackedSetsInLogs(session.logs), 0);
    const reps = basketballSessions.reduce(
      (sum, session) =>
        sum + session.logs.reduce((inner, log) => inner + repCountFromSessionLog(log, exerciseLookupForSplit.get(log.exerciseId)), 0),
      0,
    );
    const exercises = basketballSessions.reduce((sum, session) => sum + countUniqueExercisesInSession(session), 0);
    const minutes = Math.round(
      basketballSessions.reduce((sum, session) => sum + Math.max(0, session.durationSeconds ?? Math.max(session.logs.length, 1) * 90), 0) / 60,
    );
    return { workouts: basketballSessions.length, exercises, sets, reps, minutes };
  }, [basketballSessions, exerciseLookupForSplit]);

  const gymSessions = useMemo(
    () => filteredSessions.filter((session) => resolveHistorySport(session) === "Gym"),
    [filteredSessions],
  );
  const gymTotalsSummary = useMemo(() => {
    const sets = gymSessions.reduce((sum, session) => sum + countTrackedSetsInLogs(session.logs), 0);
    const reps = gymSessions.reduce(
      (sum, session) =>
        sum + session.logs.reduce((inner, log) => inner + repCountFromSessionLog(log, exerciseLookupForSplit.get(log.exerciseId)), 0),
      0,
    );
    const exercises = gymSessions.reduce((sum, session) => sum + countUniqueExercisesInSession(session), 0);
    const minutes = Math.round(
      gymSessions.reduce((sum, session) => sum + Math.max(0, session.durationSeconds ?? Math.max(session.logs.length, 1) * 90), 0) / 60,
    );
    const volume = gymSessions.reduce(
      (sum, session) =>
        sum +
        session.logs.reduce(
          (inner, log) =>
            inner + repCountFromSessionLog(log, exerciseLookupForSplit.get(log.exerciseId)) * Math.max(0, log.weightKg ?? 0),
          0,
        ),
      0,
    );
    return { workouts: gymSessions.length, exercises, sets, reps, minutes, volume };
  }, [exerciseLookupForSplit, gymSessions]);

  const sportSlices = useMemo(() => {
    const counts: Record<SportCategory, number> = { Basketball: 0, Gym: 0, Home: 0, Regeneration: 0 };
    filteredSessions.forEach((session) => {
      session.logs.forEach((log) => {
        const ex = exerciseLookupForSplit.get(log.exerciseId);
        if (!ex) return;
        counts[ex.category as SportCategory] += 1;
      });
    });
    return (Object.keys(counts) as SportCategory[]).map((sport, index) => ({
      label: sport,
      value: counts[sport],
      color: PIE_COLORS[index % PIE_COLORS.length],
    }));
  }, [exerciseLookupForSplit, filteredSessions]);
  const subcategoryBySport = useMemo(() => {
    const bySport: Record<SportCategory, Record<string, number>> = {
      Basketball: {},
      Gym: {},
      Home: {},
      Regeneration: {},
    };
    filteredSessions.forEach((session) => {
      session.logs.forEach((log) => {
        const ex = exerciseLookupForSplit.get(log.exerciseId);
        if (!ex) return;
        bySport[ex.category as SportCategory][ex.subcategory] = (bySport[ex.category as SportCategory][ex.subcategory] ?? 0) + 1;
      });
    });
    return (Object.keys(bySport) as SportCategory[]).reduce((acc, sport) => {
      acc[sport] = Object.entries(bySport[sport]).map(([label, value], index) => ({
        label,
        value,
        color: PIE_COLORS[index % PIE_COLORS.length],
      })).sort((a, b) => b.value - a.value);
      return acc;
    }, {} as Record<SportCategory, CategorySlice[]>);
  }, [exerciseLookupForSplit, filteredSessions]);

  const exerciseLookup = useMemo(() => new Map(loadExercises().map((exercise) => [exercise.id, exercise.name])), []);

  const selectedSession = useMemo(
    () => sessionDetails.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, sessionDetails],
  );

  const historyBuckets = useMemo(() => {
    const mapped: HistoryItem[] = filteredSessions.map((session) => ({
      id: session.id,
      title: session.workoutName,
      dateISO: session.dateISO,
      sportBucket: resolveHistorySport(session),
      exerciseCount: countUniqueExercisesInSession(session),
      totalValue: session.logs.reduce((sum, log) => sum + Math.max(0, log.completedValue ?? 0), 0),
    }));

    return {
      Basketball: mapped.filter((item) => item.sportBucket === "Basketball"),
      Gym: mapped.filter((item) => item.sportBucket === "Gym"),
      Home: mapped.filter((item) => item.sportBucket === "Home"),
      Regeneration: mapped.filter((item) => item.sportBucket === "Regeneration"),
    };
  }, [filteredSessions]);

  const totalMinutesTrained = Math.round(
    filteredSessions.reduce((sum, session) => sum + Math.max(0, session.durationSeconds ?? Math.max(session.logs.length, 1) * 90), 0) / 60,
  );
  const filteredGameStats = useMemo(() => {
    if (range === "all") return gameStats;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    if (range === "weekly") start.setDate(start.getDate() - 6);
    if (range === "monthly") start.setDate(start.getDate() - 29);
    return gameStats.filter((entry) => new Date(entry.date) >= start);
  }, [gameStats, range]);

  const gameTotals = useMemo(
    () =>
      filteredGameStats.reduce(
        (acc, entry) => ({
          games: acc.games + (entry.context === "game" ? 1 : 0),
          gameTrainings: acc.gameTrainings + (entry.context === "game_training" ? 1 : 0),
          points: acc.points + (entry.points ?? 0),
          assists: acc.assists + (entry.assists ?? 0),
          rebounds: acc.rebounds + (entry.rebounds ?? 0),
          steals: acc.steals + (entry.steals ?? 0),
          minutes: acc.minutes + (entry.minutes ?? 0),
          intensitySum: acc.intensitySum + (entry.intensity ?? 0),
          intensityCount: acc.intensityCount + (entry.intensity != null ? 1 : 0),
        }),
        { games: 0, gameTrainings: 0, points: 0, assists: 0, rebounds: 0, steals: 0, minutes: 0, intensitySum: 0, intensityCount: 0 },
      ),
    [filteredGameStats],
  );

  const shootingZoneStats = useMemo(() => {
    const workoutTotals = aggregateShootingByZone(basketballSessions, exerciseLookupForSplit);
    const gameTotals = aggregateGameShootingByZone(filteredGameStats);
    const totals = mergeShootingZoneTotals(workoutTotals, gameTotals);
    return {
      rows: shootingZoneRows(totals),
      totals,
      fieldGoalPct: computeFieldGoalPercentage(totals),
      threePointPct: computeThreePointPercentage(totals),
    };
  }, [basketballSessions, exerciseLookupForSplit, filteredGameStats]);

  const toggleSection = (
    key:
      | "games"
      | "trainingStats"
      | "basketballQuotes"
      | "timeExercises"
      | "history"
      | "gymGoals"
      | "basketballHistory"
      | "gymHistory",
  ) => {
    setOpenSections((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <main className="app-container animate-in">
      <PageHeader
        eyebrow={t("stats.eyebrow", { user: username })}
        title={t("stats.title")}
        subtitle={t("stats.subtitle")}
      />
      <div className="mt-3">
        <TopSubTabs
          items={[
            { labelKey: "tabs.stats", href: "/stats" },
            { labelKey: "tabs.level", href: "/level" },
            { labelKey: "tabs.review", href: "/review" },
          ]}
        />
      </div>
      <div className="stats-controls-stack mt-2">
        <div className="segmented-wrap">
          <div className="segmented">
            {[
              { id: "all", label: t("stats.rangeAll") },
              { id: "monthly", label: t("stats.rangeMonth") },
              { id: "weekly", label: t("stats.rangeWeek") },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setRange(option.id as StatsRange)}
                className={`segmented__btn ${range === option.id ? "segmented__btn--active" : ""}`}
                aria-pressed={range === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="top-tabs-wrap">
          <div className="top-tabs">
            {([
              { id: "overview", label: t("stats.tabOverview"), href: "/stats?tab=overview" },
              { id: "basketball", label: t("stats.tabBasketball"), href: "/stats?tab=basketball" },
              { id: "gym", label: t("stats.tabGym"), href: "/stats?tab=gym" },
            ] as const).map((tab) => (
              <Link
                key={tab.id}
                href={tab.href}
                className={`top-tabs__btn ${detailTab === tab.id ? "top-tabs__btn--active" : ""}`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
      {detailTab === "overview" ? (
        <>
          <div className="grid-stats mt-6">
            <div className="stat-tile"><p className="stat-tile__label">Workouts</p><p className="stat-tile__value">{totalWorkoutCount}</p></div>
            <div className="stat-tile"><p className="stat-tile__label">Exercises</p><p className="stat-tile__value">{totalCompletedExercises}</p></div>
            <div className="stat-tile"><p className="stat-tile__label">Sätze</p><p className="stat-tile__value">{totalSets}</p></div>
            <div className="stat-tile"><p className="stat-tile__label">Reps</p><p className="stat-tile__value">{totalReps}</p></div>
            <div className="stat-tile"><p className="stat-tile__label">Minuten</p><p className="stat-tile__value">{totalMinutesTrained}</p></div>
            <div className="stat-tile"><p className="stat-tile__label">Volumen (kg)</p><p className="stat-tile__value">{totalVolume}</p></div>
          </div>

          <section
            className={`mt-6 app-card ${
              weeklyLoadRpe.tone === "high"
                ? "border-rose-500/30"
                : weeklyLoadRpe.tone === "watch"
                  ? "border-amber-500/30"
                  : ""
            }`}
          >
            <p className="section-eyebrow">Kalenderwoche</p>
            <h2 className="section-title mt-1">Belastung diese Woche (RPE)</h2>
            <p className="mt-1 text-xs text-muted">
              Aus Sessions mit erfasstem RPE · Mo–So (lokale Zeit) · {weeklyLoadRpe.sessionCount} Workouts ·{" "}
              {weeklyLoadRpe.rpeSampleCount} RPE-Mittelwerte
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-faint">Ø RPE (Woche)</p>
                <p className="text-3xl font-semibold tabular-nums text-strong">
                  {weeklyLoadRpe.weekAvg != null ? weeklyLoadRpe.weekAvg : "—"}
                  {weeklyLoadRpe.weekAvg != null ? <span className="ml-1 text-base font-medium text-muted">/ 10</span> : null}
                </p>
              </div>
              <p className="max-w-xl flex-1 text-sm text-strong">{weeklyLoadRpe.recommendation}</p>
            </div>
            <div className="mt-5">
              {weeklyLoadRpe.chartPoints.length > 0 ? (
                <TrendChart points={weeklyLoadRpe.chartPoints} yLabel="RPE" yMax={10} height={110} lowerIsBetter />
              ) : (
                <p className="text-xs text-faint">Keine Tages-RPE-Werte — nach ein paar protokollierten Sätzen erscheint der Verlauf.</p>
              )}
            </div>
          </section>

          <div className="mt-6 space-y-4">
            <section className="app-card">
              <p className="section-eyebrow">Vergleich</p>
              <h2 className="section-title mt-1">Kategorien</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                <div className="stat-tile text-center">
                  <p className="stat-tile__label">Basketball</p>
                  <p className="stat-tile__value">{sportSlices.find((slice) => slice.label === "Basketball")?.value ?? 0}</p>
                  <p className="stat-tile__sub">Exercises</p>
                </div>
                <div className="stat-tile text-center">
                  <p className="stat-tile__label">Gym</p>
                  <p className="stat-tile__value">{sportSlices.find((slice) => slice.label === "Gym")?.value ?? 0}</p>
                  <p className="stat-tile__sub">Exercises</p>
                </div>
                <div className="col-span-2 stat-tile md:row-span-2 md:col-span-1">
                  <p className="stat-tile__label text-center">Gesamtverteilung</p>
                  <div className="mt-3 flex justify-center">
                    <div className="stat-pie h-36 w-36" style={{ background: pieGradient(sportSlices) }} />
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-strong">
                    {sportSlices.map((slice) => (
                      <p key={`center-${slice.label}`} className="text-muted">{slice.label}: <span className="font-semibold text-strong">{slice.value}</span></p>
                    ))}
                  </div>
                </div>
                <div className="stat-tile text-center">
                  <p className="stat-tile__label">Home</p>
                  <p className="stat-tile__value">{sportSlices.find((slice) => slice.label === "Home")?.value ?? 0}</p>
                  <p className="stat-tile__sub">Exercises</p>
                </div>
                <div className="stat-tile text-center">
                  <p className="stat-tile__label">Regeneration</p>
                  <p className="stat-tile__value">{sportSlices.find((slice) => slice.label === "Regeneration")?.value ?? 0}</p>
                  <p className="stat-tile__sub">Exercises</p>
                </div>
              </div>
            </section>
            <div className="grid gap-4 lg:grid-cols-2">
              <PieCard title="Basketball Unterkategorien" slices={subcategoryBySport.Basketball ?? []} />
              <PieCard title="Gym Unterkategorien" slices={subcategoryBySport.Gym ?? []} />
              <PieCard title="Home Unterkategorien" slices={subcategoryBySport.Home ?? []} />
              <PieCard title="Regeneration Unterkategorien" slices={subcategoryBySport.Regeneration ?? []} />
            </div>
          </div>

          <section className="mt-6 app-card">
            <button type="button" onClick={() => toggleSection("history")} className="flex w-full items-center justify-between text-left">
              <span className="section-title">Historie (alle Exercises/Workouts)</span>
              <span className="chip">{openSections.history ? "−" : "+"}</span>
            </button>
            {openSections.history ? (
              <div className="mt-4 space-y-3">
                {([
                  ["Basketball-Historie", historyBuckets.Basketball],
                  ["Gym-Historie", historyBuckets.Gym],
                  ["Home-Workout-Historie", historyBuckets.Home],
                  ["Regeneration-Historie", historyBuckets.Regeneration],
                ] as const).map(([title, bucket]) => (
                  <div key={title} className="list-card">
                    <p className="font-semibold text-strong">{title}</p>
                    <div className="mt-2">
                      {bucket.length === 0 ? (
                        <p className="text-sm text-muted">Keine Einträge.</p>
                      ) : (
                        <GradientFadeList
                          items={bucket}
                          listClassName="space-y-2"
                          getKey={(entry) => entry.id}
                          renderItem={(entry) => (
                            <button
                              type="button"
                              onClick={() => setSelectedSessionId(entry.id)}
                              className="list-card block w-full text-left text-sm"
                            >
                              <p className="font-semibold text-strong">{entry.title}</p>
                              <p className="text-muted">
                                {new Date(entry.dateISO).toLocaleString("de-DE")} · Übungen: {entry.exerciseCount}
                              </p>
                              <p className="text-strong">Gesamtwert: {entry.totalValue}</p>
                            </button>
                          )}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {detailTab === "basketball" ? (
        <>
          <section className="mt-6 app-card">
            <button type="button" onClick={() => toggleSection("games")} className="flex w-full items-center justify-between text-left">
              <div>
                <p className="section-eyebrow">Game Tracking</p>
                <span className="section-title">Spiele</span>
              </div>
              <span className="chip">{openSections.games ? "−" : "+"}</span>
            </button>
            {openSections.games ? (
              <div className="mt-4">
                <p className="text-xs text-muted">
                  {gameTotals.games} Spieltage · {gameTotals.gameTrainings} Spieltrainings · {filteredGameStats.length}{" "}
                  Einträge im Zeitraum
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="stat-tile">
                    <p className="stat-tile__label">Spiele</p>
                    <p className="stat-tile__value">{gameTotals.games}</p>
                  </div>
                  <div className="stat-tile">
                    <p className="stat-tile__label">Spieltraining</p>
                    <p className="stat-tile__value">{gameTotals.gameTrainings}</p>
                  </div>
                  <div className="stat-tile">
                    <p className="stat-tile__label">Ø Punkte / Spiel</p>
                    <p className="stat-tile__value">
                      {gameTotals.games > 0 ? Math.round(gameTotals.points / gameTotals.games) : "–"}
                    </p>
                  </div>
                </div>
                <div className="mt-5 border-t border-[var(--surface-border)] pt-4">
                  <GameStatsSearchPanel entries={filteredGameStats} variant="full" />
                </div>
                <div className="mt-6">
                  <GameTrainingInsights />
                </div>
                <div className="mt-6">
                  <MatchupHintsCard />
                </div>
              </div>
            ) : null}
          </section>

          <section className="mt-6 app-card">
            <button type="button" onClick={() => toggleSection("trainingStats")} className="flex w-full items-center justify-between text-left">
              <div>
                <p className="section-eyebrow">Training</p>
                <span className="section-title">Workouts &amp; Übungen</span>
              </div>
              <span className="chip">{openSections.trainingStats ? "−" : "+"}</span>
            </button>
            {openSections.trainingStats ? (
              <>
                <div className="mt-3 grid-stats">
                  <div className="stat-tile"><p className="stat-tile__label">Workouts</p><p className="stat-tile__value">{basketballTotals.workouts}</p></div>
                  <div className="stat-tile"><p className="stat-tile__label">Minuten</p><p className="stat-tile__value">{basketballTotals.minutes}</p></div>
                  <div className="stat-tile"><p className="stat-tile__label">Sätze</p><p className="stat-tile__value">{basketballTotals.sets}</p></div>
                </div>
              </>
            ) : null}
          </section>

          {openSections.trainingStats && shootingZoneStats.rows.length > 0 ? (
            <section className="mt-6 app-card--accent-cyan">
              <p className="section-eyebrow">Shooting Splits</p>
              <h2 className="section-title mt-1">Wurfzonen (NBA-Standard)</h2>
              <p className="mt-2 text-sm text-muted">
                FT%, FG% und 3P% nach Zone — Workouts und Spiel-Track (At Rim, In The Paint, Mid-Range, Corner 3, Beyond the Arc).
              </p>
              {shootingZoneStats.fieldGoalPct != null || shootingZoneStats.threePointPct != null ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {shootingZoneStats.fieldGoalPct != null ? (
                    <div className="stat-tile">
                      <p className="stat-tile__label">FG% · Field Goal</p>
                      <p className="stat-tile__value">
                        {shootingZoneStats.fieldGoalPct}
                        <span className="ml-1 text-sm font-medium text-muted">%</span>
                      </p>
                    </div>
                  ) : null}
                  {shootingZoneStats.threePointPct != null ? (
                    <div className="stat-tile">
                      <p className="stat-tile__label">3P% · Three Point</p>
                      <p className="stat-tile__value">
                        {shootingZoneStats.threePointPct}
                        <span className="ml-1 text-sm font-medium text-muted">%</span>
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <ShootingZoneHeatmap totals={shootingZoneStats.totals} className="mt-4" />
              <GradientFadeList
                className="mt-4"
                items={shootingZoneStats.rows}
                listClassName="space-y-3"
                getKey={(row) => row.zone}
                renderItem={(row) => (
                  <div className="list-card">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-strong">{row.label}</p>
                        <p className="text-xs text-muted">
                          {row.makes}/{row.attempts} · {row.hint}
                        </p>
                      </div>
                      <p className="text-lg font-bold text-strong">
                        {row.pct ?? 0}%
                        <span className="ml-1 text-xs font-medium text-faint">{row.pctKind}</span>
                      </p>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bg-muted)]">
                      <div
                        className="h-full rounded-full bg-[var(--brand-500)]"
                        style={{ width: `${row.pct ?? 0}%` }}
                      />
                    </div>
                  </div>
                )}
              />
            </section>
          ) : null}

          <section className="mt-6 app-card">
            <button type="button" onClick={() => toggleSection("basketballQuotes")} className="flex w-full items-center justify-between text-left">
              <span className="section-title">Basketball-Übungen</span>
              <span className="chip">{openSections.basketballQuotes ? "−" : "+"}</span>
            </button>
            {openSections.basketballQuotes ? (
              basketballStats.length === 0 ? <p className="mt-3 text-sm text-muted">Noch keine Basketball-Übungsdaten vorhanden.</p> : (
                <GradientFadeList
                  className="mt-3"
                  items={basketballStats}
                  listClassName="space-y-2"
                  getKey={(entry) => entry.exerciseId}
                  renderItem={(entry) => (
                    <div className="list-card">
                      <p className="font-semibold text-strong">{entry.exerciseName}</p>
                      <p className="mt-1 text-sm text-muted">Quote: <strong className="text-strong">{entry.quote ?? 0}%</strong> · Makes: {entry.made} · Reps: {entry.attempts} · Misses: {entry.misses}</p>
                    </div>
                  )}
                />
              )
            ) : null}
          </section>

          <section className="mt-6 app-card">
            <button type="button" onClick={() => toggleSection("timeExercises")} className="flex w-full items-center justify-between text-left">
              <span className="section-title">Distanz und zeitbasierte Übungen (Basketball)</span>
              <span className="chip">{openSections.timeExercises ? "−" : "+"}</span>
            </button>
            {openSections.timeExercises ? (
              basketballTimedTrends.length === 0 ? <p className="mt-3 text-sm text-muted">Noch keine Distanz- oder zeitbasierten Basketball-Verläufe vorhanden.</p> : (
                <GradientFadeList
                  className="mt-3"
                  items={basketballTimedTrends}
                  listClassName="space-y-3"
                  getKey={(trend) => trend.exerciseId}
                  renderItem={(trend) => {
                    const chartPoints: TrendPoint[] = trend.points.map((value, index) => ({ label: `S${index + 1}`, value }));
                    return (
                      <div className="list-card">
                        <p className="text-sm font-semibold text-strong">{trend.exerciseName} <span className="text-muted">({trend.subcategory})</span></p>
                        <div className="mt-2"><TrendChart points={chartPoints} yLabel="Wert" /></div>
                      </div>
                    );
                  }}
                />
              )
            ) : null}
          </section>

          <section className="mt-6 app-card">
            <button type="button" onClick={() => toggleSection("basketballHistory")} className="flex w-full items-center justify-between text-left">
              <span className="section-title">Historie Basketball</span>
              <span className="chip">{openSections.basketballHistory ? "−" : "+"}</span>
            </button>
            {openSections.basketballHistory ? (
              historyBuckets.Basketball.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Keine Einträge.</p>
              ) : (
                <GradientFadeList
                  className="mt-3"
                  items={historyBuckets.Basketball}
                  listClassName="space-y-2"
                  getKey={(entry) => entry.id}
                  renderItem={(entry) => (
                    <button
                      type="button"
                      onClick={() => setSelectedSessionId(entry.id)}
                      className="list-card block w-full text-left text-sm"
                    >
                      <p className="font-semibold text-strong">{entry.title}</p>
                      <p className="text-muted">{new Date(entry.dateISO).toLocaleString("de-DE")} · Übungen: {entry.exerciseCount}</p>
                      <p className="text-strong">Gesamtwert: {entry.totalValue}</p>
                    </button>
                  )}
                />
              )
            ) : null}
          </section>
        </>
      ) : null}

      {detailTab === "gym" ? (
        <>
          <section className="mt-6 app-card">
            <p className="section-eyebrow">Gym</p>
            <h2 className="section-title mt-1">Gym Kennzahlen</h2>
            <div className="mt-3 grid-stats">
              <div className="stat-tile"><p className="stat-tile__label">Workouts</p><p className="stat-tile__value">{gymTotalsSummary.workouts}</p></div>
              <div className="stat-tile"><p className="stat-tile__label">Exercises</p><p className="stat-tile__value">{gymTotalsSummary.exercises}</p></div>
              <div className="stat-tile"><p className="stat-tile__label">Sätze</p><p className="stat-tile__value">{gymTotalsSummary.sets}</p></div>
              <div className="stat-tile"><p className="stat-tile__label">Reps</p><p className="stat-tile__value">{gymTotalsSummary.reps}</p></div>
              <div className="stat-tile"><p className="stat-tile__label">Minuten</p><p className="stat-tile__value">{gymTotalsSummary.minutes}</p></div>
              <div className="stat-tile"><p className="stat-tile__label">Volumen (kg)</p><p className="stat-tile__value">{gymTotalsSummary.volume}</p></div>
            </div>
          </section>

          <GymGoalsManager />

          <section className="mt-6 app-card">
            <button type="button" onClick={() => toggleSection("gymGoals")} className="flex w-full items-center justify-between text-left">
              <span className="section-title">Gym Ziele je Exercise</span>
              <span className="chip">{openSections.gymGoals ? "−" : "+"}</span>
            </button>
            {openSections.gymGoals ? (
              gymGoals.length === 0 ? <p className="mt-3 text-sm text-muted">Noch keine Gym-Daten vorhanden.</p> : (
                <GradientFadeList
                  className="mt-3"
                  items={gymGoals}
                  listClassName="space-y-2"
                  getKey={(entry) => entry.exerciseId}
                  renderItem={(entry) => (
                    <div className="list-card text-sm">
                      <p className="font-semibold text-strong">{entry.exerciseName}</p>
                      <p className="text-muted">Ø Gewicht {entry.avgWeightKg} kg · Ø Reps {entry.avgReps} · Max {entry.maxWeightKg} kg × {entry.maxRepsAtMaxWeight}</p>
                      <p className="hint-success">Nächstes Ziel: {entry.suggestedWeightKg} kg × {entry.suggestedReps} Reps</p>
                      <p className="mt-1 text-xs text-faint">{entry.progressionHint}</p>
                    </div>
                  )}
                />
              )
            ) : null}
          </section>

          <section className="mt-6 app-card">
            <button type="button" onClick={() => toggleSection("timeExercises")} className="flex w-full items-center justify-between text-left">
              <span className="section-title">Distanz und zeitbasierte Übungen (Gym)</span>
              <span className="chip">{openSections.timeExercises ? "−" : "+"}</span>
            </button>
            {openSections.timeExercises ? (
              gymTimedTrends.length === 0 ? <p className="mt-3 text-sm text-muted">Noch keine Distanz- oder zeitbasierten Gym-Verläufe vorhanden.</p> : (
                <GradientFadeList
                  className="mt-3"
                  items={gymTimedTrends}
                  listClassName="space-y-3"
                  getKey={(trend) => trend.exerciseId}
                  renderItem={(trend) => {
                    const chartPoints: TrendPoint[] = trend.points.map((value, index) => ({ label: `S${index + 1}`, value }));
                    return (
                      <div className="list-card">
                        <p className="text-sm font-semibold text-strong">{trend.exerciseName} <span className="text-muted">({trend.subcategory})</span></p>
                        <div className="mt-2"><TrendChart points={chartPoints} yLabel="Wert" /></div>
                      </div>
                    );
                  }}
                />
              )
            ) : null}
          </section>

          <section className="mt-6 app-card">
            <button type="button" onClick={() => toggleSection("gymHistory")} className="flex w-full items-center justify-between text-left">
              <span className="section-title">Historie Gym</span>
              <span className="chip">{openSections.gymHistory ? "−" : "+"}</span>
            </button>
            {openSections.gymHistory ? (
              historyBuckets.Gym.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Keine Einträge.</p>
              ) : (
                <GradientFadeList
                  className="mt-3"
                  items={historyBuckets.Gym}
                  listClassName="space-y-2"
                  getKey={(entry) => entry.id}
                  renderItem={(entry) => (
                    <button
                      type="button"
                      onClick={() => setSelectedSessionId(entry.id)}
                      className="list-card block w-full text-left text-sm"
                    >
                      <p className="font-semibold text-strong">{entry.title}</p>
                      <p className="text-muted">{new Date(entry.dateISO).toLocaleString("de-DE")} · Übungen: {entry.exerciseCount}</p>
                      <p className="text-strong">Gesamtwert: {entry.totalValue}</p>
                    </button>
                  )}
                />
              )
            ) : null}
          </section>
        </>
      ) : null}

      {selectedSession ? (
        <section className="mt-6 app-card--accent-cyan">
          <p className="section-eyebrow">Workout-Details</p>
          <h2 className="section-title mt-1">{selectedSession.workoutName}</h2>
          <p className="mt-1 text-xs text-muted">{new Date(selectedSession.dateISO).toLocaleString("de-DE")}</p>
          <div className="mt-3">
            <label className="input-label">Workout-Notiz</label>
            <textarea
              value={sessionNotesDraft}
              onChange={(e) => setSessionNotesDraft(e.target.value)}
              rows={2}
              className="textarea mt-1"
              placeholder="z. B. Fokus, Gegner, Gefühl …"
            />
            <button
              type="button"
              className="btn btn-primary btn-sm mt-2"
              onClick={() => {
                updateWorkoutSession(selectedSession.id, { sessionNotes: sessionNotesDraft });
                refreshSessionDetails();
                void pushProgressToCloud();
              }}
            >
              Notiz speichern
            </button>
          </div>
          <GradientFadeList
            className="mt-3"
            items={selectedSession.logs}
            listClassName="space-y-2"
            getKey={(log, index) => `${selectedSession.id}-${log.exerciseId}-${index}`}
            renderItem={(log, index) => (
              <article className="list-card text-sm">
                <p className="font-semibold text-strong">{exerciseLookup.get(log.exerciseId) ?? log.exerciseId}</p>
                <p className="text-muted">
                  Reps/Wert: {log.completedValue ?? "-"} · Gewicht: {log.weightKg ?? "-"} kg · Reps: {log.attempts ?? "-"} · Makes: {log.made ?? "-"} · Misses: {log.misses ?? "-"}
                </p>
                <label className="input-label mt-2">Übungs-Notiz</label>
                <textarea
                  key={`${selectedSession.id}-${index}`}
                  defaultValue={log.note ?? ""}
                  onBlur={(e) => {
                    const next = e.target.value;
                    if (next === (log.note ?? "")) return;
                    updateWorkoutSessionLogNote(selectedSession.id, index, next);
                    refreshSessionDetails();
                    void pushProgressToCloud();
                  }}
                  rows={2}
                  className="textarea mt-1"
                  placeholder="Technik, Ballgefühl …"
                />
              </article>
            )}
          />
        </section>
      ) : null}
    </main>
  );
}

function StatsPageFallback() {
  const t = useT();
  return (
    <main className="app-container">
      <p className="text-sm text-muted">{t("stats.loading")}</p>
    </main>
  );
}

export default function StatsPage() {
  return (
    <Suspense fallback={<StatsPageFallback />}>
      <StatsPageContent />
    </Suspense>
  );
}
