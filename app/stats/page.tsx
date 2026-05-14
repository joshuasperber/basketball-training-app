"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import { type Category } from "@/lib/training-data";
import { CompletedWorkoutHistoryEntry, WORKOUT_HISTORY_KEY } from "@/lib/workout";
import { getWorkoutSessions, updateWorkoutSession, updateWorkoutSessionLogNote } from "@/lib/session-storage";
import { loadExercises, loadWorkouts } from "@/lib/training-storage";
import BasketballCoachingCard from "@/components/BasketballCoachingCard";
import GameStatsSearchPanel from "@/components/GameStatsSearchPanel";
import GameTrainingInsights from "@/components/GameTrainingInsights";
import GymGoalsManager from "@/components/GymGoalsManager";
import TopSubTabs from "@/components/TopSubTabs";
import PageHeader from "@/components/PageHeader";
import TrendChart, { type TrendPoint } from "@/components/TrendChart";
import { buildBasketballCoachingPlan } from "@/lib/basketball-coaching";
import { downloadTrainingCsv } from "@/lib/export-training-csv";
import { pullProgressFromCloud, pushProgressToCloud } from "@/lib/progress-sync";
import { loadGameStats } from "@/lib/game-stats";
import { getProgressionState } from "@/lib/level-system";
import { countTrackedSetsInLogs, logCountsAsTrackedSet } from "@/lib/workout-session-metrics";

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

type SessionDetail = {
  id: string;
  dateISO: string;
  workoutName: string;
  sessionNotes?: string;
  logs: ReturnType<typeof getWorkoutSessions>[number]["logs"];
};
type StatsRange = "all" | "monthly" | "weekly";

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

  const sessionHistory = getTrackedWorkoutSessions().flatMap((session) => {
    if (session.workoutId === "single-exercise-session") return [];
    const totalSets = countTrackedSetsInLogs(session.logs);
    const totalReps = session.logs.reduce((sum, log) => sum + (log.completedValue ?? log.made ?? 0), 0);
    const workout = workoutLookup.get(session.workoutId);
    const fallbackExercise = session.logs.map((log) => exerciseLookup.get(log.exerciseId)).find(Boolean);
    const resolvedSport =
      (workout?.category ?? session.workoutCategory ?? fallbackExercise?.category ?? "Basketball") as SportCategory;

    const grouped = session.logs.reduce<Record<string, { sets: number; reps: number }>>((acc, log) => {
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

      const current = acc[normalized] ?? { sets: 0, reps: 0 };
      acc[normalized] = {
        sets: current.sets + (logCountsAsTrackedSet(log) ? 1 : 0),
        reps: current.reps + (log.completedValue ?? log.made ?? 0),
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
          totalVolumeKg: 0,
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
        totalVolumeKg: 0,
      } satisfies CompletedWorkoutHistoryEntry,
    ];
  });

  const unique = new Map<string, CompletedWorkoutHistoryEntry>();
  [...sessionHistory, ...baseHistory].forEach((entry) => unique.set(entry.id, entry));
  return Array.from(unique.values());
}

function getTrackedWorkoutSessions() {
  return getWorkoutSessions();
}

function filterSessionsByRange<T extends { dateISO: string }>(sessions: T[], range: StatsRange) {
  if (range === "all") return sessions;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (range === "weekly") start.setDate(start.getDate() - 6);
  if (range === "monthly") start.setDate(start.getDate() - 29);
  return sessions.filter((session) => new Date(session.dateISO) >= start);
}

