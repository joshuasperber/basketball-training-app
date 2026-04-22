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
import { buildPlayerBadges, computeBadgeStats } from "@/lib/badge-system";

type DailyStreak = { current: number; best: number };

type Category = "Basketball" | "Gym" | "Home" | "Regeneration";

type ExercisePointEntry = {
  date: string;
  category: Category;
  subcategory: string;
  points: number;
};
const ALLOWED_BASKETBALL = ["Handles", "Shooting", "Finishing", "Conditioning"] as const;
const ALLOWED_GYM = ["Oberkörper", "Arme", "Core", "Beine", "Cardio"] as const;
const ALLOWED_HOME = ["Mobility", "Conditioning", "Recovery"] as const;
const ALLOWED_REGEN = ["Meditation", "Mobilität & Dehnung", "Leichte Ausdauer"] as const;

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
    if (raw === "oberkörper" || raw === "push") return "Oberkörper";
    if (raw === "arme" || raw === "pull") return "Arme";
    if (raw === "beine" || raw === "legs" || raw === "beinkraft") return "Beine";
    if (raw === "cardio") return "Cardio";
    if (raw === "core" || raw === "kraftaufbau" || raw === "power") return "Core";
    return null;
  }

  if (category === "Home") {
    if (raw === "mobility") return "Mobility";
    if (raw === "conditioning") return "Conditioning";
    if (raw === "recovery") return "Recovery";
  }

  if (category === "Regeneration") {
    if (raw.includes("meditation")) return "Meditation";
    if (raw.includes("mobil")) return "Mobilität & Dehnung";
    if (raw.includes("ausdauer") || raw.includes("cardio")) return "Leichte Ausdauer";
  }

  return null;
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

function buildCategoryBreakdown(entries: ExercisePointEntry[]) {
  const base: Record<Category, Record<string, number>> = {
    Basketball: Object.fromEntries(ALLOWED_BASKETBALL.map((key) => [key, 0])) as Record<string, number>,
    Gym: Object.fromEntries(ALLOWED_GYM.map((key) => [key, 0])) as Record<string, number>,
    Home: Object.fromEntries(ALLOWED_HOME.map((key) => [key, 0])) as Record<string, number>,
    Regeneration: Object.fromEntries(ALLOWED_REGEN.map((key) => [key, 0])) as Record<string, number>,
  };

  entries.forEach((entry) => {
    base[entry.category][entry.subcategory] = (base[entry.category][entry.subcategory] ?? 0) + entry.points;
  });

  return (["Basketball", "Gym", "Home", "Regeneration"] as const).map((category) => ({
    category,
    items: Object.entries(base[category]).map(([subcategory, points]) => ({ subcategory, points })).sort((a, b) => b.points - a.points),
  }));
}

