"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SportsNewsSection from "@/components/SportsNewsSection";
import { getWorkoutSessions } from "@/lib/session-storage";
import { buildPlayerBadges, computeBadgeStats, type PlayerBadge } from "@/lib/badge-system";
import { getLevelFromXp, getProgressionState } from "@/lib/level-system";
import {
  WorkoutProgress,
  buildWorkoutStorageKey,
  getDefaultWorkoutProgress,
  getTodayDateKey,
  getTodayWorkoutPlan,
  getWeekdayName,
  parseWorkoutProgress,
} from "@/lib/workout";
import { MANUAL_DAY_WORKOUTS_KEY, readDailyPlanMap } from "@/lib/activity-calendar";

const PLAYER_QUOTES = [
  "Hard work beats talent when talent fails to work hard. — Kevin Durant",
  "Excellence is not a singular act, but a habit. — Shaquille O’Neal",
  "Some people want it to happen, some wish it would happen, others make it happen. — Michael Jordan",
  "If you’re afraid to fail, then you’re probably going to fail. — Kobe Bryant",
];

export default function DashboardPage() {
  const dateKey = useMemo(() => getTodayDateKey(), []);
  const todayWorkout = useMemo(() => getTodayWorkoutPlan(), []);
  const weekdayLabel = useMemo(() => getWeekdayName(new Date(`${dateKey}T00:00:00.000Z`)), [dateKey]);
  const fallbackProgress = useMemo(
    () => getDefaultWorkoutProgress(dateKey, todayWorkout),
    [dateKey, todayWorkout],
  );

  const [progress, setProgress] = useState<WorkoutProgress>(fallbackProgress);
  const [todayLabel, setTodayLabel] = useState<string | null>(null);
  const [plannedTags, setPlannedTags] = useState<string[]>([]);
  const [todaySport, setTodaySport] = useState(todayWorkout.sport);
  const [todaySubcategory, setTodaySubcategory] = useState(todayWorkout.subcategory);
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [badges, setBadges] = useState<PlayerBadge[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<PlayerBadge | null>(null);
  const [username, setUsername] = useState<string>("Player");
  const [weeklyCompleted, setWeeklyCompleted] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [weeklyPlannedCount, setWeeklyPlannedCount] = useState(0);

  useEffect(() => {
    const refreshTodayData = () => {
      setProgress(
        parseWorkoutProgress(
          window.localStorage.getItem(buildWorkoutStorageKey(dateKey)),
          fallbackProgress,
        ),
      );
      try {
        setTodayLabel(null);
        setTodaySport(todayWorkout.sport);
        setTodaySubcategory(todayWorkout.subcategory);
        const rawManual = window.localStorage.getItem(MANUAL_DAY_WORKOUTS_KEY);
        if (rawManual) {
          const parsed = JSON.parse(rawManual) as Record<string, Array<{ title: string; sport?: string; subcategory?: string }>>;
          const todayManual = parsed[dateKey]?.[0];
          if (todayManual?.title) {
            setTodayLabel(todayManual.title);
          }
          if (todayManual?.sport) setTodaySport(todayManual.sport);
          if (todayManual?.subcategory) setTodaySubcategory(todayManual.subcategory);
        }
        const dailyPlans = readDailyPlanMap();
        setPlannedTags(dailyPlans[dateKey] ?? []);
        const profileUsername = window.localStorage.getItem("profile_username");
        if (profileUsername) setUsername(profileUsername);
      } catch {
        // noop
      }
    };

    const timer = window.setTimeout(refreshTodayData, 0);
    const interval = window.setInterval(refreshTodayData, 3000);
    window.addEventListener("focus", refreshTodayData);
    window.addEventListener("storage", refreshTodayData);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshTodayData);
      window.removeEventListener("storage", refreshTodayData);
    };
  }, [dateKey, fallbackProgress, todayWorkout.sport, todayWorkout.subcategory]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const sessions = getWorkoutSessions();
      const progression = getProgressionState();
      const level = getLevelFromXp(progression.totalXp).level;
      const badgeStats = computeBadgeStats(sessions, level);
      setBadges(buildPlayerBadges(badgeStats).all);

      const start = new Date();
      start.setDate(start.getDate() - 6);
      setWeeklyCompleted(sessions.filter((session) => new Date(session.dateISO) >= start).length);

      const dateSet = new Set(sessions.map((entry) => entry.dateISO.slice(0, 10)));
      let streak = 0;
      const cursor = new Date();
      while (true) {
        const key = cursor.toISOString().slice(0, 10);
        if (!dateSet.has(key)) break;
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
      setStreakDays(streak);

      const plans = readDailyPlanMap();
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const plannedCount = Object.keys(plans).filter((key) => {
        const d = new Date(`${key}T00:00:00`);
        if (!(d >= weekStart && d <= weekEnd)) return false;
        const tags = plans[key] ?? [];
        return tags.includes("Gym") || tags.includes("Trainingstag") || tags.includes("Home-Workout");
      }).length;
      setWeeklyPlannedCount(plannedCount);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);
  const completionRate = useMemo(() => {
    if (weeklyPlannedCount === 0) return 0;
    return Math.min(100, Math.round((weeklyCompleted / weeklyPlannedCount) * 100));
  }, [weeklyCompleted, weeklyPlannedCount]);

  const isCompleted = progress.status === "completed";
  const isInProgress = progress.status === "in_progress";
  const quoteOfTheDay = PLAYER_QUOTES[(new Date(dateKey).getDate() - 1) % PLAYER_QUOTES.length];
  const visibleBadges = showAllBadges ? badges : badges.filter((badge) => badge.unlocked);
  const badgeSections = useMemo(() => {
    return {
      Allgemein: visibleBadges.filter((badge) => badge.category === "Allgemein"),
      Basketball: visibleBadges.filter((badge) => badge.category === "Basketball"),
      Gym: visibleBadges.filter((badge) => badge.category === "Gym"),
      Home: visibleBadges.filter((badge) => badge.category === "Home"),
    };
  }, [visibleBadges]);

  return (
    <main className="min-h-screen bg-black p-6 pb-24 text-white">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-2 text-zinc-400">Übersicht über dein Training, {username}</p>

      {!isCompleted ? (
        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Heutiges Workout • {weekdayLabel}
          </p>
          <h2 className="mt-2 text-xl font-semibold">{todayLabel ?? todayWorkout.title}</h2>
          <p className="text-sm text-zinc-400">Sport: {todaySport}</p>
          <p className="text-sm text-zinc-400">Unterkategorie: {todaySubcategory}</p>
          {plannedTags.length > 0 ? (
            <p className="mt-2 text-xs text-zinc-300">Geplant heute: {plannedTags.join(", ")}</p>
          ) : null}

          <p className="mt-4 text-sm text-zinc-300">
            {isInProgress
              ? "Workout begonnen. Du kannst direkt weitermachen."
              : "Workout noch offen. Starte jetzt deine Einheit."}
          </p>

          <Link
            href="/workouts"
            className="mt-4 inline-block rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"
          >
            {isInProgress ? "Workout fortsetzen" : "Workout starten"}
          </Link>
        </section>
      ) : (
        <section className="mt-6 rounded-2xl border border-green-800 bg-green-950/50 p-4">
          <h2 className="text-lg font-semibold text-green-300">Heutiges Workout erledigt ✅</h2>
          <p className="mt-1 text-sm text-green-200">
            Stark! Das Workout für heute wird deshalb nicht mehr im Dashboard angezeigt.
          </p>
        </section>
      )}

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Workouts (7 Tage)</p>
          <p className="mt-2 text-3xl font-bold">{weeklyCompleted}</p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Aktuelle Streak</p>
          <p className="mt-2 text-3xl font-bold">{streakDays} Tage</p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Geplante Workouts (Woche)</p>
          <p className="mt-2 text-3xl font-bold">{weeklyPlannedCount}</p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Erfüllungsquote (Woche)</p>
          <p className="mt-2 text-3xl font-bold">{completionRate}%</p>
        </article>
      </section>
      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Badges (wie im Level)</h3>
          <button
            type="button"
            onClick={() => setShowAllBadges((current) => !current)}
            className="rounded-lg border border-zinc-600 px-3 py-1 text-xs"
          >
            {showAllBadges ? "Nur erreichte" : "Alle Badges"}
          </button>
        </div>
        <div className="mt-3 space-y-3">
          {(Object.keys(badgeSections) as Array<keyof typeof badgeSections>).map((section) =>
            badgeSections[section].length > 0 ? (
              <div key={`badge-section-${section}`}>
                <p className="mb-2 text-xs uppercase tracking-wide text-zinc-400">{section} Badges</p>
                <div className="flex flex-wrap gap-2">
                  {badgeSections[section].map((badge) => (
                    <button
                      key={badge.id}
                      type="button"
                      onClick={() => setSelectedBadge(badge)}
                      className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-100 hover:bg-zinc-800"
                    >
                      {badge.emoji} {badge.name} • {badge.tier}
                    </button>
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </div>
      </section>
      <section className="mt-6 rounded-2xl border border-indigo-800 bg-indigo-950/30 p-4">
        <p className="text-xs uppercase tracking-wide text-indigo-300">Motivation</p>
        <p className="mt-2 text-sm text-indigo-100">“{quoteOfTheDay}”</p>
      </section>

      <SportsNewsSection />
      {selectedBadge ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold">
                {selectedBadge.emoji} {selectedBadge.name}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedBadge(null)}
                className="rounded-lg border border-zinc-600 px-2 py-1 text-xs"
              >
                Schließen
              </button>
            </div>
            <p className="mt-2 text-sm text-zinc-300">{selectedBadge.description}</p>
            <p className="mt-2 text-xs text-zinc-400">Fortschritt: {selectedBadge.progressText}</p>
            <p className="mt-1 text-xs text-zinc-400">
              Status: {selectedBadge.unlocked ? "Badge erhalten ✅" : "Noch nicht erreicht"}
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}