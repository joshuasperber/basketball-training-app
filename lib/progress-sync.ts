import {
  DAILY_PLAN_KEY,
  MANUAL_DAY_DISABLED_KEY,
  MANUAL_DAY_WORKOUTS_KEY,
  MANUAL_PLAN_OVERRIDES_KEY,
  WEEKLY_REGEN_SLOT_MAP_KEY,
  type DailyPlanMap,
} from "@/lib/activity-calendar";
import { PLAYER_INTAKE_STORAGE_KEY, PLAYER_INTAKE_UPDATED_EVENT } from "@/lib/coach-intake";
import { GAME_STATS_KEY } from "@/lib/game-stats";
import { getExerciseHistoryMap, getWorkoutSessions } from "@/lib/session-storage";
import { TRAINING_GOALS_STORAGE_KEY } from "@/lib/training-goals";
import { SessionDatabase } from "@/lib/session-types";

const EXERCISE_HISTORY_KEY = "bt.exercise-history.v1";
const WORKOUT_SESSIONS_KEY = "bt.workout-sessions.v1";
const PROFILE_LOCAL_CACHE_KEY = "profile_cache_v4";
const PROFILE_USERNAME_KEY = "profile_username";
const XP_HISTORY_KEY = "bt.xp-history.v1";
const XP_PROGRESSION_KEY = "bt.progression.v1";
const HIDDEN_AUTO_WORKOUTS_KEY = "bt.hidden-auto-workouts.v1";
const PERFORMANCE_TIPS_KEY = "bt.performance-tips.v1";
const CUSTOM_SUBCATEGORY_KEY = "bt.custom-subcategories.v1";
const WORKOUT_HISTORY_KEY = "bt.workout-history.v1";
const REMINDER_PREFS_KEY = "bt.workout-reminders.v1";
const COACH_WEEKLY_NOTE_STORAGE_KEY = "bt.coach-weekly-context";

type RemoteProgress = {
  sessions: SessionDatabase;
  dailyPlanMap: DailyPlanMap;
  manualDayWorkoutsMap: Record<string, unknown[]>;
  manualDayDisabledMap: Record<string, boolean>;
  manualPlanOverrides: string | null;
  weeklyRegenSlotMap: Record<string, boolean>;
  profileCache: string | null;
  profileUsername: string | null;
  playerIntake: string | null;
  xpHistory: string | null;
  xpProgression: string | null;
  hiddenAutoWorkoutsMap: Record<string, string[]>;
  performanceTips: string | null;
  gameStats: string | null;
  trainingGoals: string | null;
  customSubcategories: string | null;
  workoutHistory: string | null;
  reminderPrefs: string | null;
  coachWeeklyNote: string | null;
  remoteExists?: boolean;
};

function readLocalDailyPlanMap(): DailyPlanMap {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(DAILY_PLAN_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as DailyPlanMap;
  } catch {
    return {};
  }
}

