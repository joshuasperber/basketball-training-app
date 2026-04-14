export type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type DayMode =
  | "unavailable"
  | "rest"
  | "recovery"
  | "game_day"
  | "game_training"
  | "basketball_training"
  | "gym"
  | "custom";

export type DayConfig = {
  mode: DayMode;
  minutes: number;
};

export type WeekConfig = Record<DayKey, DayConfig>;

export type PlannerInput = {
  position: string;
  playStyle: string;
  weekConfig: WeekConfig;
  weeklyGoalSessions: number;
};

export type PlannedDay = {
  day: DayKey;
  minutes: number;
  intensity: "rest" | "recovery" | "light" | "medium" | "high";
  sessionType: "none" | "recovery" | "game" | "game-training" | "basketball" | "gym" | "custom";
  reason: string;
};

const DAYS: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DAY_TO_INDEX: Record<DayKey, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function normalizeMinutes(mode: DayMode, minutes: number) {
  if (mode === "unavailable" || mode === "rest") return 0;
  if (mode === "game_day") return Math.min(Math.max(minutes, 0), 20);
  if (mode === "game_training") return Math.min(Math.max(minutes, 0), 45);
  return Math.max(minutes, 0);
}

export function buildWeeklyPlan(input: PlannerInput): PlannedDay[] {
  return DAYS.map((day) => {
    const config = input.weekConfig[day] ?? { mode: "unavailable", minutes: 0 };
    const minutes = normalizeMinutes(config.mode, config.minutes);

    switch (config.mode) {
      case "unavailable":
        return { day, minutes: 0, intensity: "rest", sessionType: "none", reason: "Keine Zeit" };
      case "rest":
        return { day, minutes: 0, intensity: "recovery", sessionType: "recovery", reason: "Ruhetag: nur lockeres Auslaufen/Dehnung" };
      case "recovery":
        return { day, minutes, intensity: "recovery", sessionType: "recovery", reason: "Aktive Regeneration" };
      case "game_day":
        return { day, minutes, intensity: "light", sessionType: "game", reason: "Spieltag: leichtes Warm-up" };
      case "game_training":
         return { day, minutes, intensity: "light", sessionType: "game-training", reason: "Spieltraining: 15 Min vorab + 30 Min Nachgang" };
      case "basketball_training":
        return {
          day,
          minutes,
          intensity: minutes >= 60 ? "high" : "medium",
          sessionType: "basketball",
          reason: `${input.position.toUpperCase()} • ${input.playStyle}`,
        };
      case "gym":
        return {
          day,
          minutes,
          intensity: minutes >= 60 ? "high" : "medium",
          sessionType: "gym",
          reason: "Gym-Fokus",
        };
      case "custom":
      default:
        return { day, minutes, intensity: "medium", sessionType: "custom", reason: "Benutzerdefiniert" };
    }
  });
}

export function getNextDateForDay(day: DayKey, fromDate = new Date()) {
  const currentDayIndex = fromDate.getDay();
  const targetDayIndex = DAY_TO_INDEX[day];
  const difference = (targetDayIndex - currentDayIndex + 7) % 7;
  const result = new Date(fromDate);
  result.setHours(0, 0, 0, 0);
  result.setDate(fromDate.getDate() + difference);
  return result;
}

export function getDaysStartingToday(fromDate = new Date()): DayKey[] {
  const currentDayIndex = fromDate.getDay();
  const orderedDays = [...DAYS].sort(
    (left, right) =>
      ((DAY_TO_INDEX[left] - currentDayIndex + 7) % 7) -
      ((DAY_TO_INDEX[right] - currentDayIndex + 7) % 7),
  );

  return orderedDays;
}