"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SportsNewsSection from "@/components/SportsNewsSection";
import PageHeader from "@/components/PageHeader";
import { getWorkoutSessions } from "@/lib/session-storage";
import { buildPlayerBadges, computeBadgeStats, type PlayerBadge } from "@/lib/badge-system";
import { getLevelFromXp, getProgressionState } from "@/lib/level-system";
import {
  type SportType,
  WorkoutProgress,
  buildWorkoutStorageKey,
  getDefaultWorkoutProgress,
  getTodayDateKey,
  getTodayWorkoutPlan,
  getWeekdayName,
  parseWorkoutProgress,
} from "@/lib/workout";
import { MANUAL_DAY_WORKOUTS_KEY, readDailyPlanMap } from "@/lib/activity-calendar";
import { pullProgressFromCloud } from "@/lib/progress-sync";
import { loadPerformanceTips } from "@/lib/performance-tips";
import { isWorkoutCompletedOnDate } from "@/lib/workout-completion";

const ALLOWED_SPORTS: SportType[] = ["Gym", "Basketball", "Home", "Regeneration", "Rest"];

function isSportType(value: string): value is SportType {
  return ALLOWED_SPORTS.includes(value as SportType);
}

function getWorkoutFromTodayTags(tags: string[]) {
  const basketballTag = tags.find((tag) => tag.startsWith("Basketball:"))?.replace("Basketball:", "");
  const gymTag = tags.find((tag) => tag.startsWith("Gym:"))?.replace("Gym:", "");
  const homeTag = tags.find((tag) => tag.startsWith("Home:"))?.replace("Home:", "");
  const recoveryTag = tags.find((tag) => tag.startsWith("Recovery:"))?.replace("Recovery:", "");

  if (tags.includes("Trainingstag") || tags.includes("Spieltraining") || tags.includes("Spieltag")) {
    return { sport: "Basketball" as SportType, title: basketballTag ? `Basketball – ${basketballTag}` : "Basketball Training", subcategory: basketballTag ?? "Training" };
  }
  if (tags.includes("Gym")) {
    return { sport: "Gym" as SportType, title: gymTag ? `Gym – ${gymTag}` : "Gym Session", subcategory: gymTag ?? "Gym" };
  }
  if (tags.includes("Home-Workout")) {
    return { sport: "Home" as SportType, title: homeTag ? `Home – ${homeTag}` : "Home Workout", subcategory: homeTag ?? "Home" };
  }
  if (tags.includes("Regeneration")) {
    return { sport: "Regeneration" as SportType, title: recoveryTag ? `Recovery – ${recoveryTag}` : "Regeneration", subcategory: recoveryTag ?? "Recovery" };
  }
  return null;
}

const PLAYER_QUOTES = [
  "Hard work beats talent when talent fails to work hard. — Kevin Durant",
  "Excellence is not a singular act, but a habit. — Shaquille O’Neal",
  "Some people want it to happen, some wish it would happen, others make it happen. — Michael Jordan",
  "If you’re afraid to fail, then you’re probably going to fail. — Kobe Bryant",
];
const DASHBOARD_LAST_LEVEL_KEY = "bt.dashboard.last-level.v1";

