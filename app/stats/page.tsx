"use client";

import { useEffect, useMemo, useState } from "react";
import { type Category } from "@/lib/training-data";
import { CompletedWorkoutHistoryEntry, WORKOUT_HISTORY_KEY } from "@/lib/workout";
import { getWorkoutSessions } from "@/lib/session-storage";
import { loadExercises, loadWorkouts } from "@/lib/training-storage";

type CategorySlice = { label: string; value: number; color: string };
type SportCategory = "Basketball" | "Gym" | "Home";
const GYM_SUBCATEGORIES = ["Oberkörper", "Arme", "Core", "Beine", "Cardio", "Komplett"] as const;
const BASKETBALL_SUBCATEGORIES = ["Shooting", "Finishing", "Conditioning", "Handles"] as const;

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
  logs: ReturnType<typeof getWorkoutSessions>[number]["logs"];
};
type StatsRange = "all" | "monthly" | "weekly";

type HistorySportBucket = "Basketball" | "Gym" | "Home";

type HistoryItem = {
  id: string;
  title: string;
  dateISO: string;
  sportBucket: HistorySportBucket;
  exerciseCount: number;
  totalValue: number;
};

const PIE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6"];

function normalizeGymSubcategory(subcategory: string): (typeof GYM_SUBCATEGORIES)[number] | null {
  const s = subcategory.trim().toLowerCase();
  if (s === "oberkörper" || s === "push") return "Oberkörper";
  if (s === "arme" || s === "pull") return "Arme";
  if (s === "beine" || s === "legs" || s === "beinkraft") return "Beine";
  if (s === "cardio") return "Cardio";
  if (s === "komplett") return "Komplett";
  if (s === "core" || s === "kraftaufbau" || s === "power") return "Core";
  return null;
}

