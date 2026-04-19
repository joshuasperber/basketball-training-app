"use client";

import { useEffect, useMemo, useState } from "react";
import {
  detectOverload,
  getLevelFromXp,
  getProgressionState,
  getXpForNextLevel,
  getXpHistory,
  syncProgressionByDate,
} from "@/lib/level-system";
import { getWorkoutSessions } from "@/lib/session-storage";
import { loadExercises } from "@/lib/training-storage";
import { type Category } from "@/lib/training-data";

type SkillCard = {
  name: string;
  score: number;
  level: number;
  xpIntoLevel: number;
  xpForCurrentLevel: number;
  lastTrained: string | null;
  daysSince: number | null;
  points: number;
};
type DailyStreak = { current: number; best: number };

type ExercisePointEntry = {
  date: string;
  category: Category;
  subcategory: string;
  points: number;
};

const ALLOWED_BASKETBALL = ["Handles", "Shooting", "Finishing", "Conditioning"] as const;
const ALLOWED_GYM = ["Push", "Pull", "Legs", "Core"] as const;

function normalizeSubcategory(category: Category, subcategory: string | null | undefined): string | null {
  const raw = (subcategory ?? "").trim().toLowerCase();
  if (!raw) return null;

  if (category === "Basketball") {
    if (raw === "handles" || raw === "handling") return "Handles";
    if (raw === "shooting") return "Shooting";
    if (raw === "finishing") return "Finishing";
    if (raw === "defense" || raw === "conditioning") return "Conditioning";
    return null;
  }

  if (category === "Gym") {
    if (raw === "push") return "Push";
    if (raw === "pull") return "Pull";
    if (raw === "legs" || raw === "beinkraft") return "Legs";
    if (raw === "core" || raw === "kraftaufbau" || raw === "power") return "Core";
    return null;
  }

  return null;
}

function getDaysSince(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)));
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

function computeDailyStreak(dates: string[]): DailyStreak {
  const sortedDates = [...new Set(dates)].sort((a, b) => (a < b ? -1 : 1));
  if (sortedDates.length === 0) return { current: 0, best: 0 };

  let best = 1;
  let running = 1;
  for (let i = 1; i < sortedDates.length; i += 1) {
    const diff = getDayDiff(sortedDates[i - 1], sortedDates[i]);
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
  for (let i = sortedDates.length - 1; i > 0; i -= 1) {
    const diff = getDayDiff(sortedDates[i - 1], sortedDates[i]);
    if (diff === 1) current += 1;
    else break;
  }
  if (getDayDiff(last, today) > 1) current = 0;

  return { current, best };
}

function buildExercisePointEntries(): ExercisePointEntry[] {
  const sessions = getWorkoutSessions();
  const exercises = loadExercises();
  const exerciseLookup = new Map(exercises.map((exercise) => [exercise.id, exercise]));

  const sortedSessions = [...sessions].sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1));
  const lastBySubcategory = new Map<string, string>();

  return sortedSessions.flatMap((session) => {
    const date = session.dateISO.slice(0, 10);

    return session.logs.flatMap((log) => {
      const exercise = exerciseLookup.get(log.exerciseId);
      if (!exercise) return [];

      const normalizedSubcategory = normalizeSubcategory(exercise.category, exercise.subcategory);
      if (!normalizedSubcategory) return [];

      const completedValue = log.completedValue ?? 0;
      const made = log.made ?? 0;
      const attempts = log.attempts ?? 0;
      const weight = log.weightKg ?? 0;

      const rawPoints = Math.max(0, completedValue) + Math.max(0, made) + Math.max(0, attempts * 0.2) + Math.max(0, weight * 0.05);
      const lastDate = lastBySubcategory.get(normalizedSubcategory);
      const gapDays = lastDate ? getDayDiff(lastDate, date) : 0;
      const consistencyMultiplier =
        !lastDate ? 1 : gapDays <= 2 ? 1.25 : gapDays <= 5 ? 1.1 : gapDays > 20 ? 0.6 : gapDays > 10 ? 0.75 : 1;
      const points = Math.max(1, Math.round(rawPoints * consistencyMultiplier));
      lastBySubcategory.set(normalizedSubcategory, date);

      return [{
        date,
        category: exercise.category,
        subcategory: normalizedSubcategory,
        points,
      } satisfies ExercisePointEntry];
    });
  });
}