const SPORT_COLOR: Record<SportType, string> = {
  Basketball: "rgba(255, 122, 24, 0.8)",
  Gym: "rgba(168, 85, 247, 0.85)",
  Home: "rgba(34, 211, 238, 0.85)",
  Regeneration: "rgba(34, 197, 94, 0.85)",
  Rest: "rgba(148, 163, 184, 0.7)",
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "P";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export default function DashboardPage({ forceProfileSetup = false }: { forceProfileSetup?: boolean }) {
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
  const [todaySport, setTodaySport] = useState<SportType>(todayWorkout.sport);
  const [todaySubcategory, setTodaySubcategory] = useState(todayWorkout.subcategory);
  const [hasWorkoutPlanned, setHasWorkoutPlanned] = useState(true);
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [badges, setBadges] = useState<PlayerBadge[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<PlayerBadge | null>(null);
  const [username, setUsername] = useState<string>("Player");
  const [weeklyCompleted, setWeeklyCompleted] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [weeklyPlannedCount, setWeeklyPlannedCount] = useState(0);
  const [dashboardTips, setDashboardTips] = useState<string[]>([]);
  const [levelPopup, setLevelPopup] = useState<string | null>(null);
  const [todayWorkoutIds, setTodayWorkoutIds] = useState<string[]>([todayWorkout.id]);

  useEffect(() => {
    const refreshTodayData = () => {
      const parsed = parseWorkoutProgress(
        window.localStorage.getItem(buildWorkoutStorageKey(dateKey)),
        fallbackProgress,
      );
      const plannedIds = new Set<string>([todayWorkout.id, parsed.workoutId]);
      setProgress(parsed);
      try {
        setHasWorkoutPlanned(true);
        setTodayLabel(null);
        setTodaySport(todayWorkout.sport);
        setTodaySubcategory(todayWorkout.subcategory);
        const rawManual = window.localStorage.getItem(MANUAL_DAY_WORKOUTS_KEY);
        if (rawManual) {
          const parsedManual = JSON.parse(rawManual) as Record<
            string,
            Array<{ id?: string; title: string; sport?: string; subcategory?: string }>
          >;
          const todayManuals = parsedManual[dateKey] ?? [];
          todayManuals.forEach((entry) => {
            if (entry.id) plannedIds.add(entry.id);
          });
          const todayManual = todayManuals[0];
          if (todayManual?.title) {
            setHasWorkoutPlanned(true);
            setTodayLabel(todayManual.title);
          }
          if (todayManual?.sport && isSportType(todayManual.sport)) setTodaySport(todayManual.sport);
          if (todayManual?.subcategory) setTodaySubcategory(todayManual.subcategory);
        }
        setTodayWorkoutIds(Array.from(plannedIds));
        const dailyPlans = readDailyPlanMap();
        const tags = dailyPlans[dateKey] ?? [];
        setPlannedTags(tags);
        const workoutFromWeekly = getWorkoutFromTodayTags(tags);
        if (workoutFromWeekly) {
          setHasWorkoutPlanned(true);
          setTodayLabel(workoutFromWeekly.title);
          setTodaySport(workoutFromWeekly.sport);
          setTodaySubcategory(workoutFromWeekly.subcategory);
        } else {
          setHasWorkoutPlanned(false);
          setTodayLabel(null);
        }
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
    window.addEventListener("bt:plan-updated", refreshTodayData);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshTodayData);
      window.removeEventListener("storage", refreshTodayData);
      window.removeEventListener("bt:plan-updated", refreshTodayData);
    };
  }, [dateKey, fallbackProgress, todayWorkout.sport, todayWorkout.subcategory]);

  useEffect(() => {
    void pullProgressFromCloud();
  }, []);

  useEffect(() => {
    const progression = getProgressionState();
    const currentLevel = getLevelFromXp(progression.totalXp).level;
    const previousRaw = window.localStorage.getItem(DASHBOARD_LAST_LEVEL_KEY);
    const previousLevel = previousRaw ? Number(previousRaw) : currentLevel;
    let popupTimer: number | undefined;
    if (Number.isFinite(previousLevel) && currentLevel > previousLevel) {
      popupTimer = window.setTimeout(() => {
        setLevelPopup(`🎉 Level Up! Du bist jetzt Level ${currentLevel}.`);
      }, 0);
    }
    window.localStorage.setItem(DASHBOARD_LAST_LEVEL_KEY, String(currentLevel));
    return () => {
      if (popupTimer !== undefined) window.clearTimeout(popupTimer);
    };
  }, [weeklyCompleted]);

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
      const tips = loadPerformanceTips().filter((tip) => tip.active).slice(0, 6).map((tip) => `${tip.title}: ${tip.content}`);
      setDashboardTips(tips);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);
  const completionRate = useMemo(() => {
    if (weeklyPlannedCount === 0) return 0;
    return Math.min(100, Math.round((weeklyCompleted / weeklyPlannedCount) * 100));
  }, [weeklyCompleted, weeklyPlannedCount]);

  const isCompleted = useMemo(
    () => isWorkoutCompletedOnDate(dateKey, todayWorkoutIds),
    [dateKey, todayWorkoutIds],
  );
  const isInProgress =
    !isCompleted && progress.status === "in_progress" && progress.date === dateKey;
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

  const greetingHour = new Date().getHours();
  const greeting =
    greetingHour < 5 ? "Gute Nacht" : greetingHour < 11 ? "Guten Morgen" : greetingHour < 18 ? "Hi" : "Guten Abend";

  return (
    <main className="app-container animate-in">
      <PageHeader
        eyebrow={`${greeting} • ${weekdayLabel}`}
        title={`${greeting}, ${username}`}
        subtitle="Dein heutiger Trainingsplan auf einen Blick."
        actions={<div className="avatar-bubble">{getInitials(username)}</div>}
      />

      {forceProfileSetup ? (
        <section className="mt-5 app-card--accent-violet">
          <p className="text-sm text-strong">
            Vervollständige zuerst dein Profil (Name + Username), damit Weekly &amp; Auto-Plan sauber funktionieren.
          </p>
          <Link href="/profile?setup=1" className="btn btn-violet btn-sm mt-3">
            Zum Profil
          </Link>
        </section>
      ) : null}

      {/* Hero: today's workout */}
      <section className="mt-6">
        {!isCompleted && hasWorkoutPlanned ? (
          <article className="app-card--brand">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="section-eyebrow">Heutiges Workout</p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight">
                  {todayLabel ?? todayWorkout.title}
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="chip chip-active">{todaySport}</span>
                  <span className="chip">{todaySubcategory}</span>
                  {plannedTags.length > 0 ? (
                    <span className="chip chip-info">{plannedTags.join(" · ")}</span>
                  ) : null}
                </div>
              </div>
              <span
                aria-hidden
                className="hidden h-12 w-12 shrink-0 rounded-2xl sm:block"
                style={{
                  background: `linear-gradient(135deg, ${SPORT_COLOR[todaySport]}, rgba(255,255,255,0.05))`,
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)",
                }}
              />
            </div>

            <p className="mt-4 text-sm text-muted">
              {isInProgress
                ? "Workout läuft – fortsetzen und Sätze loggen."
                : "Bereit? Starte jetzt deine Einheit."}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/workouts" className="btn btn-primary">
                {isInProgress ? "Workout fortsetzen" : "Workout starten"}
              </Link>
              <Link href="/Weekly-Workout" className="btn btn-ghost">
                Weekly öffnen
              </Link>
            </div>
          </article>
        ) : !isCompleted ? (
          <article className="app-card--accent-violet">
            <p className="section-eyebrow">Heute</p>
            <h2 className="mt-1 text-xl font-bold">Kein Workout geplant</h2>
            <p className="mt-2 text-sm text-muted">
              Schon 10–20 Minuten machen einen Unterschied. Starte eine kleine Session.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/workouts" className="btn btn-violet">
                Trotzdem trainieren
              </Link>
              <Link href="/Weekly-Workout" className="btn btn-ghost">
                Woche planen
              </Link>
            </div>
          </article>
        ) : (
          <article className="app-card--accent-emerald">
            <p className="section-eyebrow">Heute</p>
            <h2 className="mt-1 text-xl font-bold text-strong">Workout erledigt ✅</h2>
            <p className="mt-2 text-sm text-muted">
              Stark! Das Workout für heute wird nicht mehr im Dashboard angezeigt.
            </p>
          </article>
        )}
      </section>

      {/* Tips */}
      <section className="mt-4 app-card--accent-cyan">
        <div className="flex items-center justify-between">
          <h3 className="section-title">Meine Notizen</h3>
          <Link href="/tips" className="btn btn-ghost btn-xs">Öffnen</Link>
        </div>
        {dashboardTips.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Keine aktiven Tipps.</p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-sm text-strong">
            {dashboardTips.map((tip, index) => (
              <li key={`db-tip-${index}`} className="flex gap-2">
                <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Stats grid */}
      <section className="grid-stats mt-6">
        <article className="stat-tile">
          <p className="stat-tile__label">Workouts · 7 Tage</p>
          <p className="stat-tile__value">{weeklyCompleted}</p>
        </article>
        <article className="stat-tile">
          <p className="stat-tile__label">Aktuelle Streak</p>
          <p className="stat-tile__value">
            {streakDays}
            <span className="ml-1 text-sm font-medium text-muted">Tage</span>
          </p>
        </article>
        <article className="stat-tile">
          <p className="stat-tile__label">Plan · Woche</p>
          <p className="stat-tile__value">{weeklyPlannedCount}</p>
        </article>
        <article className="stat-tile">
          <p className="stat-tile__label">Erfüllungsquote</p>
          <p className="stat-tile__value">
            {completionRate}
            <span className="ml-1 text-sm font-medium text-muted">%</span>
          </p>
        </article>
      </section>

      {levelPopup ? (
        <div className="mt-4 app-card--accent-emerald">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-strong">{levelPopup}</p>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setLevelPopup(null)}>
              Schließen
            </button>
          </div>
        </div>
      ) : null}

      {/* Badges */}
      <section className="mt-6 app-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="section-eyebrow">Auszeichnungen</p>
            <h3 className="section-title">Badges</h3>
          </div>
          <button
            type="button"
            onClick={() => setShowAllBadges((current) => !current)}
            className="btn btn-ghost btn-xs"
          >
            {showAllBadges ? "Nur erreichte" : "Alle Badges"}
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {(Object.keys(badgeSections) as Array<keyof typeof badgeSections>).map((section) =>
            badgeSections[section].length > 0 ? (
              <div key={`badge-section-${section}`}>
                <p className="section-eyebrow mb-2">{section}</p>
                <div className="flex flex-wrap gap-2">
                  {badgeSections[section].map((badge) => (
                    <button
                      key={badge.id}
                      type="button"
                      onClick={() => setSelectedBadge(badge)}
                      className="chip hover:bg-white/10"
                    >
                      <span className="text-base">{badge.emoji}</span>
                      <span>{badge.name}</span>
                      <span className="text-faint">· {badge.tier}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null,
          )}
          {visibleBadges.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Badges. Starte ein Workout, um dein erstes Badge freizuschalten.</p>
          ) : null}
        </div>
      </section>

      {/* Quote */}
      <section className="mt-4 app-card--accent-violet">
        <p className="section-eyebrow">Motivation des Tages</p>
        <p className="mt-2 text-base italic text-strong">“{quoteOfTheDay}”</p>
      </section>

      <SportsNewsSection />

      {selectedBadge ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md app-card">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold">
                <span className="mr-1 text-xl">{selectedBadge.emoji}</span>
                {selectedBadge.name}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedBadge(null)}
                className="btn btn-ghost btn-xs"
              >
                Schließen
              </button>
            </div>
            <p className="mt-3 text-sm text-strong">{selectedBadge.description}</p>
            <p className="mt-2 text-xs text-muted">Fortschritt: {selectedBadge.progressText}</p>
            <p className="mt-1 text-xs text-muted">
              Status: {selectedBadge.unlocked ? "Badge erhalten ✅" : "Noch nicht erreicht"}
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