function normalizeBasketballSubcategory(subcategory: string): (typeof BASKETBALL_SUBCATEGORIES)[number] | null {
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

  const sessionHistory = getWorkoutSessions().flatMap((session) => {
    const totalSets = session.logs.filter((log) => log.completedValue !== null).length;
    const totalReps = session.logs.reduce((sum, log) => sum + (log.completedValue ?? 0), 0);
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
        sets: current.sets + (log.completedValue !== null ? 1 : 0),
        reps: current.reps + (log.completedValue ?? 0),
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

function buildSlices(entries: CompletedWorkoutHistoryEntry[], by: "sport" | "subcategory") {
  const map = new Map<string, number>();
  entries.forEach((entry) => map.set(by === "sport" ? entry.sport : entry.subcategory, (map.get(by === "sport" ? entry.sport : entry.subcategory) ?? 0) + 1));
  return Array.from(map.entries())
    .map(([label, value], index) => ({ label, value, color: PIE_COLORS[index % PIE_COLORS.length] }))
    .sort((a, b) => b.value - a.value);
}

function buildCategorySubcategorySlices(entries: CompletedWorkoutHistoryEntry[]) {
  const sports: SportCategory[] = ["Basketball", "Gym", "Home"];
  return sports.reduce(
    (acc, sport) => {
      const filtered = entries.filter((entry) => entry.sport === sport);

      if (sport === "Gym") {
        const counts = filtered.reduce<Record<(typeof GYM_SUBCATEGORIES)[number], number>>(
          (c, entry) => {
            const key = normalizeGymSubcategory(entry.subcategory);
            if (key) c[key] += 1;
            return c;
          },
          { Push: 0, Pull: 0, Legs: 0, Core: 0 },
        );
        acc.Gym = GYM_SUBCATEGORIES.filter((k) => counts[k] > 0).map((k, i) => ({ label: k, value: counts[k], color: PIE_COLORS[i % PIE_COLORS.length] }));
        return acc;
      }

      if (sport === "Basketball") {
        const counts = filtered.reduce<Record<(typeof BASKETBALL_SUBCATEGORIES)[number], number>>(
          (c, entry) => {
            const key = normalizeBasketballSubcategory(entry.subcategory);
            if (key) c[key] += 1;
            return c;
          },
          { Shooting: 0, Finishing: 0, Conditioning: 0, Handles: 0 },
        );
        acc.Basketball = BASKETBALL_SUBCATEGORIES.filter((k) => counts[k] > 0).map((k, i) => ({ label: k, value: counts[k], color: PIE_COLORS[i % PIE_COLORS.length] }));
        return acc;
      }

      acc[sport] = buildSlices(filtered, "subcategory");
      return acc;
    },
    {} as Record<SportCategory, CategorySlice[]>,
  );
}

function filterSessionsByRange(sessions: ReturnType<typeof getWorkoutSessions>, range: StatsRange) {
  if (range === "all") return sessions;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (range === "weekly") start.setDate(start.getDate() - 6);
  if (range === "monthly") start.setDate(start.getDate() - 29);
  return sessions.filter((session) => new Date(session.dateISO) >= start);
}

function buildBasketballExerciseStats(range: StatsRange): BasketballExerciseStat[] {
  const sessions = filterSessionsByRange(getWorkoutSessions(), range);
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
  const sessions = filterSessionsByRange(getWorkoutSessions(), range);
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
  const sessions = filterSessionsByRange(getWorkoutSessions(), range);
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

function TrendChart({ points }: { points: number[] }) {
  if (points.length === 0) return null;
  const max = Math.max(...points, 1);
  const width = 240;
  const height = 72;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const linePoints = points
    .map((value, index) => `${index * step},${height - (value / max) * (height - 8) - 4}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full rounded bg-zinc-900">
      <line x1="0" y1={height - 2} x2={width} y2={height - 2} stroke="#52525b" strokeWidth="1" />
      <line x1="2" y1="0" x2="2" y2={height} stroke="#52525b" strokeWidth="1" />
      <polyline fill="none" stroke="#38bdf8" strokeWidth="3" points={linePoints} />
      <text x="8" y="10" fill="#d4d4d8" fontSize="9">Y-Achse: Zeit in Sekunden</text>
      <text x={width - 100} y={height - 6} fill="#d4d4d8" fontSize="9">X-Achse: Session Nummer</text>
    </svg>
  );
}

function PieCard({ title, slices }: { title: string; slices: CategorySlice[] }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 flex items-center gap-4">
        <div className="h-28 w-28 rounded-full border border-zinc-700" style={{ background: pieGradient(slices) }} />
        <ul className="space-y-2 text-sm text-zinc-300">
          {slices.length === 0 ? (
            <li className="text-zinc-500">Noch keine Daten vorhanden.</li>
          ) : (
            slices.map((slice) => (
              <li key={slice.label} className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: slice.color }} />
                <span>{slice.label}: <strong>{slice.value}</strong></span>
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
  const scores: Record<Category, number> = { Basketball: 0, Gym: 0, Home: 0 };
  session.logs.forEach((log) => {
    const ex = exerciseLookup.get(log.exerciseId);
    if (!ex) return;
    const intensity = Math.max(1, (log.completedValue ?? 0) + (log.attempts ?? 0) + (log.weightKg ?? 0) * 0.1);
    scores[ex.category] += intensity;
  });
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
  const [username] = useState(() => {
    if (typeof window === "undefined") return "Champion";
    try {
      const cached = window.localStorage.getItem("profile_cache_v4");
      if (!cached) return "Champion";
      const parsed = JSON.parse(cached) as { profile?: { username?: string | null; full_name?: string | null } };
      return parsed.profile?.username?.trim() || parsed.profile?.full_name?.trim() || "Champion";
    } catch {
      return "Champion";
    }
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHistory(loadCombinedHistory());
      setSessionDetails(getWorkoutSessions().map((session) => ({
        id: session.id,
        dateISO: session.dateISO,
        workoutName: session.workoutName,
        logs: session.logs,
      })));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
  const totalVolume = filteredHistory.filter((entry) => entry.sport === "Gym").reduce((sum, entry) => sum + entry.totalVolumeKg, 0);
  const sportSlices = useMemo(() => buildSlices(filteredHistory, "sport"), [filteredHistory]);
  const subcategoryBySport = useMemo(() => buildCategorySubcategorySlices(filteredHistory), [filteredHistory]);

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
    };
  }, [filteredSessions]);

  const totalMinutesTrained = filteredSessions.reduce((sum, session) => sum + session.logs.length * 4, 0);

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

  return (
    <main className="min-h-screen bg-black p-6 pb-24 text-white">
      <h1 className="text-2xl font-bold">Statistiken</h1>
      <p className="mt-2 text-zinc-400">Langfristige Auswertung deiner abgeschlossenen Workouts</p>
      <p className="mt-1 text-sm text-cyan-300">{username}, deine Daten zeigen klaren Fortschritt – bleib im Rhythmus.</p>
      <div className="mt-4 inline-flex rounded-lg border border-zinc-700 bg-zinc-900 p-1 text-sm">
        {[
          { id: "all", label: "All Time" },
          { id: "monthly", label: "Monthly" },
          { id: "weekly", label: "Weekly" },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setRange(option.id as StatsRange)}
            className={`rounded-md px-3 py-1 ${range === option.id ? "bg-cyan-600 text-white" : "text-zinc-300"}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><p className="text-xs uppercase tracking-wide text-zinc-500">Abgeschlossene Workouts</p><p className="mt-2 text-3xl font-bold">{filteredHistory.length}</p></div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><p className="text-xs uppercase tracking-wide text-zinc-500">Zeitraum</p><p className="mt-2 text-3xl font-bold">{range === "all" ? "All Time" : range === "weekly" ? "7 Tage" : "30 Tage"}</p></div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><p className="text-xs uppercase tracking-wide text-zinc-500">Sätze gesamt</p><p className="mt-2 text-3xl font-bold">{totalSets}</p></div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><p className="text-xs uppercase tracking-wide text-zinc-500">Reps gesamt</p><p className="mt-2 text-3xl font-bold">{totalReps}</p></div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><p className="text-xs uppercase tracking-wide text-zinc-500">Trainierte Minuten</p><p className="mt-2 text-3xl font-bold">{totalMinutesTrained}</p></div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:col-span-2"><p className="text-xs uppercase tracking-wide text-zinc-500">Volumen gesamt (kg)</p><p className="mt-2 text-3xl font-bold">{totalVolume}</p></div>
      </div>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-lg font-semibold">Basketball Wurfquoten (aggregiert)</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          {[
            { label: "FreeThrow Quote", value: basketballShotSummary.freeThrows },
            { label: "2 Pointer Quote", value: basketballShotSummary.twoPointers },
            { label: "3 Pointer Quote", value: basketballShotSummary.threePointers },
          ].map((item) => {
            const pct = item.value.attempts > 0 ? Math.round((item.value.made / item.value.attempts) * 100) : 0;
            return (
              <div key={item.label} className="rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                <p className="text-zinc-400">{item.label}</p>
                <p className="text-xl font-semibold">{pct}%</p>
                <p className="text-xs text-zinc-500">{item.value.made}/{item.value.attempts}</p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="mt-6 space-y-4">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-xl font-semibold">Kategorien Vergleich</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {(["Basketball", "Gym", "Home"] as const).map((sport) => {
              const value = sportSlices.find((slice) => slice.label === sport)?.value ?? 0;
              return (
                <div key={`compare-${sport}`} className="rounded-xl border border-zinc-700 bg-zinc-950 p-4 text-center">
                  <p className="text-sm text-zinc-400">{sport}</p>
                  <p className="mt-1 text-3xl font-bold">{value}</p>
                  <p className="text-xs text-zinc-500">Workouts im Zeitraum</p>
                </div>
              );
            })}
          </div>
        </section>
        <div className="grid gap-4 lg:grid-cols-3">
        <PieCard title="Basketball Unterkategorien" slices={subcategoryBySport.Basketball ?? []} />
        <PieCard title="Gym Unterkategorien" slices={subcategoryBySport.Gym ?? []} />
        <PieCard title="Home Unterkategorien" slices={subcategoryBySport.Home ?? []} />
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <button type="button" onClick={() => toggleSection("basketballQuotes")} className="w-full text-left text-lg font-semibold">Basketball-Quoten je Übung</button>
        {openSections.basketballQuotes ? (
          basketballStats.length === 0 ? <p className="mt-3 text-sm text-zinc-500">Noch keine Basketball-Übungsdaten vorhanden.</p> : (
            <div className="mt-3 space-y-2">
              {basketballStats.map((entry) => (
                <div key={entry.exerciseId} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                  <p className="font-medium">{entry.exerciseName}</p>
                  <p className="mt-1 text-sm text-zinc-300">Quote: <strong>{entry.quote ?? 0}%</strong> • Makes: {entry.made} • Tries: {entry.attempts} • Misses: {entry.misses}</p>
                </div>
              ))}
            </div>
          )
        ) : null}
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <button type="button" onClick={() => toggleSection("timeExercises")} className="w-full text-left text-lg font-semibold">Zeitbasierte Basketball-Übungen</button>
        {openSections.timeExercises ? (
          timedTrends.length === 0 ? <p className="mt-3 text-sm text-zinc-500">Noch keine zeitbasierten Verläufe vorhanden.</p> : (
            <div className="mt-3 space-y-3">
              {timedTrends.map((trend) => (
                <div key={trend.exerciseId} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                  <p className="text-sm font-semibold">{trend.exerciseName} <span className="text-zinc-400">({trend.subcategory})</span></p>
                  <p className="mt-1 text-xs text-zinc-400">
                    Letzt: {trend.points[trend.points.length - 1]} s • Best: {Math.max(...trend.points)} s • Ø: {Math.round(trend.points.reduce((sum, point) => sum + point, 0) / trend.points.length)} s
                  </p>
                  <div className="mt-2"><TrendChart points={trend.points} /></div>
                </div>
              ))}
            </div>
          )
        ) : null}
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <button type="button" onClick={() => toggleSection("gymGoals")} className="w-full text-left text-lg font-semibold">Gym Ziele je Exercise</button>
        {openSections.gymGoals ? (
          gymGoals.length === 0 ? <p className="mt-3 text-sm text-zinc-500">Noch keine Gym-Daten vorhanden.</p> : (
            <div className="mt-3 space-y-2">
              {gymGoals.map((entry) => (
                <div key={entry.exerciseId} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm">
                  <p className="font-medium">{entry.exerciseName}</p>
                  <p className="text-zinc-300">Ø Gewicht {entry.avgWeightKg} kg • Ø Reps {entry.avgReps} • Max {entry.maxWeightKg} kg × {entry.maxRepsAtMaxWeight}</p>
                  <p className="text-emerald-300">Nächstes Ziel: {entry.suggestedWeightKg} kg × {entry.suggestedReps} Reps</p>
                  <p className="mt-1 text-xs text-zinc-400">{entry.progressionHint}</p>
                </div>
              ))}
            </div>
          )
        ) : null}
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <button type="button" onClick={() => toggleSection("history")} className="w-full text-left text-xl font-semibold">Historie</button>
        {openSections.history ? (
          <div className="mt-4 space-y-3">
            {([
              ["Basketball-Historie", historyBuckets.Basketball],
              ["Gym-Historie", historyBuckets.Gym],
              ["Home-workout-Historie", historyBuckets.Home],
            ] as const).map(([title, bucket]) => (
              <div key={title} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                <p className="font-semibold">{title}</p>
                <div className="mt-2 space-y-2">
                  {bucket.length === 0 ? <p className="text-sm text-zinc-500">Keine Einträge.</p> : bucket.map((entry) => (
                    <button
                      type="button"
                      key={entry.id}
                      onClick={() => setSelectedSessionId(entry.id)}
                      className="block w-full rounded-lg border border-zinc-700 bg-black/30 p-3 text-left text-sm"
                    >
                      <p className="font-semibold">{entry.title}</p>
                      <p className="text-zinc-400">{new Date(entry.dateISO).toLocaleString("de-DE")} • Übungen: {entry.exerciseCount}</p>
                      <p className="text-zinc-300">Gesamtwert: {entry.totalValue}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {selectedSession ? (
        <section className="mt-6 rounded-2xl border border-cyan-800 bg-cyan-950/20 p-4">
          <h2 className="text-lg font-semibold">Workout-Details: {selectedSession.workoutName}</h2>
          <p className="mt-1 text-xs text-cyan-200">{new Date(selectedSession.dateISO).toLocaleString("de-DE")}</p>
          <div className="mt-3 space-y-2">
            {selectedSession.logs.map((log, index) => (
              <article key={`${selectedSession.id}-${log.exerciseId}-${index}`} className="rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm">
                <p className="font-medium">{exerciseLookup.get(log.exerciseId) ?? log.exerciseId}</p>
                <p className="text-zinc-300">
                  Reps/Wert: {log.completedValue ?? "-"} • Gewicht: {log.weightKg ?? "-"} kg • Tries: {log.attempts ?? "-"} • Makes: {log.made ?? "-"} • Misses: {log.misses ?? "-"}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}