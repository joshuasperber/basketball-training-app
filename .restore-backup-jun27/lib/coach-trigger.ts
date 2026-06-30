import type { DayKey, DayMode, WeekConfig } from "@/lib/planner";

const DAY_KEYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const BASKETBALL_MODES: DayMode[] = ["game_day", "game_training", "basketball_training"];
const GYM_MODES: DayMode[] = ["gym"];

export const COACH_LLM_WEEK_KEY = "bt.coach.llm.weekly.weekKey";
export const COACH_LLM_CONFIG_SIG_KEY = "bt.coach.llm.weekly.configSig";
export const COACH_LLM_COACHING_CACHE_KEY = "bt.coach.llm.coaching.cache";

/** ISO-Kalenderwoche (Montag = Wochenstart). */
export function getIsoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function weekConfigSignature(
  week: Partial<Record<DayKey, { mode: string; minutes: number }>> | WeekConfig | undefined,
): string {
  if (!week) return "";
  return DAY_KEYS.map((day) => {
    const row = week[day];
    const mode = row?.mode ?? "unavailable";
    const minutes = row?.minutes ?? 0;
    return `${day}:${mode}:${minutes}`;
  }).join("|");
}

type FocusProfile = { basketball: number; gym: number; game: number; recovery: number };

function focusProfile(week: Partial<Record<DayKey, { mode: string }>>): FocusProfile {
  const profile: FocusProfile = { basketball: 0, gym: 0, game: 0, recovery: 0 };
  for (const day of DAY_KEYS) {
    const mode = (week[day]?.mode ?? "unavailable") as DayMode;
    if (mode === "game_day" || mode === "game_training") profile.game += 1;
    if (BASKETBALL_MODES.includes(mode)) profile.basketball += 1;
    if (GYM_MODES.includes(mode)) profile.gym += 1;
    if (mode === "recovery" || mode === "rest") profile.recovery += 1;
  }
  return profile;
}

function dominantFocus(profile: FocusProfile): "basketball" | "gym" | "mixed" | "light" {
  const total = profile.basketball + profile.gym + profile.game;
  if (total <= 2) return "light";
  if (profile.basketball >= profile.gym + 2) return "basketball";
  if (profile.gym >= profile.basketball + 2) return "gym";
  return "mixed";
}

/** Starke Planänderung: Spieltag, Fokuswechsel Gym↔Basketball, viele Modus-Wechsel. */
export function isSignificantWeekConfigChange(
  before: string,
  after: string,
  beforeWeek?: Partial<Record<DayKey, { mode: string; minutes: number }>>,
  afterWeek?: Partial<Record<DayKey, { mode: string; minutes: number }>>,
): boolean {
  if (!before || !after || before === after) return false;

  if (beforeWeek && afterWeek) {
    let modeChanges = 0;
    let gameDelta = 0;
    for (const day of DAY_KEYS) {
      const a = beforeWeek[day]?.mode ?? "unavailable";
      const b = afterWeek[day]?.mode ?? "unavailable";
      if (a !== b) modeChanges += 1;
      const aGame = a === "game_day" || a === "game_training";
      const bGame = b === "game_day" || b === "game_training";
      if (aGame !== bGame) gameDelta += 1;
    }
    if (gameDelta > 0) return true;
    if (modeChanges >= 3) return true;

    const beforeFocus = dominantFocus(focusProfile(beforeWeek));
    const afterFocus = dominantFocus(focusProfile(afterWeek));
    if (
      beforeFocus !== afterFocus &&
      beforeFocus !== "light" &&
      afterFocus !== "light" &&
      (beforeFocus === "basketball" || beforeFocus === "gym") &&
      (afterFocus === "basketball" || afterFocus === "gym")
    ) {
      return true;
    }
  }

  return false;
}

export function loadWeekConfigFromProfileCache(): Partial<Record<DayKey, { mode: string; minutes: number }>> | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem("profile_cache_v4");
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { weekConfig?: Partial<Record<DayKey, { mode: string; minutes: number }>> };
    return parsed.weekConfig;
  } catch {
    return undefined;
  }
}

export function readCoachLlmWeekKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(COACH_LLM_WEEK_KEY);
  } catch {
    return null;
  }
}

export function writeCoachLlmWeeklyMarkers(weekKey: string, configSig: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COACH_LLM_WEEK_KEY, weekKey);
    window.localStorage.setItem(COACH_LLM_CONFIG_SIG_KEY, configSig);
  } catch {
    /* ignore */
  }
}

export function shouldAutoRunWeeklyPlanLlm(): { run: boolean; reason?: "new_week" | "plan_change" } {
  if (typeof window === "undefined") return { run: false };

  const weekKey = getIsoWeekKey();
  const lastWeekKey = readCoachLlmWeekKey();
  const currentWeek = loadWeekConfigFromProfileCache();
  const currentSig = weekConfigSignature(currentWeek);

  if (lastWeekKey && lastWeekKey !== weekKey) {
    return { run: true, reason: "new_week" };
  }

  let lastSig: string | null = null;
  try {
    lastSig = window.localStorage.getItem(COACH_LLM_CONFIG_SIG_KEY);
  } catch {
    lastSig = null;
  }

  if (lastSig && lastSig !== currentSig && currentWeek) {
    let beforeWeek: Partial<Record<DayKey, { mode: string; minutes: number }>> | undefined;
    const parts = lastSig.split("|");
    beforeWeek = {};
    for (const part of parts) {
      const [day, mode, minutes] = part.split(":");
      if (day && mode) {
        beforeWeek[day as DayKey] = { mode, minutes: Number(minutes) || 0 };
      }
    }
    if (isSignificantWeekConfigChange(lastSig, currentSig, beforeWeek, currentWeek)) {
      return { run: true, reason: "plan_change" };
    }
  }

  if (!lastWeekKey) {
    writeCoachLlmWeeklyMarkers(weekKey, currentSig);
  }

  return { run: false };
}
