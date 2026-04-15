import { getWorkoutSessions } from "@/lib/session-storage";
import { toLocalDateKey } from "@/lib/workout";

export const DAILY_PLAN_KEY = "bt.daily-plan.v1";
export const MANUAL_DAY_WORKOUTS_KEY = "bt.manual-day-workouts.v1";
export const MANUAL_DAY_DISABLED_KEY = "bt.manual-day-disabled.v1";

export type PlannedWorkoutTag =
  | "Spieltag"
  | "Trainingstag"
  | "Spieltraining"
  | "Gym"
  | "Home-Workout"
  | "Regeneration";

export type DailyPlanMap = Record<string, PlannedWorkoutTag[]>;

export function readDailyPlanMap(): DailyPlanMap {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(DAILY_PLAN_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as DailyPlanMap;
  } catch {
    return {};
  }
}

export function writeDailyPlanMap(value: DailyPlanMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DAILY_PLAN_KEY, JSON.stringify(value));
}

export function readManualWorkoutsByDate() {
  if (typeof window === "undefined") return {} as Record<string, unknown[]>;
  const raw = window.localStorage.getItem(MANUAL_DAY_WORKOUTS_KEY);
  if (!raw) return {} as Record<string, unknown[]>;
  try {
    return JSON.parse(raw) as Record<string, unknown[]>;
  } catch {
    return {} as Record<string, unknown[]>;
  }
}

export function getCompletedWorkoutDateSet() {
  const sessions = getWorkoutSessions();
  return new Set(sessions.map((session) => toLocalDateKey(new Date(session.dateISO))));
}

export function readManualDayDisabledMap() {
  if (typeof window === "undefined") return {} as Record<string, boolean>;
  const raw = window.localStorage.getItem(MANUAL_DAY_DISABLED_KEY);
  if (!raw) return {} as Record<string, boolean>;
  try {
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {} as Record<string, boolean>;
  }
}

export function writeManualDayDisabledMap(value: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MANUAL_DAY_DISABLED_KEY, JSON.stringify(value));
}