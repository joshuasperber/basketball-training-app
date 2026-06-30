import type { DayKey } from "@/lib/planner";
import { getWorkoutSessions } from "@/lib/session-storage";
import { toLocalDateKey } from "@/lib/workout";

export const DAILY_PLAN_KEY = "bt.daily-plan.v1";
export const MANUAL_DAY_WORKOUTS_KEY = "bt.manual-day-workouts.v1";
export const MANUAL_DAY_DISABLED_KEY = "bt.manual-day-disabled.v1";
/** Datums-Keys (yyyy-mm-dd), bei denen der Nutzer den Tagesplan manuell überschrieben hat. */
export const MANUAL_PLAN_OVERRIDES_KEY = "bt.daily-plan-manual-overrides.v1";

/** Weekly: sichtbare Regenerations-Zusatzkarte pro Datum (ISO yyyy-mm-dd) */
export const WEEKLY_REGEN_SLOT_MAP_KEY = "bt.weekly-regen-slot.v1";

/** Auto-Vorschlagskarten, die der Nutzer ersetzt oder ausgeblendet hat. */
export const HIDDEN_AUTO_WORKOUTS_KEY = "bt.hidden-auto-workouts.v1";
export const HIDE_ALL_AUTO_WORKOUTS_ID = "__all_auto_workouts__";

export type HiddenAutoWorkoutsMap = Record<string, string[]>;

export type PlannedWorkoutTag =
  | "Spieltag"
  | "Trainingstag"
  | "Spieltraining"
  | "Gym"
  | "Home-Workout"
  | "Regeneration"
  | `Basketball:${string}`
  | `Gym:${string}`
  | `Home:${string}`
  | `Recovery:${string}`;

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

/** Session-Typ für die Workout-Auswahl aus Kalender-Tags. */
export function sessionTypeFromPlannedTags(tags: PlannedWorkoutTag[]): string | null {
  if (tags.length === 0) return "none";
  if (tags.includes("Spieltag")) return "game";
  if (tags.includes("Spieltraining")) return "game-training";
  if (tags.includes("Trainingstag")) return "basketball";
  if (tags.includes("Gym")) return "gym";
  if (tags.includes("Home-Workout")) return "custom";
  if (tags.includes("Regeneration")) return "recovery";
  return null;
}

/** Kein Training laut Activity Calendar (leeres Tag-Array) oder Profil-Fallback. */
export function calendarBlocksTrainingForDate(
  dateKey: string,
  fallback?: { sessionType?: string; minutes?: number },
): boolean {
  const tags = readDailyPlanMap()[dateKey];
  if (tags !== undefined) return tags.length === 0;
  if (fallback?.sessionType === "none") return true;
  return (fallback?.minutes ?? 0) <= 0;
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

export function readHiddenAutoWorkoutsMap(): HiddenAutoWorkoutsMap {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(HIDDEN_AUTO_WORKOUTS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as HiddenAutoWorkoutsMap;
  } catch {
    return {};
  }
}

export function writeHiddenAutoWorkoutsMap(value: HiddenAutoWorkoutsMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HIDDEN_AUTO_WORKOUTS_KEY, JSON.stringify(value));
}

export function hideAutoWorkoutCardForDate(dateKey: string, cardId: string) {
  const current = readHiddenAutoWorkoutsMap();
  const hiddenForDate = new Set(current[dateKey] ?? []);
  hiddenForDate.add(cardId);
  writeHiddenAutoWorkoutsMap({ ...current, [dateKey]: Array.from(hiddenForDate) });
}

/**
 * Regeneration bereits „auf Weekly“ oder gespeichert: Tags, Profil, Manual, oder sichtbare Recovery-Zusatzkarte.
 */
export function dayHasRegenerationCoverage(dateKey: string): boolean {
  if (storedRegenerationSignals(dateKey)) return true;
  return readWeeklyRegenSlotMap()[dateKey] === true;
}

export function readManualPlanOverrides(): Set<string> {
  if (typeof window === "undefined") return new Set();
  const raw = window.localStorage.getItem(MANUAL_PLAN_OVERRIDES_KEY);
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function writeManualPlanOverrides(set: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MANUAL_PLAN_OVERRIDES_KEY, JSON.stringify(Array.from(set)));
}

export function markDateAsManualOverride(dateKey: string) {
  const set = readManualPlanOverrides();
  set.add(dateKey);
  writeManualPlanOverrides(set);
}

export function clearManualOverrideForDate(dateKey: string) {
  const set = readManualPlanOverrides();
  if (set.delete(dateKey)) writeManualPlanOverrides(set);
}

type DayConfigLike = { mode: string; minutes: number };

function modeToTagsAndDuration(config: DayConfigLike | undefined): { tags: PlannedWorkoutTag[]; minutes: number } {
  if (!config || !config.mode) return { tags: [], minutes: 0 };
  const rawMin = config.minutes;
  const safeMin = typeof rawMin === "number" && Number.isFinite(rawMin) ? Math.max(0, rawMin) : null;
  switch (config.mode) {
    case "unavailable":
    case "rest":
      return { tags: [], minutes: 0 };
    case "basketball_training":
      return { tags: ["Trainingstag", "Basketball:Shooting"], minutes: safeMin ?? 45 };
    case "game_training":
      return { tags: ["Spieltraining"], minutes: safeMin ?? 30 };
    case "game_day":
      return { tags: ["Spieltag"], minutes: safeMin ?? 60 };
    case "gym":
      return { tags: ["Gym"], minutes: safeMin ?? 60 };
    case "custom":
      return { tags: ["Home-Workout"], minutes: safeMin ?? 30 };
    case "recovery":
      return { tags: ["Regeneration"], minutes: safeMin ?? 25 };
    default:
      return { tags: [], minutes: 0 };
  }
}

const DAY_INDEX_TO_KEY: Record<number, DayKey> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Schreibt für die nächsten `horizonDays` Tage Plan-Tags ins dailyPlanMap basierend auf weekConfig.
 * Manuell überschriebene Tage bleiben unverändert. Heutige Datum wird respektiert (keine Vergangenheit).
 */
export function applyWeekConfigToCalendar(
  weekConfig: Partial<Record<DayKey, DayConfigLike>>,
  horizonDays = 21,
): DailyPlanMap {
  if (typeof window === "undefined") return {};
  const manualOverrides = readManualPlanOverrides();
  const currentMap = readDailyPlanMap();
  const next: DailyPlanMap = { ...currentMap };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < horizonDays; i += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dateKey = toDateKey(date);
    if (manualOverrides.has(dateKey)) continue;
    const dayKey = DAY_INDEX_TO_KEY[date.getDay()];
    const cfg = weekConfig[dayKey];
    const { tags } = modeToTagsAndDuration(cfg);
    if (tags.length === 0) {
      delete next[dateKey];
    } else {
      next[dateKey] = tags;
    }
  }
  writeDailyPlanMap(next);
  try {
    window.dispatchEvent(new Event("bt:plan-updated"));
  } catch {
    // noop
  }
  return next;
}