function readRawString(key: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

function readLocalJsonMap<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function buildLocalProgressSnapshot(): RemoteProgress {
  return {
    sessions: {
      workoutSessions: getWorkoutSessions(),
      exerciseHistory: getExerciseHistoryMap(),
    },
    dailyPlanMap: readLocalDailyPlanMap(),
    manualDayWorkoutsMap: readLocalJsonMap<Record<string, unknown[]>>(MANUAL_DAY_WORKOUTS_KEY, {}),
    manualDayDisabledMap: readLocalJsonMap<Record<string, boolean>>(MANUAL_DAY_DISABLED_KEY, {}),
    manualPlanOverrides: readRawString(MANUAL_PLAN_OVERRIDES_KEY),
    weeklyRegenSlotMap: readLocalJsonMap<Record<string, boolean>>(WEEKLY_REGEN_SLOT_MAP_KEY, {}),
    profileCache: readRawString(PROFILE_LOCAL_CACHE_KEY),
    profileUsername: readRawString(PROFILE_USERNAME_KEY),
    playerIntake: readRawString(PLAYER_INTAKE_STORAGE_KEY),
    xpHistory: readRawString(XP_HISTORY_KEY),
    xpProgression: readRawString(XP_PROGRESSION_KEY),
    hiddenAutoWorkoutsMap: readLocalJsonMap<Record<string, string[]>>(HIDDEN_AUTO_WORKOUTS_KEY, {}),
    performanceTips: readRawString(PERFORMANCE_TIPS_KEY),
    gameStats: readRawString(GAME_STATS_KEY),
    trainingGoals: readRawString(TRAINING_GOALS_STORAGE_KEY),
    customSubcategories: readRawString(CUSTOM_SUBCATEGORY_KEY),
    workoutHistory: readRawString(WORKOUT_HISTORY_KEY),
    reminderPrefs: readRawString(REMINDER_PREFS_KEY),
    coachWeeklyNote: readRawString(COACH_WEEKLY_NOTE_STORAGE_KEY),
  };
}

function hasLocalUserData(snapshot: RemoteProgress) {
  return (
    (snapshot.sessions.workoutSessions?.length ?? 0) > 0 ||
    Object.keys(snapshot.sessions.exerciseHistory ?? {}).length > 0 ||
    Object.keys(snapshot.dailyPlanMap ?? {}).length > 0 ||
    Object.keys(snapshot.manualDayWorkoutsMap ?? {}).length > 0 ||
    Object.keys(snapshot.manualDayDisabledMap ?? {}).length > 0 ||
    Boolean(snapshot.manualPlanOverrides) ||
    Object.keys(snapshot.weeklyRegenSlotMap ?? {}).length > 0 ||
    Object.keys(snapshot.hiddenAutoWorkoutsMap ?? {}).length > 0 ||
    Boolean(snapshot.profileCache) ||
    Boolean(snapshot.profileUsername) ||
    Boolean(snapshot.playerIntake) ||
    Boolean(snapshot.xpHistory) ||
    Boolean(snapshot.xpProgression) ||
    Boolean(snapshot.performanceTips) ||
    Boolean(snapshot.gameStats) ||
    Boolean(snapshot.trainingGoals) ||
    Boolean(snapshot.customSubcategories) ||
    Boolean(snapshot.workoutHistory) ||
    Boolean(snapshot.reminderPrefs) ||
    Boolean(snapshot.coachWeeklyNote)
  );
}

function writeRawStringIfPresent(key: string, value: string | null | undefined) {
  if (value == null) return;
  window.localStorage.setItem(key, value);
}

function mergeLocalMap<T extends Record<string, unknown>>(key: string, remote: T | null | undefined, fallback: T): T {
  const local = readLocalJsonMap<T>(key, fallback);
  return { ...local, ...(remote ?? fallback) };
}

export function applyRemoteProgressToLocal(remote: RemoteProgress) {
  if (typeof window === "undefined") return;
  const localSessions = getWorkoutSessions();
  const mergedSessions = [...localSessions];
  const seenSessionIds = new Set(localSessions.map((session) => session.id));
  for (const session of remote.sessions.workoutSessions ?? []) {
    if (!seenSessionIds.has(session.id)) mergedSessions.push(session);
  }
  window.localStorage.setItem(WORKOUT_SESSIONS_KEY, JSON.stringify(mergedSessions));
  window.localStorage.setItem(EXERCISE_HISTORY_KEY, JSON.stringify(mergeLocalMap(EXERCISE_HISTORY_KEY, remote.sessions.exerciseHistory ?? {}, {})));
  window.localStorage.setItem(DAILY_PLAN_KEY, JSON.stringify(mergeLocalMap(DAILY_PLAN_KEY, remote.dailyPlanMap, {})));
  window.localStorage.setItem(MANUAL_DAY_WORKOUTS_KEY, JSON.stringify(mergeLocalMap(MANUAL_DAY_WORKOUTS_KEY, remote.manualDayWorkoutsMap, {})));
  window.localStorage.setItem(MANUAL_DAY_DISABLED_KEY, JSON.stringify(mergeLocalMap(MANUAL_DAY_DISABLED_KEY, remote.manualDayDisabledMap, {})));
  writeRawStringIfPresent(MANUAL_PLAN_OVERRIDES_KEY, remote.manualPlanOverrides);
  window.localStorage.setItem(WEEKLY_REGEN_SLOT_MAP_KEY, JSON.stringify(mergeLocalMap(WEEKLY_REGEN_SLOT_MAP_KEY, remote.weeklyRegenSlotMap, {})));
  window.localStorage.setItem(HIDDEN_AUTO_WORKOUTS_KEY, JSON.stringify(mergeLocalMap(HIDDEN_AUTO_WORKOUTS_KEY, remote.hiddenAutoWorkoutsMap, {})));
  writeRawStringIfPresent(PROFILE_LOCAL_CACHE_KEY, remote.profileCache);
  writeRawStringIfPresent(PROFILE_USERNAME_KEY, remote.profileUsername);
  writeRawStringIfPresent(PLAYER_INTAKE_STORAGE_KEY, remote.playerIntake);
  writeRawStringIfPresent(XP_HISTORY_KEY, remote.xpHistory);
  writeRawStringIfPresent(XP_PROGRESSION_KEY, remote.xpProgression);
  writeRawStringIfPresent(PERFORMANCE_TIPS_KEY, remote.performanceTips);
  writeRawStringIfPresent(GAME_STATS_KEY, remote.gameStats);
  writeRawStringIfPresent(TRAINING_GOALS_STORAGE_KEY, remote.trainingGoals);
  writeRawStringIfPresent(CUSTOM_SUBCATEGORY_KEY, remote.customSubcategories);
  writeRawStringIfPresent(WORKOUT_HISTORY_KEY, remote.workoutHistory);
  writeRawStringIfPresent(REMINDER_PREFS_KEY, remote.reminderPrefs);
  writeRawStringIfPresent(COACH_WEEKLY_NOTE_STORAGE_KEY, remote.coachWeeklyNote);
  window.dispatchEvent(new Event("bt:plan-updated"));
  window.dispatchEvent(new Event(PLAYER_INTAKE_UPDATED_EVENT));
  if (remote.trainingGoals) {
    window.dispatchEvent(new Event("bt:training-goals-updated"));
  }
}

export async function pullProgressFromCloud() {
  const response = await fetch("/api/session", { cache: "no-store" });
  if (!response.ok) return null;
  const remote = (await response.json()) as RemoteProgress;
  if (remote.remoteExists === false) {
    const local = buildLocalProgressSnapshot();
    if (hasLocalUserData(local)) {
      await pushProgressToCloud();
      return local;
    }
  }
  applyRemoteProgressToLocal(remote);
  return remote;
}

export async function pushProgressToCloud() {
  const snapshot = buildLocalProgressSnapshot();
  await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });
}