export default function LevelPage() {
  const [entries, setEntries] = useState<ExercisePointEntry[]>([]);
  const [deloadActive, setDeloadActive] = useState(false);
  const [xpHistoryCount, setXpHistoryCount] = useState(0);
  const [overloadRatio, setOverloadRatio] = useState(1);
  const [thisWeekXp, setThisWeekXp] = useState(0);
  const [lastWeekXp, setLastWeekXp] = useState(0);
  const [popupMessage, setPopupMessage] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<Category | null>(null);
  const [modalCategory, setModalCategory] = useState<Category | null>(null);
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

  const streakData = useMemo(() => computeDailyStreak(entries.map((entry) => entry.date)), [entries]);
  const categoryBreakdown = useMemo(() => buildCategoryBreakdown(entries), [entries]);

  const categoryXpMap = useMemo(() => categoryBreakdown.reduce<Record<Category, number>>((acc, group) => {
    acc[group.category as Category] = group.items.reduce((sum, item) => sum + item.points, 0);
    return acc;
  }, { Basketball: 0, Gym: 0, Home: 0, Regeneration: 0 }), [categoryBreakdown]);

  const weightedGlobalXp = useMemo(() => {
    const basketballWeight = 0.525;
    const gymWeight = 0.3;
    const homeWeight = 0.1;
    const regenWeight = 0.075;
    const homeXp = categoryXpMap.Home;
    const gymXp = categoryXpMap.Gym;
    const homeIsLow = homeXp <= Math.max(5, gymXp * 0.1);
    const gymBoost = homeIsLow ? 0.125 : 0;
    return Math.round(
      categoryXpMap.Basketball * basketballWeight +
      categoryXpMap.Gym * (gymWeight + gymBoost) +
      (homeIsLow ? 0 : categoryXpMap.Home * homeWeight) +
      categoryXpMap.Regeneration * regenWeight,
    );
  }, [categoryXpMap]);

  const weightedLevelData = useMemo(() => getLevelFromXp(weightedGlobalXp), [weightedGlobalXp]);
  const levelProgressPercent = Math.min(100, Math.round((weightedLevelData.xpIntoLevel / Math.max(1, getXpForNextLevel(weightedLevelData.level))) * 100));
  const regenMultiplier = Math.min(1.3, 1 + Math.min(250, categoryXpMap.Regeneration) / 1000);
  const latestDateByCategory = useMemo(() => {
    return entries.reduce<Partial<Record<Category, string>>>((acc, entry) => {
      const prev = acc[entry.category];
      if (!prev || entry.date > prev) acc[entry.category] = entry.date;
      return acc;
    }, {});
  }, [entries]);
  const latestDateBySubcategory = useMemo(() => {
    return entries.reduce<Record<string, string>>((acc, entry) => {
      const key = `${entry.category}:${entry.subcategory}`;
      if (!acc[key] || entry.date > acc[key]) acc[key] = entry.date;
      return acc;
    }, {});
  }, [entries]);

  const getCategoryXpMultiplier = (category: Category) => {
    const latest = latestDateByCategory[category];
    const gap = latest ? Math.max(0, getDayDiff(latest, toDateKey(new Date()))) : 30;
    const recencyScore = Math.max(0.6, 1.25 - gap * 0.05);
    const regenScore = Math.min(1.3, 1 + Math.min(400, categoryXpMap.Regeneration) / 1000);
    return Math.max(0.7, Math.min(1.4, recencyScore * 0.7 + regenScore * 0.3));
  };

  const badges = useMemo(() => {
    const sessions = getWorkoutSessions();
    const stats = computeBadgeStats(sessions, weightedLevelData.level);
    return buildPlayerBadges(stats).unlocked;
  }, [weightedLevelData.level]);


  return (
    <main className="min-h-screen bg-zinc-950 p-6 pb-24 text-white">
      <h1 className="text-2xl font-bold">Level</h1>
      <p className="mt-2 text-zinc-400">Globales Level oben, darunter klare Skill-Level pro Bereich und Unterkategorie.</p>
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
        <p className="mt-1 text-xs text-zinc-400">Globales Level = alle XP aus Workouts zusammen.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
            <p className="text-xs text-zinc-500">Aktuelles Level</p>
            <p className="text-3xl font-bold">Lv. {weightedLevelData.level}</p>
            <p className="text-sm text-zinc-300">{weightedLevelData.xpIntoLevel}/{getXpForNextLevel(weightedLevelData.level)} XP in diesem Level</p>
            <p className="text-xs text-zinc-500">{Math.max(0, getXpForNextLevel(weightedLevelData.level) - weightedLevelData.xpIntoLevel)} XP bis zum nächsten Level</p>
            <p className="text-xs text-cyan-300">XP-Multiplikator (Regeneration): x{regenMultiplier.toFixed(2)}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-indigo-400" style={{ width: `${levelProgressPercent}%` }} />
            </div>
          </div>
          <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
            <p className="text-xs text-zinc-500">Gesamt-XP</p>
            <p className="text-3xl font-bold">{weightedGlobalXp}</p>
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
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {categoryBreakdown.map((group) => {
            const decayedItems = group.items.map((item) => {
              const key = `${group.category}:${item.subcategory}`;
              const last = latestDateBySubcategory[key];
              const gap = last ? Math.max(0, getDayDiff(last, toDateKey(new Date()))) : 30;
              const decayFactor = gap >= 14 ? 0.8 : 1;
              return { ...item, points: Math.round(item.points * decayFactor), gap };
            });
            const totalPoints = decayedItems.reduce((sum, item) => sum + item.points, 0);
            const multiplier = getCategoryXpMultiplier(group.category);
            const effectiveXp = Math.round(totalPoints * multiplier);
            const levelInfo = getLevelFromXp(effectiveXp);
            const nextRequirement = getXpForNextLevel(levelInfo.level);
            const progress = Math.min(100, Math.round((levelInfo.xpIntoLevel / Math.max(1, nextRequirement)) * 100));
            return (
              <div key={`split-${group.category}`} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                <button type="button" onClick={() => { setOpenCategory((cur) => cur === group.category ? null : group.category as Category); setModalCategory(group.category as Category); }} className="font-semibold text-left w-full">{group.category}</button>
                <p className="text-sm text-zinc-300">Level {levelInfo.level} • {levelInfo.xpIntoLevel}/{nextRequirement} XP • x{multiplier.toFixed(2)}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full rounded-full bg-cyan-400" style={{ width: `${progress}%` }} />
                </div>
                {openCategory === group.category ? (<div className="mt-3 space-y-1 text-xs">
                  {(decayedItems.length ? decayedItems : [{ subcategory: "Noch keine Daten", points: 0, gap: 0 }]).map((item) => (
                    <p key={`pair-${group.category}-${item.subcategory}`} className="text-zinc-300">{item.subcategory}: <span className="font-semibold text-white">{item.points}</span> XP</p>
                  ))}
                </div>) : <p className="mt-3 text-xs text-zinc-500">Tippen zum Anzeigen der Unterkategorien.</p>}
              </div>
            );
          })}
        </div>
      </section>
      {modalCategory ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{modalCategory} Details</h3>
              <button type="button" onClick={() => setModalCategory(null)} className="rounded border border-zinc-600 px-2 py-1 text-xs">Schließen</button>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              {(categoryBreakdown.find((group) => group.category === modalCategory)?.items ?? []).map((item) => {
                const level = getLevelFromXp(item.points);
                const nextXp = getXpForNextLevel(level.level);
                return (
                  <div key={`${modalCategory}-${item.subcategory}`} className="rounded-lg border border-zinc-700 bg-zinc-950 p-2">
                    <p className="font-medium">{item.subcategory}</p>
                    <p className="text-zinc-300">Level {level.level} • {level.xpIntoLevel}/{nextXp} XP • {Math.max(0, nextXp - level.xpIntoLevel)} XP bis nächstes Level</p>
                    <p className="text-xs text-cyan-300">Multiplikator: x{getCategoryXpMultiplier(modalCategory).toFixed(2)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      {badges.length > 0 ? (
        <section className="mt-4 rounded-2xl border border-amber-700 bg-amber-950/20 p-4">
          <h3 className="text-lg font-semibold">Badges</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {badges.map((badge) => (
              <div key={`${badge.id}-${badge.name}`} className="rounded-lg border border-amber-600/40 bg-zinc-950 p-2 text-sm">
                <p className="font-semibold text-amber-200">
                  {badge.emoji} {badge.name} • {badge.tier}
                </p>
                <p className="text-zinc-300">{badge.description}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}