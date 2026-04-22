import type { WorkoutSessionEntry } from "@/lib/session-storage";

export type BadgeCategory = "Allgemein" | "Basketball" | "Gym" | "Home";

export type PlayerBadge = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tier: "Bronze" | "Silver" | "Gold" | "Hall of Fame" | "Legend";
  category: BadgeCategory;
  unlocked: boolean;
  progressText: string;
};

type BadgeStats = {
  level: number;
  weeklyWorkouts: number;
  allTimeWorkouts: number;
  weeklyMinutes: number;
  allTimeMinutes: number;
  threePointersMade: number;
  gymWorkouts: number;
  basketballWorkouts: number;
  homeWorkouts: number;
  currentStreak: number;
  basketballSubcategoryCounts: Record<string, number>;
  gymSubcategoryCounts: Record<string, number>;
  homeSubcategoryCounts: Record<string, number>;
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getStreakFromDates(dateKeys: string[]) {
  const set = new Set(dateKeys);
  let streak = 0;
  const cursor = new Date();
  while (true) {
    const key = toDateKey(cursor);
    if (!set.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function getSessionMinutes(session: WorkoutSessionEntry) {
  const uniqueExerciseIds = new Set(session.logs.map((log) => log.exerciseId));
  const raw = Math.max(1, uniqueExerciseIds.size) * 10;
  return Math.ceil((raw * 1.1) / 5) * 5;
}

function countBySubcategory(
  sessions: WorkoutSessionEntry[],
  category: "Basketball" | "Gym" | "Home",
) {
  return sessions.reduce<Record<string, number>>((acc, session) => {
    if (session.workoutCategory !== category) return acc;
    const sub = session.workoutSubcategory || "Unbekannt";
    acc[sub] = (acc[sub] ?? 0) + 1;
    return acc;
  }, {});
}

export function computeBadgeStats(sessions: WorkoutSessionEntry[], level: number): BadgeStats {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const weeklySessions = sessions.filter((session) => new Date(session.dateISO) >= weekStart);

  const allTimeMinutes = sessions.reduce((sum, session) => sum + getSessionMinutes(session), 0);
  const weeklyMinutes = weeklySessions.reduce((sum, session) => sum + getSessionMinutes(session), 0);
  const threePointersMade = sessions.reduce(
    (sum, session) => sum + session.logs.reduce((acc, log) => acc + Math.max(0, log.made ?? 0), 0),
    0,
  );

  return {
    level,
    weeklyWorkouts: weeklySessions.length,
    allTimeWorkouts: sessions.length,
    weeklyMinutes,
    allTimeMinutes,
    threePointersMade,
    gymWorkouts: sessions.filter((session) => session.workoutCategory === "Gym").length,
    basketballWorkouts: sessions.filter((session) => session.workoutCategory === "Basketball").length,
    homeWorkouts: sessions.filter((session) => session.workoutCategory === "Home").length,
    currentStreak: getStreakFromDates(sessions.map((session) => session.dateISO.slice(0, 10))),
    basketballSubcategoryCounts: countBySubcategory(sessions, "Basketball"),
    gymSubcategoryCounts: countBySubcategory(sessions, "Gym"),
    homeSubcategoryCounts: countBySubcategory(sessions, "Home"),
  };
}

function buildThresholdBadge(params: {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tier: PlayerBadge["tier"];
  category: BadgeCategory;
  value: number;
  target: number;
}) {
  return {
    id: params.id,
    name: params.name,
    description: params.description,
    emoji: params.emoji,
    tier: params.tier,
    category: params.category,
    unlocked: params.value >= params.target,
    progressText: `${Math.min(params.value, params.target)}/${params.target}`,
  } satisfies PlayerBadge;
}

export function buildPlayerBadges(stats: BadgeStats) {
  const badges: PlayerBadge[] = [
    buildThresholdBadge({
      id: "level-10",
      name: "Rising Prospect",
      description: "Erreiche Level 10.",
      emoji: "🟣",
      tier: "Hall of Fame",
      category: "Allgemein",
      value: stats.level,
      target: 10,
    }),
    buildThresholdBadge({
      id: "weekly-merchant",
      name: "Basketball-Merchant",
      description: "Erreiche mindestens 7 Workouts in einer Woche.",
      emoji: "🏀🛒",
      tier: "Legend",
      category: "Allgemein",
      value: stats.weeklyWorkouts,
      target: 7,
    }),
    buildThresholdBadge({
      id: "minutes-weekly",
      name: "Weekly Grinder",
      description: "Trainiere 180 Minuten in 7 Tagen.",
      emoji: "⏱️",
      tier: "Gold",
      category: "Allgemein",
      value: stats.weeklyMinutes,
      target: 180,
    }),
    buildThresholdBadge({
      id: "minutes-all-time",
      name: "Marathon Hooper",
      description: "Trainiere 2000 Minuten all-time.",
      emoji: "🏁",
      tier: "Legend",
      category: "Allgemein",
      value: stats.allTimeMinutes,
      target: 2000,
    }),
    buildThresholdBadge({
      id: "streak",
      name: "No Days Off",
      description: "Erreiche eine 14-Tage-Streak.",
      emoji: "🔥",
      tier: "Legend",
      category: "Allgemein",
      value: stats.currentStreak,
      target: 14,
    }),
    buildThresholdBadge({
      id: "three-pointer",
      name: "Limitless Range",
      description: "Triff 50 Würfe (Makes) im Tracking.",
      emoji: "🎯",
      tier: "Gold",
      category: "Basketball",
      value: stats.threePointersMade,
      target: 50,
    }),
    buildThresholdBadge({
      id: "basketball-volume",
      name: "Court Visionary",
      description: "Schließe 30 Basketball-Workouts ab.",
      emoji: "👁️",
      tier: "Hall of Fame",
      category: "Basketball",
      value: stats.basketballWorkouts,
      target: 30,
    }),
    buildThresholdBadge({
      id: "gym-volume",
      name: "Iron Temple",
      description: "Schließe 20 Gym-Workouts ab.",
      emoji: "🏋️",
      tier: "Gold",
      category: "Gym",
      value: stats.gymWorkouts,
      target: 20,
    }),
    buildThresholdBadge({
      id: "home-volume",
      name: "Home Hero",
      description: "Schließe 15 Home-Workouts ab.",
      emoji: "🏡",
      tier: "Silver",
      category: "Home",
      value: stats.homeWorkouts,
      target: 15,
    }),
    buildThresholdBadge({
      id: "bb-handles",
      name: "Handle Magician",
      description: "Spiele 5 Basketball-Workouts in Handles.",
      emoji: "🪄",
      tier: "Silver",
      category: "Basketball",
      value: stats.basketballSubcategoryCounts.Handles ?? 0,
      target: 5,
    }),
    buildThresholdBadge({
      id: "bb-shooting",
      name: "Sniper Certified",
      description: "Spiele 5 Basketball-Workouts in Shooting.",
      emoji: "🎯",
      tier: "Silver",
      category: "Basketball",
      value: stats.basketballSubcategoryCounts.Shooting ?? 0,
      target: 5,
    }),
    buildThresholdBadge({
      id: "bb-finishing",
      name: "Paint Finisher",
      description: "Spiele 5 Basketball-Workouts in Finishing.",
      emoji: "🛡️",
      tier: "Silver",
      category: "Basketball",
      value: stats.basketballSubcategoryCounts.Finishing ?? 0,
      target: 5,
    }),
    buildThresholdBadge({
      id: "bb-conditioning",
      name: "Engine Room",
      description: "Spiele 5 Basketball-Workouts in Conditioning.",
      emoji: "⚡",
      tier: "Silver",
      category: "Basketball",
      value: stats.basketballSubcategoryCounts.Conditioning ?? 0,
      target: 5,
    }),
    buildThresholdBadge({
      id: "gym-upper",
      name: "Upper Body Anchor",
      description: "Spiele 4 Gym-Workouts in Oberkörper.",
      emoji: "💪",
      tier: "Bronze",
      category: "Gym",
      value: stats.gymSubcategoryCounts.Oberkörper ?? 0,
      target: 4,
    }),
    buildThresholdBadge({
      id: "gym-arms",
      name: "Arm Day Addict",
      description: "Spiele 4 Gym-Workouts in Arme.",
      emoji: "🦾",
      tier: "Bronze",
      category: "Gym",
      value: stats.gymSubcategoryCounts.Arme ?? 0,
      target: 4,
    }),
    buildThresholdBadge({
      id: "gym-core",
      name: "Core Commander",
      description: "Spiele 4 Gym-Workouts in Core.",
      emoji: "🧱",
      tier: "Bronze",
      category: "Gym",
      value: stats.gymSubcategoryCounts.Core ?? 0,
      target: 4,
    }),
    buildThresholdBadge({
      id: "gym-legs",
      name: "Leg Day Loyal",
      description: "Spiele 4 Gym-Workouts in Beine.",
      emoji: "🦵",
      tier: "Bronze",
      category: "Gym",
      value: stats.gymSubcategoryCounts.Beine ?? 0,
      target: 4,
    }),
    buildThresholdBadge({
      id: "gym-cardio",
      name: "Cardio Engine",
      description: "Spiele 4 Gym-Workouts in Cardio.",
      emoji: "🏃",
      tier: "Bronze",
      category: "Gym",
      value: stats.gymSubcategoryCounts.Cardio ?? 0,
      target: 4,
    }),
    buildThresholdBadge({
      id: "home-mobility",
      name: "Mobility Master",
      description: "Spiele 4 Home-Workouts in Mobility.",
      emoji: "🧘",
      tier: "Bronze",
      category: "Home",
      value: stats.homeSubcategoryCounts.Mobility ?? 0,
      target: 4,
    }),
    buildThresholdBadge({
      id: "home-conditioning",
      name: "Home Conditioner",
      description: "Spiele 4 Home-Workouts in Conditioning.",
      emoji: "🏠",
      tier: "Bronze",
      category: "Home",
      value: stats.homeSubcategoryCounts.Conditioning ?? 0,
      target: 4,
    }),
    buildThresholdBadge({
      id: "home-recovery",
      name: "Recovery Routine",
      description: "Spiele 4 Home-Workouts in Recovery.",
      emoji: "🌿",
      tier: "Bronze",
      category: "Home",
      value: stats.homeSubcategoryCounts.Recovery ?? 0,
      target: 4,
    }),
  ];

  return {
    all: badges,
    unlocked: badges.filter((badge) => badge.unlocked),
  };
}