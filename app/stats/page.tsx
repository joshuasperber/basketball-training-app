"use client";

import { useEffect, useMemo, useState } from "react";
import { CompletedWorkoutHistoryEntry, WORKOUT_HISTORY_KEY } from "@/lib/workout";
import { getWorkoutSessions } from "@/lib/session-storage";
import { loadExercises, loadWorkouts } from "@/lib/training-storage";
import { detectOverload, getLevelFromXp, getProgressionState, getXpHistory, getXpForNextLevel } from "@/lib/level-system";

type CategorySlice = {
  label: string;
  value: number;
  color: string;
};

type SportCategory = "Basketball" | "Gym" | "Home";

type SkillCard = {
  name: string;
  score: number;
  lastTrained: string | null;
  daysSince: number | null;
};

const PIE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6"];

function loadHistory(): CompletedWorkoutHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(WORKOUT_HISTORY_KEY);

  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as CompletedWorkoutHistoryEntry[];
  } catch {
    return [];
  }
}

function loadCombinedHistory(): CompletedWorkoutHistoryEntry[] {
  const baseHistory = loadHistory();

  if (typeof window === "undefined") {
    return baseHistory;
  }

  const exercises = loadExercises();
  const workouts = loadWorkouts();
  const workoutLookup = new Map(workouts.map((workout) => [workout.id, workout]));
  const exerciseLookup = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const sessionHistory = getWorkoutSessions().map((session) => {
    const totalSets = session.logs.filter((log) => log.completedValue !== null).length;
    const totalReps = session.logs.reduce((sum, log) => sum + (log.completedValue ?? 0), 0);
    const workout = workoutLookup.get(session.workoutId);
    const fallbackExercise = session.logs
      .map((log) => exerciseLookup.get(log.exerciseId))
      .find((exercise) => exercise !== undefined);
    const resolvedSport =
      (workout?.category ?? session.workoutCategory ?? fallbackExercise?.category ?? "Basketball") as SportCategory;
    const loggedSubcategories = Array.from(
      new Set(
        session.logs
          .map((log) => exerciseLookup.get(log.exerciseId)?.subcategory)
          .filter((subcategory): subcategory is string => Boolean(subcategory)),
      ),
    );
    const resolvedSubcategory =
      loggedSubcategories.length > 1
        ? "Komplett"
        : loggedSubcategories[0] ??
          workout?.subcategory ??
          session.workoutSubcategory ??
          fallbackExercise?.subcategory ??
          (resolvedSport === "Gym" ? "Gym" : "Basketball");

    return {
      id: session.id,
      date: session.dateISO.slice(0, 10),
      title: session.workoutName,
      sport: resolvedSport,
      subcategory: resolvedSubcategory,
      totalSets,
      totalReps,
      totalVolumeKg: 0,
    } satisfies CompletedWorkoutHistoryEntry;
  });

  const unique = new Map<string, CompletedWorkoutHistoryEntry>();
  [...sessionHistory, ...baseHistory].forEach((entry) => {
    unique.set(entry.id, entry);
  });

  return Array.from(unique.values());
}

function getDaysSince(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const differenceMs = now.getTime() - date.getTime();
  return Math.max(0, Math.floor(differenceMs / (1000 * 60 * 60 * 24)));
}

function buildSkillCards(entries: CompletedWorkoutHistoryEntry[]): SkillCard[] {
  const bySkill = new Map<string, CompletedWorkoutHistoryEntry[]>();

  entries.forEach((entry) => {
    const current = bySkill.get(entry.subcategory) ?? [];
    bySkill.set(entry.subcategory, [...current, entry]);
  });

  return Array.from(bySkill.entries())
    .map(([name, skillEntries]) => {
      const latest = [...skillEntries].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      const daysSince = latest ? getDaysSince(latest.date) : null;
      const baseScore = Math.min(100, skillEntries.length * 12);
      const decayFactor =
        daysSince !== null && daysSince > 14 ? Math.max(0.5, 1 - (daysSince - 14) * 0.03) : 1;

      return {
        name,
        score: Math.round(baseScore * decayFactor),
        lastTrained: latest?.date ?? null,
        daysSince,
      };
    })
    .sort((a, b) => a.score - b.score);
}