function buildSkillCards(entries: ExercisePointEntry[]): SkillCard[] {
  const grouped = new Map<string, ExercisePointEntry[]>();
  entries.forEach((entry) => grouped.set(entry.subcategory, [...(grouped.get(entry.subcategory) ?? []), entry]));

  return Array.from(grouped.entries())
    .map(([name, subEntries]) => {
      const latest = [...subEntries].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      const daysSince = latest ? getDaysSince(latest.date) : null;
      const totalPoints = subEntries.reduce((sum, item) => sum + item.points, 0);
      const decayFactor = daysSince !== null && daysSince > 14 ? Math.max(0.6, 1 - (daysSince - 14) * 0.02) : 1;
      const score = Math.max(0, Math.round(totalPoints * decayFactor));
      const levelData = getLevelFromXp(score);
      return {
        name,
        score,
        level: levelData.level,
        xpIntoLevel: levelData.xpIntoLevel,
        xpForCurrentLevel: levelData.xpForCurrentLevel,
        lastTrained: latest?.date ?? null,
        daysSince,
        points: totalPoints,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function buildCategoryBreakdown(entries: ExercisePointEntry[]) {
  const base: Record<Category, Record<string, number>> = {
    Basketball: Object.fromEntries(ALLOWED_BASKETBALL.map((key) => [key, 0])) as Record<string, number>,
    Gym: Object.fromEntries(ALLOWED_GYM.map((key) => [key, 0])) as Record<string, number>,
    Home: {},
  };

  entries.forEach((entry) => {
    base[entry.category][entry.subcategory] = (base[entry.category][entry.subcategory] ?? 0) + entry.points;
  });

  return (["Basketball", "Gym", "Home"] as const).map((category) => ({
    category,
    items: Object.entries(base[category]).map(([subcategory, points]) => ({ subcategory, points })).sort((a, b) => b.points - a.points),
  }));
}

export default function LevelPage() {
  const [entries, setEntries] = useState<ExercisePointEntry[]>([]);
  const [totalXp, setTotalXp] = useState(0);
  const [deloadActive, setDeloadActive] = useState(false);
  const [xpHistoryCount, setXpHistoryCount] = useState(0);
  const [overloadRatio, setOverloadRatio] = useState(1);
  const [thisWeekXp, setThisWeekXp] = useState(0);
  const [lastWeekXp, setLastWeekXp] = useState(0);
  const [popupMessage, setPopupMessage] = useState<string | null>(null);
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
      const pointEntries = buildExercisePointEntries();
      setEntries(pointEntries);

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

      const streak = computeDailyStreak(pointEntries.map((entry) => entry.date));
      const streakText =
        streak.current >= 2
          ? `🔥 ${streak.current} Tage in Folge trainiert!`
          : streak.current === 1
            ? "✅ Heute/gestern aktiv – bleib dran!"
            : "🧊 Kein aktiver Streak – starte heute neu.";

      if (syncResult.levelDelta > 0) setPopupMessage(`🎉 Level-Up! +${syncResult.levelDelta} Level. ${streakText}`);
      else if (syncResult.levelDelta < 0) setPopupMessage(`⬇️ Level-Down: ${Math.abs(syncResult.levelDelta)} Level verloren. ${streakText}`);
      else setPopupMessage(`📅 Tages-Update: ${streakText}`);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const skillCards = useMemo(() => buildSkillCards(entries), [entries]);
  const streakData = useMemo(() => computeDailyStreak(entries.map((entry) => entry.date)), [entries]);
  const categoryBreakdown = useMemo(() => buildCategoryBreakdown(entries), [entries]);
  const overallScore = skillCards.length ? Math.round(skillCards.reduce((sum, skill) => sum + skill.score, 0) / skillCards.length) : 0;
  const categorySkillScores = useMemo(() => {
    const subcategoryToCategory = new Map(entries.map((entry) => [entry.subcategory, entry.category]));
    const grouped = skillCards.reduce<Record<string, number[]>>((acc, skill) => {
      const category = subcategoryToCategory.get(skill.name);
      if (!category) return acc;
      const list = acc[category] ?? [];
      list.push(skill.score);
      acc[category] = list;
      return acc;
    }, {});
    return {
      Basketball: grouped.Basketball?.length ? Math.round(grouped.Basketball.reduce((a, b) => a + b, 0) / grouped.Basketball.length) : 0,
      Gym: grouped.Gym?.length ? Math.round(grouped.Gym.reduce((a, b) => a + b, 0) / grouped.Gym.length) : 0,
      Home: grouped.Home?.length ? Math.round(grouped.Home.reduce((a, b) => a + b, 0) / grouped.Home.length) : 0,
    };
  }, [entries, skillCards]);
  const categoryRatios = useMemo(() => {
    const now = new Date();
    const startCurrent = new Date(now);
    startCurrent.setDate(startCurrent.getDate() - 6);
    const startPrev = new Date(now);
    startPrev.setDate(startPrev.getDate() - 13);
    const endPrev = new Date(now);
    endPrev.setDate(endPrev.getDate() - 7);
    const toScore = (entry: ExercisePointEntry) => entry.points;
    const buildFor = (category: Category) => {
      const current = entries
        .filter((entry) => entry.category === category)
        .filter((entry) => new Date(`${entry.date}T00:00:00`) >= startCurrent)
        .reduce((sum, entry) => sum + toScore(entry), 0);
      const previous = entries
        .filter((entry) => entry.category === category)
        .filter((entry) => {
          const d = new Date(`${entry.date}T00:00:00`);
          return d >= startPrev && d <= endPrev;
        })
        .reduce((sum, entry) => sum + toScore(entry), 0);
      return { current, previous, ratio: previous > 0 ? current / previous : current > 0 ? 1 : 0 };
    };
    return {
      Basketball: buildFor("Basketball"),
      Gym: buildFor("Gym"),
      Home: buildFor("Home"),
    };
  }, [entries]);
  const levelData = useMemo(() => getLevelFromXp(totalXp), [totalXp]);
  const xpUntilNextLevel = Math.max(0, levelData.xpForCurrentLevel - levelData.xpIntoLevel);
  const nextLevelXpRequirement = getXpForNextLevel(levelData.level);
  const levelProgressPercent = Math.min(100, Math.round((levelData.xpIntoLevel / Math.max(1, nextLevelXpRequirement)) * 100));
  const skillScoreLevel = Math.floor(Math.max(0, overallScore) / 100) + 1;
  const skillScorePoints = Math.max(0, overallScore) % 100;

  return (
    <main className="min-h-screen bg-zinc-950 p-6 pb-24 text-white">
      <h1 className="text-2xl font-bold">Level</h1>
      <p className="mt-2 text-zinc-400">Ein globales Level mit klaren Karten, Progress-Bars und Wochen-Belastung.</p>
      <p className="mt-1 text-sm text-cyan-300">Weiter so, {username} – jede Session zählt.</p>

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

      <section className="mt-6 rounded-2xl border border-indigo-700/50 bg-gradient-to-br from-zinc-900 via-zinc-900 to-indigo-950/40 p-4">
        <h2 className="text-xl font-semibold">Globales Level</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Globales Level = alle XP aus Workouts zusammen. Skill Score Level = Durchschnitt deiner Unterkategorien (Handles, Shooting, usw.).
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
            <p className="text-xs text-zinc-500">Aktuelles Level</p>
            <p className="text-3xl font-bold">Lv. {levelData.level}</p>
            <p className="text-sm text-zinc-300">{levelData.xpIntoLevel}/{nextLevelXpRequirement} XP in diesem Level</p>
            <p className="text-xs text-zinc-500">{xpUntilNextLevel} XP bis zum nächsten Level</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-indigo-400" style={{ width: `${levelProgressPercent}%` }} />
            </div>
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

        <div className="mt-3 rounded-xl border border-orange-500/50 bg-orange-950/30 p-3">
          <p className="text-sm font-semibold text-orange-200">🔥 Streak: {streakData.current} Tage (Best: {streakData.best})</p>
        </div>

        <p className="mt-3 text-sm text-zinc-400">Belastung letzte 7 Tage: <span className="font-semibold text-white">{thisWeekXp} XP</span> | davor: <span className="font-semibold text-white">{lastWeekXp} XP</span> (Ratio: {overloadRatio.toFixed(2)})</p>
        <p className="mt-2 text-2xl font-bold">Skill Score Level {skillScoreLevel}: {skillScorePoints}/100</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {(["Basketball", "Gym", "Home"] as const).map((cat) => (
            <div key={cat} className="rounded-lg border border-zinc-700 bg-zinc-950 p-3">
              <p className="text-xs text-zinc-500">{cat} Skill Score</p>
              <p className="text-xl font-bold">{categorySkillScores[cat]}</p>
              <p className="text-xs text-zinc-400">
                Ratio: {categoryRatios[cat].ratio.toFixed(2)} ({categoryRatios[cat].current}/{categoryRatios[cat].previous || 0})
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-lg font-semibold">Skill Points (nur Unterkategorien)</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {skillCards.length === 0 ? (
            <p className="text-sm text-zinc-500">Noch keine Skill-Daten vorhanden.</p>
          ) : (
            skillCards.map((skill) => (
              <div key={skill.name} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                <p className="font-semibold">{skill.name}</p>
                <p className="text-sm text-zinc-300">Skill Level: Lv. {skill.level} ({skill.xpIntoLevel}/{skill.xpForCurrentLevel} XP)</p>
                <p className="text-xs text-zinc-400">Skill Score: {skill.score}</p>
                <p className="text-xs text-zinc-400">Exercise Points: {skill.points}</p>
                <p className="text-xs text-zinc-500">Letztes Training: {skill.lastTrained ?? "-"} {skill.daysSince !== null ? `(${skill.daysSince} Tage)` : ""}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, Math.round((skill.xpIntoLevel / Math.max(1, skill.xpForCurrentLevel)) * 100))}%` }} />
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-lg font-semibold">Kategorie-Indizes (Unterkategorien)</h2>
        <p className="mt-1 text-sm text-zinc-400">Keine Werte wie „Beinkraft“, „Basketball“ oder „Komplett“ – nur Handles/Shooting/Finishing/Conditioning und Push/Pull/Legs/Core.</p>
        <div className="mt-3 space-y-3">
          {categoryBreakdown.map((group) => (
            <div key={group.category} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
              <p className="font-semibold">{group.category}</p>
              <div className="mt-2 space-y-1 text-sm">
                {group.items.map((item) => (
                  <p key={`${group.category}-${item.subcategory}`} className="text-zinc-300">
                    {item.subcategory}: <span className="font-semibold text-white">{item.points}</span> Punkte
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-lg font-semibold">Skill-Points Abgrenzung nach Bereich</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {categoryBreakdown.map((group) => (
            <div key={`split-${group.category}`} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
              <p className="font-semibold">{group.category}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                {(group.items.length ? group.items : [{ subcategory: "Noch keine Daten", points: 0 }]).map((item) => (
                  <div key={`pair-${group.category}-${item.subcategory}`} className="rounded border border-zinc-800 bg-black/20 p-2">
                    <p className="text-zinc-400">{item.subcategory}</p>
                    <p className="text-sm font-semibold text-white">{item.points} SP</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}