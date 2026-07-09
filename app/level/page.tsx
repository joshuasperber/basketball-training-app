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
import TopSubTabs from "@/components/TopSubTabs";
import GradientFadeList from "@/components/GradientFadeList";
import { loadGameStats } from "@/lib/game-stats";

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
  const [globalXp, setGlobalXp] = useState(0);
  const [deloadActive, setDeloadActive] = useState(false);
  const [xpHistoryCount, setXpHistoryCount] = useState(0);
  const [overloadRatio, setOverloadRatio] = useState(1);
  const [thisWeekXp, setThisWeekXp] = useState(0);
  const [lastWeekXp, setLastWeekXp] = useState(0);
  const [popupMessage, setPopupMessage] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<Category | null>(null);
  const [modalCategory, setModalCategory] = useState<Category | null>(null);
  const [username] = useState(() => {
    if (typeof window === "undefined") return "Spieler";
    try {
      const cached = window.localStorage.getItem("profile_cache_v4");
      if (!cached) return "Spieler";
      const parsed = JSON.parse(cached) as { profile?: { username?: string | null; full_name?: string | null } };
      return parsed.profile?.username?.trim() || parsed.profile?.full_name?.trim() || "Spieler";
    } catch {
      return "Spieler";
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
      setGlobalXp(progression.totalXp);
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
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const streakData = useMemo(() => computeDailyStreak(entries.map((entry) => entry.date)), [entries]);
  const categoryBreakdown = useMemo(() => buildCategoryBreakdown(entries), [entries]);

  const categoryXpMap = useMemo(() => categoryBreakdown.reduce<Record<Category, number>>((acc, group) => {
    acc[group.category as Category] = group.items.reduce((sum, item) => sum + item.points, 0);
    return acc;
  }, { Basketball: 0, Gym: 0, Home: 0, Regeneration: 0 }), [categoryBreakdown]);

  const globalLevelData = useMemo(() => getLevelFromXp(globalXp), [globalXp]);
  const levelProgressPercent = Math.min(100, Math.round((globalLevelData.xpIntoLevel / Math.max(1, getXpForNextLevel(globalLevelData.level))) * 100));
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

  const badgeBundle = useMemo(() => {
    const sessions = getWorkoutSessions();
    const stats = computeBadgeStats(sessions, globalLevelData.level);
    return buildPlayerBadges(stats);
  }, [globalLevelData.level]);
  const badges = badgeBundle.unlocked;
  const lockedBadges = badgeBundle.locked.slice(0, 6);
  const gameStatsSummary = useMemo(() => {
    const entries = loadGameStats();
    const points = entries.reduce((sum, entry) => sum + (entry.points ?? 0), 0);
    const assists = entries.reduce((sum, entry) => sum + (entry.assists ?? 0), 0);
    const rebounds = entries.reduce((sum, entry) => sum + (entry.rebounds ?? 0), 0);
    const steals = entries.reduce((sum, entry) => sum + (entry.steals ?? 0), 0);
    const recentLabels = [...entries]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .map((e) => e.opponentLabel?.trim())
      .filter(Boolean)
      .slice(0, 4) as string[];
    return { entries: entries.length, points, assists, rebounds, steals, recentLabels };
  }, []);


  return (
    <main className="app-container animate-in">
      <header>
        <p className="page-eyebrow">Fortschritt</p>
        <h1 className="page-title">Level</h1>
        <p className="page-subtitle">Globales Level aus Workout-XP, darunter Skill-Punkte pro Bereich.</p>
        <p className="mt-1 text-sm text-brand">Weiter so, {username} – jede Session zählt.</p>
      </header>
      <div className="mt-3">
        <TopSubTabs
          items={[
            { labelKey: "tabs.stats", href: "/stats" },
            { labelKey: "tabs.level", href: "/level" },
            { labelKey: "tabs.review", href: "/review" },
          ]}
        />
      </div>

      {popupMessage ? (
        <div className="mt-4 app-card--accent-cyan">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-strong">{popupMessage}</p>
            <button type="button" onClick={() => setPopupMessage(null)} className="btn btn-outline btn-xs">
              Schließen
            </button>
          </div>
        </div>
      ) : null}

      <section className="mt-6 app-card--accent-violet">
        <p className="section-eyebrow">Fortschritt</p>
        <h2 className="section-title mt-1">Globales Level</h2>
        <p className="mt-1 text-xs text-muted">Quelle: Workout-XP (gleiche Logik wie nach abgeschlossenen Sessions).</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="stat-tile">
            <p className="stat-tile__label">Aktuelles Level</p>
            <p className="stat-tile__value">Lv. {globalLevelData.level}</p>
            <p className="stat-tile__sub">{globalLevelData.xpIntoLevel}/{getXpForNextLevel(globalLevelData.level)} XP in diesem Level</p>
            <p className="text-xs text-faint">{Math.max(0, getXpForNextLevel(globalLevelData.level) - globalLevelData.xpIntoLevel)} XP bis zum nächsten Level</p>
            <p className="text-xs hint-success">Skill-Hinweis Regeneration: x{regenMultiplier.toFixed(2)}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bg-muted)]">
              <div className="h-full rounded-full bg-[var(--accent-violet)]" style={{ width: `${levelProgressPercent}%` }} />
            </div>
          </div>
          <div className="stat-tile">
            <p className="stat-tile__label">Gesamt-XP</p>
            <p className="stat-tile__value">{globalXp}</p>
            <p className="stat-tile__sub">Gewertete Sessions: {xpHistoryCount}</p>
            <p className={deloadActive ? "hint-warning mt-1" : "hint-success mt-1"}>
              {deloadActive ? "Deload aktiv (XP-Multiplikator 0.6)." : "Normale Belastung."}
            </p>
          </div>
        </div>

        <div className="mt-3 app-card--brand">
          <p className="text-sm font-semibold text-strong">🔥 Streak: {streakData.current} Tage (Best: {streakData.best})</p>
        </div>
        <p className="mt-3 text-sm text-muted">Belastung letzte 7 Tage: <span className="font-semibold text-strong">{thisWeekXp} XP</span> | davor: <span className="font-semibold text-strong">{lastWeekXp} XP</span> (Ratio: {overloadRatio.toFixed(2)})</p>
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
              <div key={`split-${group.category}`} className="app-card--flat">
                <button
                  type="button"
                  onClick={() => setOpenCategory((cur) => (cur === group.category ? null : (group.category as Category)))}
                  className="font-semibold text-strong text-left w-full"
                >
                  {group.category}
                </button>
                <button type="button" className="mt-1 text-xs text-[var(--brand-400)] underline" onClick={() => setModalCategory(group.category as Category)}>
                  Details öffnen
                </button>
                <p className="text-sm text-muted">Level {levelInfo.level} • {levelInfo.xpIntoLevel}/{nextRequirement} XP • x{multiplier.toFixed(2)}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-muted)]">
                  <div className="h-full rounded-full bg-[var(--accent-cyan)]" style={{ width: `${progress}%` }} />
                </div>
                {openCategory === group.category ? (
                  <GradientFadeList
                    className="mt-3"
                    items={decayedItems.length ? decayedItems : [{ subcategory: "Noch keine Daten", points: 0, gap: 0 }]}
                    listClassName="space-y-1 text-xs"
                    getKey={(item) => `pair-${group.category}-${item.subcategory}`}
                    renderItem={(item) => (
                      <p className="text-muted">{item.subcategory}: <span className="font-semibold text-strong">{item.points}</span> XP</p>
                    )}
                  />
                ) : (
                  <p className="mt-3 text-xs text-faint">Tippen zum Anzeigen der Unterkategorien.</p>
                )}
              </div>
            );
          })}
        </div>
      </section>
      {modalCategory ? (
        <div className="modal-overlay">
          <div className="modal-panel max-w-lg">
            <div className="flex items-center justify-between">
              <h3 className="section-title">{modalCategory} Details</h3>
              <button type="button" onClick={() => setModalCategory(null)} className="btn btn-outline btn-xs">Schließen</button>
            </div>
            <GradientFadeList
              className="mt-3"
              items={categoryBreakdown.find((group) => group.category === modalCategory)?.items ?? []}
              listClassName="space-y-2 text-sm"
              getKey={(item) => `${modalCategory}-${item.subcategory}`}
              renderItem={(item) => {
                const level = getLevelFromXp(item.points);
                const nextXp = getXpForNextLevel(level.level);
                return (
                  <div className="list-card">
                    <p className="list-card__title">{item.subcategory}</p>
                    <p className="list-card__meta">Level {level.level} • {level.xpIntoLevel}/{nextXp} XP • {Math.max(0, nextXp - level.xpIntoLevel)} XP bis nächstes Level</p>
                    <p className="hint-success mt-1">Multiplikator: x{getCategoryXpMultiplier(modalCategory).toFixed(2)}</p>
                  </div>
                );
              }}
            />
          </div>
        </div>
      ) : null}
      <section className="mt-4 app-card--brand">
        <h3 className="section-title">Badges</h3>
        {badges.length > 0 ? (
          <GradientFadeList
            className="mt-2"
            items={badges}
            listClassName="grid gap-2 sm:grid-cols-2"
            getKey={(badge) => `${badge.id}-${badge.name}`}
            renderItem={(badge) => (
              <div className="list-card text-sm">
                <p className="list-card__title text-brand">
                  {badge.emoji} {badge.name} • {badge.tier}
                </p>
                <p className="list-card__meta">{badge.description}</p>
              </div>
            )}
          />
        ) : (
          <p className="mt-2 text-sm text-muted">Noch keine Badges freigeschaltet.</p>
        )}
        {lockedBadges.length > 0 ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold text-muted">Als Nächstes</p>
            {lockedBadges.map((badge) => (
              <div key={`locked-${badge.id}`} className="list-card text-sm opacity-80">
                <p className="list-card__title">
                  {badge.emoji} {badge.name} • {badge.progressText}
                </p>
                <p className="list-card__meta">{badge.description}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      <section className="mt-4 app-card--accent-violet">
        <h3 className="section-title">Spiel-Level Kategorie</h3>
        <p className="mt-2 text-sm text-muted">
          Getrackte Spiele/Spieltrainings: <strong className="text-strong">{gameStatsSummary.entries}</strong> • Punkte:{" "}
          <strong className="text-strong">{gameStatsSummary.points}</strong> • Assists: <strong className="text-strong">{gameStatsSummary.assists}</strong> • Rebounds:{" "}
          <strong className="text-strong">{gameStatsSummary.rebounds}</strong> • Steals: <strong className="text-strong">{gameStatsSummary.steals}</strong>
        </p>
        {gameStatsSummary.recentLabels.length > 0 ? (
          <p className="mt-3 text-xs text-faint">
            Zuletzt:{" "}
            <span className="text-muted">{gameStatsSummary.recentLabels.join(" · ")}</span>
          </p>
        ) : null}
      </section>
    </main>
  );
}