"use client";

import { useEffect, useMemo, useState } from "react";
import { CompletedWorkoutHistoryEntry, WORKOUT_HISTORY_KEY } from "@/lib/workout";
import {
  detectOverload,
  getLevelFromXp,
  getProgressionState,
  getXpForNextLevel,
  getXpHistory,
  syncProgressionByDate,
} from "@/lib/level-system";
import { getWorkoutSessions } from "@/lib/session-storage";
import { loadExercises, loadWorkouts } from "@/lib/training-storage";

type SkillCard = { name: string; score: number; lastTrained: string | null; daysSince: number | null };
type SportCategory = "Basketball" | "Gym" | "Home";

type DailyStreak = {
  current: number;
  best: number;
};

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
  const sessionHistory = getWorkoutSessions().map((session) => {
    const totalSets = session.logs.filter((log) => log.completedValue !== null).length;
    const totalReps = session.logs.reduce((sum, log) => sum + (log.completedValue ?? 0), 0);
    const workout = workoutLookup.get(session.workoutId);
    const fallbackExercise = session.logs
      .map((log) => exerciseLookup.get(log.exerciseId))
      .find((exercise) => exercise !== undefined);
    const resolvedSport =
      (workout?.category ?? session.workoutCategory ?? fallbackExercise?.category ?? "Basketball") as SportCategory;

    return {
      id: session.id,
      date: session.dateISO.slice(0, 10),
      title: session.workoutName,
      sport: resolvedSport,
      subcategory:
        workout?.subcategory ??
        session.workoutSubcategory ??
        fallbackExercise?.subcategory ??
        (resolvedSport === "Gym" ? "Gym" : "Basketball"),
      totalSets,
      totalReps,
      totalVolumeKg: 0,
    } satisfies CompletedWorkoutHistoryEntry;
  });

  const unique = new Map<string, CompletedWorkoutHistoryEntry>();
  [...sessionHistory, ...baseHistory].forEach((entry) => unique.set(entry.id, entry));
  return Array.from(unique.values());
}

