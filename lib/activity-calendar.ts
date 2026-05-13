import type { DayKey } from "@/lib/planner";
import { getWorkoutSessions } from "@/lib/session-storage";
import { toLocalDateKey } from "@/lib/workout";

export const DAILY_PLAN_KEY = "bt.daily-plan.v1";
export const MANUAL_DAY_WORKOUTS_KEY = "bt.manual-day-workouts.v1";
export const MANUAL_DAY_DISABLED_KEY = "bt.manual-day-disabled.v1";

/** Weekly: sichtbare Regenerations-Zusatzkarte pro Datum (ISO yyyy-mm-dd) */
export const WEEKLY_REGEN_SLOT_MAP_KEY = "bt.weekly-regen-slot.v1";

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

function dateKeyToWeekDayKey(dateKey: string): DayKey {
  const parsed = new Date(`${dateKey}T12:00:00`);
  const map: Record<number, DayKey> = {
    0: "sunday",
    1: "monday",
    2: "tuesday",
    3: "wednesday",
    4: "thursday",
    5: "friday",
    6: "saturday",
  };
  const dow = parsed.getDay();
  return map[dow] ?? "monday";
}

/** Profil: Ist dieser Wochentag als Regeneration / Recovery geplant? */
export function profileRecoveryModeForDateKey(dateKey: string): boolean {
  if (typeof window === "undefined") return false;
  const dayKey = dateKeyToWeekDayKey(dateKey);
  const raw = window.localStorage.getItem("profile_cache_v4");
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { weekConfig?: Partial<Record<DayKey, { mode: string }>> };
    return parsed.weekConfig?.[dayKey]?.mode === "recovery";
  } catch {
    return false;
  }
}

type ManualSportEntry = { sport?: string };

/** Tags, Profil-Recovery oder manuelles Regeneration-Workout (ohne Weekly-Zusatzkarte). */
export function storedRegenerationSignals(dateKey: string): boolean {
  if ((readDailyPlanMap()[dateKey] ?? []).includes("Regeneration")) return true;
  if (profileRecoveryModeForDateKey(dateKey)) return true;

  const raw = window.localStorage.getItem(MANUAL_DAY_WORKOUTS_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, ManualSportEntry[]>;
    const entries = parsed[dateKey] ?? [];
    return entries.some((entry) => entry.sport === "Regeneration");
  } catch {
    return false;
  }
}

export function readWeeklyRegenSlotMap(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(WEEKLY_REGEN_SLOT_MAP_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function writeWeeklyRegenSlotMap(map: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WEEKLY_REGEN_SLOT_MAP_KEY, JSON.stringify(map));
}

/**
 * Regeneration bereits „auf Weekly“ oder gespeichert: Tags, Profil, Manual, oder sichtbare Recovery-Zusatzkarte.
 */
export function dayHasRegenerationCoverage(dateKey: string): boolean {
  if (storedRegenerationSignals(dateKey)) return true;
  return readWeeklyRegenSlotMap()[dateKey] === true;
}