function pieGradient(slices: CategorySlice[]) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (total <= 0) {
    return "conic-gradient(#27272a 0deg 360deg)";
  }

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

function buildSlices(entries: CompletedWorkoutHistoryEntry[], by: "sport" | "subcategory") {
  const map = new Map<string, number>();

  entries.forEach((entry) => {
    const key = by === "sport" ? entry.sport : entry.subcategory;
    map.set(key, (map.get(key) ?? 0) + 1);
  });

  return Array.from(map.entries())
    .map(([label, value], index) => ({
      label,
      value,
      color: PIE_COLORS[index % PIE_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value);
}

function buildCategorySubcategorySlices(entries: CompletedWorkoutHistoryEntry[]) {
  const sports: SportCategory[] = ["Basketball", "Gym", "Home"];
  return sports.reduce(
    (accumulator, sport) => {
      const filtered = entries.filter((entry) => entry.sport === sport);
      accumulator[sport] = buildSlices(filtered, "subcategory");
      return accumulator;
    },
    {} as Record<SportCategory, CategorySlice[]>,
  );
}

function PieCard({ title, slices }: { title: string; slices: CategorySlice[] }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 flex items-center gap-4">
        <div
          className="h-28 w-28 rounded-full border border-zinc-700"
          style={{ background: pieGradient(slices) }}
        />

        <ul className="space-y-2 text-sm text-zinc-300">
          {slices.length === 0 ? (
            <li className="text-zinc-500">Noch keine Daten vorhanden.</li>
          ) : (
            slices.map((slice) => (
              <li key={slice.label} className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: slice.color }} />
                <span>
                  {slice.label}: <strong>{slice.value}</strong>
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}

export default function StatsPage() {
  const [history, setHistory] = useState<CompletedWorkoutHistoryEntry[]>([]);
  const [totalXp, setTotalXp] = useState(0);
  const [deloadActive, setDeloadActive] = useState(false);
  const [xpHistoryCount, setXpHistoryCount] = useState(0);
  const [overloadRatio, setOverloadRatio] = useState(1);
  const [thisWeekXp, setThisWeekXp] = useState(0);
  const [lastWeekXp, setLastWeekXp] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHistory(loadCombinedHistory());
      const progression = getProgressionState();
      const xpHistory = getXpHistory();
      const overload = detectOverload(xpHistory);
      setTotalXp(progression.totalXp);
      setDeloadActive(progression.deloadActive);
      setXpHistoryCount(xpHistory.length);
      setOverloadRatio(overload.ratio);
      setThisWeekXp(overload.currentWeekXp);
      setLastWeekXp(overload.previousWeekXp);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const weeklyCompleted = useMemo(() => {
    const today = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(today.getDate() - 6);

    return history.filter((entry) => {
      const date = new Date(entry.date);
      return date >= weekAgo && date <= today;
    }).length;
  }, [history]);

  const totalSets = history.reduce((sum, entry) => sum + entry.totalSets, 0);
  const totalReps = history.reduce((sum, entry) => sum + entry.totalReps, 0);
  const totalVolume = history.reduce((sum, entry) => sum + entry.totalVolumeKg, 0);

  const sportSlices = useMemo(() => buildSlices(history, "sport"), [history]);
  const subcategoryBySport = useMemo(() => buildCategorySubcategorySlices(history), [history]);
  const skillCards = useMemo(() => buildSkillCards(history), [history]);
  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [history],
  );
  const overallScore = skillCards.length
    ? Math.round(skillCards.reduce((sum, skill) => sum + skill.score, 0) / skillCards.length)
    : 0;
  const levelData = useMemo(() => getLevelFromXp(totalXp), [totalXp]);
  const xpUntilNextLevel = Math.max(0, levelData.xpForCurrentLevel - levelData.xpIntoLevel);
  const nextLevelXpRequirement = getXpForNextLevel(levelData.level);

  return (
    <main className="min-h-screen bg-black p-6 pb-24 text-white">
      <h1 className="text-2xl font-bold">Statistiken</h1>
      <p className="mt-2 text-zinc-400">Langfristige Auswertung deiner abgeschlossenen Workouts</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Abgeschlossene Workouts</p>
          <p className="mt-2 text-3xl font-bold">{history.length}</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Weekly (7 Tage)</p>
          <p className="mt-2 text-3xl font-bold">{weeklyCompleted}</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Sätze gesamt</p>
          <p className="mt-2 text-3xl font-bold">{totalSets}</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Reps gesamt</p>
          <p className="mt-2 text-3xl font-bold">{totalReps}</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:col-span-2">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Volumen gesamt (kg)</p>
          <p className="mt-2 text-3xl font-bold">{totalVolume}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <PieCard title="Kategorien Vergleich (Basketball / Gym / Home)" slices={sportSlices} />
        <PieCard title="Basketball Unterkategorien" slices={subcategoryBySport.Basketball} />
        <PieCard title="Gym Unterkategorien" slices={subcategoryBySport.Gym} />
        <PieCard title="Home Unterkategorien" slices={subcategoryBySport.Home} />
      </div>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-xl font-semibold">Level-System</h2>
        <p className="mt-1 text-sm text-zinc-400">
          XP aus Exercises + Workout-Qualität, exponentielle Level-Curve und Deload-Logik bei Überlastung.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
            <p className="text-xs text-zinc-500">Aktuelles Level</p>
            <p className="text-3xl font-bold">Lv. {levelData.level}</p>
            <p className="text-sm text-zinc-300">
              {levelData.xpIntoLevel}/{nextLevelXpRequirement} XP in diesem Level
            </p>
            <p className="text-xs text-zinc-500">{xpUntilNextLevel} XP bis zum nächsten Level</p>
          </div>
          <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
            <p className="text-xs text-zinc-500">Gesamt-XP</p>
            <p className="text-3xl font-bold">{totalXp}</p>
            <p className="text-sm text-zinc-300">Gewertete Sessions: {xpHistoryCount}</p>
            <p className={`text-xs ${deloadActive ? "text-amber-300" : "text-emerald-300"}`}>
              {deloadActive ? "Deload aktiv (XP-Multiplikator 0.6)." : "Normale Belastung."}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-zinc-400">
          Belastung letzte 7 Tage: <span className="font-semibold text-white">{thisWeekXp} XP</span> | davor:{" "}
          <span className="font-semibold text-white">{lastWeekXp} XP</span> (Ratio: {overloadRatio.toFixed(2)})
        </p>
        <p className="mt-2 text-2xl font-bold">{overallScore}/100 Skill Score</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {skillCards.length === 0 ? (
            <p className="text-sm text-zinc-500">Noch keine Skill-Daten vorhanden.</p>
          ) : (
            skillCards.map((skill) => (
              <div key={skill.name} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                <p className="font-semibold">{skill.name}</p>
                <p className="text-sm text-zinc-300">Score: {skill.score}/100</p>
                <p className="text-xs text-zinc-500">
                  Letztes Training: {skill.lastTrained ?? "-"}{" "}
                  {skill.daysSince !== null ? `(${skill.daysSince} Tage)` : ""}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-xl font-semibold">Historie abgeschlossener Trainings</h2>
        <div className="mt-4 space-y-2">
          {sortedHistory.length === 0 ? (
            <p className="text-sm text-zinc-500">Noch keine Trainingshistorie vorhanden.</p>
          ) : (
            sortedHistory.map((entry) => (
              <article key={entry.id} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm">
                <p className="font-semibold">{entry.title}</p>
                <p className="text-zinc-400">
                  {entry.date} • {entry.sport} • {entry.subcategory}
                </p>
                <p className="text-zinc-300">
                  Sätze: {entry.totalSets} • Reps: {entry.totalReps} • Volumen: {entry.totalVolumeKg} kg
                </p>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}