function getDaysSince(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const differenceMs = now.getTime() - date.getTime();
  return Math.max(0, Math.floor(differenceMs / (1000 * 60 * 60 * 24)));
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDayDiff(a: string, b: string) {
  const one = new Date(`${a}T00:00:00`).getTime();
  const two = new Date(`${b}T00:00:00`).getTime();
  return Math.floor((two - one) / (1000 * 60 * 60 * 24));
}

function computeDailyStreak(entries: CompletedWorkoutHistoryEntry[]): DailyStreak {
  const sortedDates = [...new Set(entries.map((entry) => entry.date))].sort((a, b) => (a < b ? -1 : 1));
  if (sortedDates.length === 0) return { current: 0, best: 0 };

  let best = 1;
  let running = 1;
  for (let index = 1; index < sortedDates.length; index += 1) {
    const diff = getDayDiff(sortedDates[index - 1], sortedDates[index]);
    if (diff === 1) {
      running += 1;
      best = Math.max(best, running);
    } else if (diff > 1) {
      running = 1;
    }
  }

  const today = toDateKey(new Date());
  const last = sortedDates[sortedDates.length - 1];
  let current = 1;
  for (let index = sortedDates.length - 1; index > 0; index -= 1) {
    const diff = getDayDiff(sortedDates[index - 1], sortedDates[index]);
    if (diff === 1) current += 1;
    else break;
  }

  const gapToToday = getDayDiff(last, today);
  if (gapToToday > 1) current = 0;

  return { current, best };
}

function buildSkillCards(entries: CompletedWorkoutHistoryEntry[]): SkillCard[] {
  const bySkill = new Map<string, CompletedWorkoutHistoryEntry[]>();
  entries.forEach((entry) => bySkill.set(entry.subcategory, [...(bySkill.get(entry.subcategory) ?? []), entry]));

  return Array.from(bySkill.entries())
    .map(([name, skillEntries]) => {
      const latest = [...skillEntries].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      const daysSince = latest ? getDaysSince(latest.date) : null;
      const baseScore = Math.min(100, skillEntries.length * 12);
      const decayFactor = daysSince !== null && daysSince > 14 ? Math.max(0.5, 1 - (daysSince - 14) * 0.03) : 1;
      return { name, score: Math.round(baseScore * decayFactor), lastTrained: latest?.date ?? null, daysSince };
    })
    .sort((a, b) => a.score - b.score);
}


function buildCategoryBreakdown(entries: CompletedWorkoutHistoryEntry[]) {
  const base: Record<SportCategory, Record<string, number>> = {
    Basketball: {},
    Gym: {},
    Home: {},
  };

  entries.forEach((entry) => {
    const bucket = base[entry.sport] ?? {};
    bucket[entry.subcategory] = (bucket[entry.subcategory] ?? 0) + 1;
    base[entry.sport] = bucket;
  });

  return (Object.entries(base) as Array<[SportCategory, Record<string, number>]>).map(([sport, subcategories]) => ({
    sport,
    items: Object.entries(subcategories)
      .map(([subcategory, count]) => ({
        subcategory,
        count,
        indexScore: Math.min(100, count * 12),
      }))
      .sort((a, b) => b.count - a.count),
  }));
}
export default function LevelPage() {
  const [history, setHistory] = useState<CompletedWorkoutHistoryEntry[]>([]);
  const [totalXp, setTotalXp] = useState(0);
  const [deloadActive, setDeloadActive] = useState(false);
  const [xpHistoryCount, setXpHistoryCount] = useState(0);
  const [overloadRatio, setOverloadRatio] = useState(1);
  const [thisWeekXp, setThisWeekXp] = useState(0);
  const [lastWeekXp, setLastWeekXp] = useState(0);
  const [popupMessage, setPopupMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const combinedHistory = loadCombinedHistory();
      setHistory(combinedHistory);

      const syncResult = syncProgressionByDate(new Date());
      const progression = getProgressionState();
      const xpHistory = getXpHistory();
      const overload = detectOverload(xpHistory);
      setTotalXp(progression.totalXp);
      setDeloadActive(progression.deloadActive);
      setXpHistoryCount(xpHistory.length);
      setOverloadRatio(overload.ratio);
      setThisWeekXp(overload.currentWeekXp);
      setLastWeekXp(overload.previousWeekXp);

      const streak = computeDailyStreak(combinedHistory);
      const streakText =
        streak.current >= 2
          ? `🔥 ${streak.current} Tage in Folge trainiert!`
          : streak.current === 1
            ? "✅ Heute/gestern aktiv – bleib dran!"
            : "🧊 Kein aktiver Streak – starte heute neu.";

      if (syncResult.levelDelta > 0) {
        setPopupMessage(`🎉 Level-Up! Du bist um ${syncResult.levelDelta} Level gestiegen. ${streakText}`);
      } else if (syncResult.levelDelta < 0) {
        setPopupMessage(`⬇️ Level-Down: Du bist um ${Math.abs(syncResult.levelDelta)} Level gefallen. ${streakText}`);
      } else {
        setPopupMessage(`📅 Tages-Update: ${streakText}`);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const skillCards = useMemo(() => buildSkillCards(history), [history]);
  const streakData = useMemo(() => computeDailyStreak(history), [history]);
  const categoryBreakdown = useMemo(() => buildCategoryBreakdown(history), [history]);
  const overallScore = skillCards.length ? Math.round(skillCards.reduce((sum, skill) => sum + skill.score, 0) / skillCards.length) : 0;
  const levelData = useMemo(() => getLevelFromXp(totalXp), [totalXp]);
  const xpUntilNextLevel = Math.max(0, levelData.xpForCurrentLevel - levelData.xpIntoLevel);
  const nextLevelXpRequirement = getXpForNextLevel(levelData.level);

  return (
    <main className="min-h-screen bg-black p-6 pb-24 text-white">
      <h1 className="text-2xl font-bold">Level</h1>
      <p className="mt-2 text-zinc-400">XP, Level-Fortschritt und Belastungssteuerung.</p>

      {popupMessage ? (
        <div className="mt-4 rounded-2xl border border-cyan-500 bg-cyan-950/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-cyan-200">{popupMessage}</p>
            <button type="button" onClick={() => setPopupMessage(null)} className="rounded-md border border-cyan-400 px-2 py-1 text-xs text-cyan-100">
              Schließen
            </button>
          </div>
        </div>
      ) : null}

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-xl font-semibold">Level-System</h2>
        <p className="mt-1 text-sm text-zinc-400">XP aus Exercises + Workout-Qualität, mit täglicher Aktualisierung und Streak.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
            <p className="text-xs text-zinc-500">Aktuelles Level</p>
            <p className="text-3xl font-bold">Lv. {levelData.level}</p>
            <p className="text-sm text-zinc-300">{levelData.xpIntoLevel}/{nextLevelXpRequirement} XP in diesem Level</p>
            <p className="text-xs text-zinc-500">{xpUntilNextLevel} XP bis zum nächsten Level</p>
          </div>
          <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
            <p className="text-xs text-zinc-500">Gesamt-XP</p>
            <p className="text-3xl font-bold">{totalXp}</p>
            <p className="text-sm text-zinc-300">Gewertete Sessions: {xpHistoryCount}</p>
            <p className={`text-xs ${deloadActive ? "text-amber-300" : "text-emerald-300"}`}>{deloadActive ? "Deload aktiv (XP-Multiplikator 0.6)." : "Normale Belastung."}</p>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-orange-500/50 bg-orange-950/30 p-3">
          <p className="text-sm font-semibold text-orange-200">🔥 Streak: {streakData.current} Tage (Best: {streakData.best})</p>
        </div>

        <p className="mt-3 text-sm text-zinc-400">Belastung letzte 7 Tage: <span className="font-semibold text-white">{thisWeekXp} XP</span> | davor: <span className="font-semibold text-white">{lastWeekXp} XP</span> (Ratio: {overloadRatio.toFixed(2)})</p>
        <p className="mt-2 text-2xl font-bold">{overallScore}/100 Skill Score</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {skillCards.length === 0 ? <p className="text-sm text-zinc-500">Noch keine Skill-Daten vorhanden.</p> : skillCards.map((skill) => (
            <div key={skill.name} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
              <p className="font-semibold">{skill.name}</p>
              <p className="text-sm text-zinc-300">Score: {skill.score}/100</p>
              <p className="text-xs text-zinc-500">Letztes Training: {skill.lastTrained ?? "-"} {skill.daysSince !== null ? `(${skill.daysSince} Tage)` : ""}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-lg font-semibold">Kategorie-Indizes (1 globales Level)</h2>
        <p className="mt-1 text-sm text-zinc-400">Die Indizes nutzen Unterkategorien je Sport, ohne separate Level pro Kategorie.</p>
        <div className="mt-3 space-y-3">
          {categoryBreakdown.map((category) => (
            <div key={category.sport} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
              <p className="font-semibold">{category.sport}</p>
              {category.items.length === 0 ? (
                <p className="text-sm text-zinc-500">Noch keine Daten.</p>
              ) : (
                <div className="mt-2 space-y-1 text-sm">
                  {category.items.map((item) => (
                    <p key={`${category.sport}-${item.subcategory}`} className="text-zinc-300">
                      {item.subcategory}: <span className="font-semibold text-white">{item.indexScore}</span> (Sessions: {item.count})
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

    </main>
  );
}