function buildBasketballExerciseStats(range: StatsRange): BasketballExerciseStat[] {
  const sessions = filterSessionsByRange(getTrackedWorkoutSessions(), range);
  const exercises = loadExercises();
  const exerciseLookup = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const map = new Map<string, { attempts: number; made: number; misses: number; usesShotMetrics: boolean }>();

  sessions.forEach((session) => {
    session.logs.forEach((log) => {
      const exercise = exerciseLookup.get(log.exerciseId);
      if (!exercise || exercise.category !== "Basketball") return;

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

function buildTimedExerciseTrends(range: StatsRange): TimedExerciseTrend[] {
  const sessions = filterSessionsByRange(getTrackedWorkoutSessions(), range);
  const exercises = loadExercises();
  const exerciseLookup = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const map = new Map<string, number[]>();

  sessions.forEach((session) => {
    session.logs.forEach((log) => {
      const exercise = exerciseLookup.get(log.exerciseId);
      if (!exercise || exercise.category !== "Basketball") return;
      if (!exercise.metricKeys.includes("time")) return;
      const value = log.completedValue ?? 0;
      if (value <= 0) return;
      map.set(log.exerciseId, [...(map.get(log.exerciseId) ?? []), value]);
    });
  });

  return Array.from(map.entries())
    .map(([exerciseId, points]) => ({
      exerciseId,
      exerciseName: exerciseLookup.get(exerciseId)?.name ?? exerciseId,
      subcategory: normalizeBasketballSubcategory(exerciseLookup.get(exerciseId)?.subcategory ?? "") ?? "Shooting",
      points: points.slice(-10),
    }))
    .sort((a, b) => b.points.length - a.points.length);
}

function buildGymExerciseGoals(range: StatsRange): GymExerciseGoalStat[] {
  const sessions = filterSessionsByRange(getTrackedWorkoutSessions(), range);
  const exercises = loadExercises();
  const exerciseLookup = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const map = new Map<string, { weights: number[]; reps: number[]; latestISO: string | null; maxWeight: number; maxRepsAtMaxWeight: number }>();

  sessions.forEach((session) => {
    session.logs.forEach((log) => {
      const exercise = exerciseLookup.get(log.exerciseId);
      if (!exercise || exercise.category !== "Gym") return;
      const weight = log.weightKg ?? 0;
      const reps = log.completedValue ?? log.attempts ?? 0;
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
        <div className="h-28 w-28 rounded-full border border-white/10" style={{ background: pieGradient(slices) }} />
        <ul className="space-y-1.5 text-sm text-strong">
          {slices.length === 0 ? (
            <li className="text-muted">Noch keine Daten vorhanden.</li>
          ) : (
            slices.map((slice) => (
              <li key={slice.label} className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: slice.color }} />
                <span className="text-muted">{slice.label}: <strong className="text-strong">{slice.value}</strong></span>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}

function resolveHistorySport(session: SessionDetail): HistorySportBucket {
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

export default function StatsPage() {
  const [history, setHistory] = useState<CompletedWorkoutHistoryEntry[]>([]);
  const [sessionDetails, setSessionDetails] = useState<SessionDetail[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [range, setRange] = useState<StatsRange>("all");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    basketballQuotes: false,
    timeExercises: false,
    history: false,
    gymGoals: false,
  });
  const [username, setUsername] = useState("Champion");
  const [gameStats, setGameStats] = useState(() => loadGameStats());
  const [sessionNotesDraft, setSessionNotesDraft] = useState("");

  const refreshSessionDetails = useCallback(() => {
    setSessionDetails(
      getTrackedWorkoutSessions().map((session) => ({
        id: session.id,
        dateISO: session.dateISO,
        workoutName: session.workoutName,
        sessionNotes: session.sessionNotes,
        logs: session.logs,
      })),
    );
  }, []);

useEffect(() => {
    try {
      const cached = window.localStorage.getItem("profile_cache_v4");
      if (!cached) return;
      const parsed = JSON.parse(cached) as { profile?: { username?: string | null; full_name?: string | null } };
      const nextName = parsed.profile?.username?.trim() || parsed.profile?.full_name?.trim() || "Champion";
      const timer = window.setTimeout(() => setUsername(nextName), 0);
      return () => window.clearTimeout(timer);
    } catch {
      return undefined;
    }
  }, []);

useEffect(() => {
    void pullProgressFromCloud().then(() => setGameStats(loadGameStats()));
  }, []);

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
    const onSessions = () => refreshSessionDetails();
    window.addEventListener("bt:sessions-updated", onSessions);
    return () => window.removeEventListener("bt:sessions-updated", onSessions);
  }, [refreshSessionDetails]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!selectedSessionId) {
        setSessionNotesDraft("");
        return;
      }
      const s = getWorkoutSessions().find((x) => x.id === selectedSessionId);
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

  const basketballStats = useMemo(() => buildBasketballExerciseStats(range), [range]);
  const timedTrends = useMemo(() => buildTimedExerciseTrends(range), [range]);
  const gymGoals = useMemo(() => buildGymExerciseGoals(range), [range]);

  const totalSets = filteredHistory.reduce((sum, entry) => sum + entry.totalSets, 0);
  const totalReps = filteredHistory.reduce((sum, entry) => sum + entry.totalReps, 0);
  const totalCompletedExercises = filteredSessions.reduce((sum, session) => sum + session.logs.length, 0);
  const totalVolume = filteredHistory.filter((entry) => entry.sport === "Gym").reduce((sum, entry) => sum + entry.totalVolumeKg, 0);
  const exerciseLookupForSplit = useMemo(() => new Map(loadExercises().map((exercise) => [exercise.id, exercise])), []);
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
      exerciseCount: session.logs.length,
      totalValue: session.logs.reduce((sum, log) => sum + Math.max(0, log.completedValue ?? 0), 0),
    }));

    return {
      Basketball: mapped.filter((item) => item.sportBucket === "Basketball"),
      Gym: mapped.filter((item) => item.sportBucket === "Gym"),
      Home: mapped.filter((item) => item.sportBucket === "Home"),
      Regeneration: mapped.filter((item) => item.sportBucket === "Regeneration"),
    };
  }, [filteredSessions]);

  const totalMinutesTrained = filteredSessions.reduce((sum, session) => sum + session.logs.length * 4, 0);
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
        }),
        { games: 0, gameTrainings: 0, points: 0, assists: 0, rebounds: 0, steals: 0, minutes: 0 },
      ),
    [filteredGameStats],
  );

  const basketballShotSummary = useMemo(() => {
    const exercises = loadExercises();
    const exerciseLookupMap = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    const summary = {
      freeThrows: { made: 0, attempts: 0 },
      twoPointers: { made: 0, attempts: 0 },
      threePointers: { made: 0, attempts: 0 },
    };
    filteredSessions.forEach((session) => {
      session.logs.forEach((log) => {
        const exercise = exerciseLookupMap.get(log.exerciseId);
        if (!exercise || exercise.category !== "Basketball") return;
        const normalizedSubcategory = normalizeBasketballSubcategory(exercise.subcategory);
        const name = exercise.name.toLowerCase();
        const attempts = Math.max(0, log.attempts ?? ((log.made ?? 0) + (log.misses ?? 0)));
        const made = Math.max(0, log.made ?? 0);
        if (attempts <= 0) return;
        if (name.includes("freiwurf") || name.includes("free throw")) {
          summary.freeThrows.attempts += attempts;
          summary.freeThrows.made += made;
        } else if (name.includes("3 pointer") || name.includes("3-pointer") || name.includes("3pt")) {
          summary.threePointers.attempts += attempts;
          summary.threePointers.made += made;
        } else if (normalizedSubcategory === "Shooting" || normalizedSubcategory === "Finishing") {
          summary.twoPointers.attempts += attempts;
          summary.twoPointers.made += made;
        }
      });
    });
    return summary;
  }, [filteredSessions]);

  const toggleSection = (key: "basketballQuotes" | "timeExercises" | "history" | "gymGoals") => {
    setOpenSections((current) => ({ ...current, [key]: !current[key] }));
  };

  const basketballCoachingPlan = useMemo(() => {
    void history.length;
    void sessionDetails.length;
    void gameStats.length;
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem("profile_cache_v4");
      const parsed = raw
        ? (JSON.parse(raw) as { profile?: { favorite_position?: string | null }; playStyle?: string })
        : null;
      return buildBasketballCoachingPlan({
        sessions: getWorkoutSessions(),
        position: parsed?.profile?.favorite_position ?? "sg",
        playStyle: parsed?.playStyle ?? "",
        level: getProgressionState().level,
      });
    } catch {
      return null;
    }
  }, [history, sessionDetails, gameStats]);

  return (
    <main className="app-container animate-in">
      <PageHeader
        eyebrow={`Hi ${username}`}
        title="Statistiken"
        subtitle="Langfristige Auswertung deiner abgeschlossenen Workouts und Spiele."
        actions={
          <>
            <button type="button" onClick={() => downloadTrainingCsv()} className="btn btn-ghost btn-sm">
              CSV Export
            </button>
            <Link href="/review" className="btn btn-outline btn-sm">
              Wochen-Review
            </Link>
          </>
        }
      />
      <div className="mt-3">
        <TopSubTabs
          items={[
            { label: "Stats", href: "/stats" },
            { label: "Level", href: "/level" },
            { label: "Review", href: "/review" },
          ]}
        />
      </div>

      <div className="mt-4">
        <div className="segmented">
          {[
            { id: "all", label: "All Time" },
            { id: "monthly", label: "Monthly" },
            { id: "weekly", label: "Weekly" },
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

      <div className="grid-stats mt-6">
        <div className="stat-tile"><p className="stat-tile__label">Workouts</p><p className="stat-tile__value">{filteredHistory.length}</p></div>
        <div className="stat-tile"><p className="stat-tile__label">Exercises</p><p className="stat-tile__value">{totalCompletedExercises}</p></div>
        <div className="stat-tile"><p className="stat-tile__label">Sätze</p><p className="stat-tile__value">{totalSets}</p></div>
        <div className="stat-tile"><p className="stat-tile__label">Reps</p><p className="stat-tile__value">{totalReps}</p></div>
        <div className="stat-tile"><p className="stat-tile__label">Minuten</p><p className="stat-tile__value">{totalMinutesTrained}</p></div>
        <div className="stat-tile"><p className="stat-tile__label">Volumen (kg)</p><p className="stat-tile__value">{totalVolume}</p></div>
      </div>
      <section className="mt-4 app-card--accent-violet">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-eyebrow">Game Tracking</p>
            <h2 className="section-title mt-1">Spiel-Stats</h2>
            <p className="text-xs text-muted">Summen für den gewählten Zeitraum · Einträge aus „Spiel tracken“</p>
          </div>
          <p className="text-xs font-medium text-faint">{filteredGameStats.length} Einträge</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Spiele", value: gameTotals.games },
            { label: "Spieltraining", value: gameTotals.gameTrainings },
            { label: "Minuten", value: gameTotals.minutes },
            { label: "Punkte Σ", value: gameTotals.points },
          ].map((card) => (
            <div key={card.label} className="stat-tile">
              <p className="stat-tile__label">{card.label}</p>
              <p className="stat-tile__value">{card.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            { label: "Assists Σ", value: gameTotals.assists },
            { label: "Rebounds Σ", value: gameTotals.rebounds },
            { label: "Steals Σ", value: gameTotals.steals },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <span className="text-sm text-muted">{row.label}</span>
              <span className="text-lg font-semibold tabular-nums text-strong">{row.value}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 border-t border-white/10 pt-4">
          <GameStatsSearchPanel entries={filteredGameStats} variant="full" />
        </div>
      </section>

      <div className="mt-6">
        <GameTrainingInsights />
      </div>

      <GymGoalsManager />

      {basketballCoachingPlan?.recommendations.length ? (
        <BasketballCoachingCard
          recommendations={basketballCoachingPlan.recommendations}
          windowDays={basketballCoachingPlan.windowDays}
        />
      ) : null}

      <section className="mt-6 app-card">
        <p className="section-eyebrow">Wurfquoten</p>
        <h2 className="section-title mt-1">Basketball aggregiert</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          {[
            { label: "Free Throws", value: basketballShotSummary.freeThrows },
            { label: "2 Pointer", value: basketballShotSummary.twoPointers },
            { label: "3 Pointer", value: basketballShotSummary.threePointers },
          ].map((item) => {
            const pct = item.value.attempts > 0 ? Math.round((item.value.made / item.value.attempts) * 100) : 0;
            return (
              <div key={item.label} className="stat-tile">
                <p className="stat-tile__label">{item.label}</p>
                <p className="stat-tile__value">{pct}<span className="ml-1 text-sm font-medium text-muted">%</span></p>
                <p className="stat-tile__sub">{item.value.made}/{item.value.attempts}</p>
              </div>
            );
          })}
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
                <div className="h-36 w-36 rounded-full border border-white/10" style={{ background: pieGradient(sportSlices) }} />
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
        <button type="button" onClick={() => toggleSection("basketballQuotes")} className="flex w-full items-center justify-between text-left">
          <span className="section-title">Basketball-Quoten je Übung</span>
          <span className="chip">{openSections.basketballQuotes ? "−" : "+"}</span>
        </button>
        {openSections.basketballQuotes ? (
          basketballStats.length === 0 ? <p className="mt-3 text-sm text-muted">Noch keine Basketball-Übungsdaten vorhanden.</p> : (
            <div className="mt-3 space-y-2">
              {basketballStats.map((entry) => (
                <div key={entry.exerciseId} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="font-semibold text-strong">{entry.exerciseName}</p>
                  <p className="mt-1 text-sm text-muted">Quote: <strong className="text-strong">{entry.quote ?? 0}%</strong> · Makes: {entry.made} · Reps: {entry.attempts} · Misses: {entry.misses}</p>
                </div>
              ))}
            </div>
          )
        ) : null}
      </section>

      <section className="mt-6 app-card">
        <button type="button" onClick={() => toggleSection("timeExercises")} className="flex w-full items-center justify-between text-left">
          <span className="section-title">Zeitbasierte Basketball-Übungen</span>
          <span className="chip">{openSections.timeExercises ? "−" : "+"}</span>
        </button>
        {openSections.timeExercises ? (
          timedTrends.length === 0 ? <p className="mt-3 text-sm text-muted">Noch keine zeitbasierten Verläufe vorhanden.</p> : (
            <div className="mt-3 space-y-3">
              {timedTrends.map((trend) => {
                const chartPoints: TrendPoint[] = trend.points.map((value, index) => ({
                  label: `S${index + 1}`,
                  value,
                }));
                return (
                  <div key={trend.exerciseId} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-sm font-semibold text-strong">{trend.exerciseName} <span className="text-muted">({trend.subcategory})</span></p>
                    <p className="mt-1 text-xs text-muted">
                      Letzt: {trend.points[trend.points.length - 1]} s · Best: {Math.max(...trend.points)} s · Ø: {Math.round(trend.points.reduce((sum, point) => sum + point, 0) / trend.points.length)} s
                    </p>
                    <div className="mt-2"><TrendChart points={chartPoints} yLabel="Sekunden" /></div>
                  </div>
                );
              })}
            </div>
          )
        ) : null}
      </section>

      <section className="mt-6 app-card">
        <button type="button" onClick={() => toggleSection("gymGoals")} className="flex w-full items-center justify-between text-left">
          <span className="section-title">Gym Ziele je Exercise</span>
          <span className="chip">{openSections.gymGoals ? "−" : "+"}</span>
        </button>
        {openSections.gymGoals ? (
          gymGoals.length === 0 ? <p className="mt-3 text-sm text-muted">Noch keine Gym-Daten vorhanden.</p> : (
            <div className="mt-3 space-y-2">
              {gymGoals.map((entry) => (
                <div key={entry.exerciseId} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                  <p className="font-semibold text-strong">{entry.exerciseName}</p>
                  <p className="text-muted">Ø Gewicht {entry.avgWeightKg} kg · Ø Reps {entry.avgReps} · Max {entry.maxWeightKg} kg × {entry.maxRepsAtMaxWeight}</p>
                  <p className="text-emerald-300">Nächstes Ziel: {entry.suggestedWeightKg} kg × {entry.suggestedReps} Reps</p>
                  <p className="mt-1 text-xs text-faint">{entry.progressionHint}</p>
                </div>
              ))}
            </div>
          )
        ) : null}
      </section>

      <section className="mt-6 app-card">
        <button type="button" onClick={() => toggleSection("history")} className="flex w-full items-center justify-between text-left">
          <span className="section-title">Historie</span>
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
              <div key={title} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="font-semibold text-strong">{title}</p>
                <div className="mt-2 space-y-2">
                  {bucket.length === 0 ? <p className="text-sm text-muted">Keine Einträge.</p> : bucket.map((entry) => (
                    <button
                      type="button"
                      key={entry.id}
                      onClick={() => setSelectedSessionId(entry.id)}
                      className="block w-full rounded-lg border border-white/10 bg-white/[0.02] p-3 text-left text-sm transition hover:border-white/20 hover:bg-white/[0.05]"
                    >
                      <p className="font-semibold text-strong">{entry.title}</p>
                      <p className="text-muted">{new Date(entry.dateISO).toLocaleString("de-DE")} · Übungen: {entry.exerciseCount}</p>
                      <p className="text-strong">Gesamtwert: {entry.totalValue}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

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
          <div className="mt-3 space-y-2">
            {selectedSession.logs.map((log, index) => (
              <article key={`${selectedSession.id}-${log.exerciseId}-${index}`} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm">
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
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
