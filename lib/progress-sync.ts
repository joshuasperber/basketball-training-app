import {
  DAILY_PLAN_KEY,
  MANUAL_DAY_DISABLED_KEY,
  MANUAL_DAY_WORKOUTS_KEY,
  type DailyPlanMap,
} from "@/lib/activity-calendar";
import { getExerciseHistoryMap, getWorkoutSessions } from "@/lib/session-storage";
import { SessionDatabase } from "@/lib/session-types";

const EXERCISE_HISTORY_KEY = "bt.exercise-history.v1";
const WORKOUT_SESSIONS_KEY = "bt.workout-sessions.v1";
const PROFILE_LOCAL_CACHE_KEY = "profile_cache_v4";
const XP_HISTORY_KEY = "bt.xp-history.v1";
const XP_PROGRESSION_KEY = "bt.progression.v1";
const HIDDEN_AUTO_WORKOUTS_KEY = "bt.hidden-auto-workouts.v1";

type RemoteProgress = {
  sessions: SessionDatabase;
  dailyPlanMap: DailyPlanMap;
  manualDayWorkoutsMap: Record<string, unknown[]>;
  manualDayDisabledMap: Record<string, boolean>;
  profileCache: string | null;
  xpHistory: string | null;
  xpProgression: string | null;
  hiddenAutoWorkoutsMap: Record<string, string[]>;
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
    profileCache: readRawString(PROFILE_LOCAL_CACHE_KEY),
    xpHistory: readRawString(XP_HISTORY_KEY),
    xpProgression: readRawString(XP_PROGRESSION_KEY),
    hiddenAutoWorkoutsMap: readLocalJsonMap<Record<string, string[]>>(HIDDEN_AUTO_WORKOUTS_KEY, {}),
  };
}

export function applyRemoteProgressToLocal(remote: RemoteProgress) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKOUT_SESSIONS_KEY, JSON.stringify(remote.sessions.workoutSessions ?? []));
  window.localStorage.setItem(EXERCISE_HISTORY_KEY, JSON.stringify(remote.sessions.exerciseHistory ?? {}));
  window.localStorage.setItem(DAILY_PLAN_KEY, JSON.stringify(remote.dailyPlanMap ?? {}));
  window.localStorage.setItem(MANUAL_DAY_WORKOUTS_KEY, JSON.stringify(remote.manualDayWorkoutsMap ?? {}));
  window.localStorage.setItem(MANUAL_DAY_DISABLED_KEY, JSON.stringify(remote.manualDayDisabledMap ?? {}));
  window.localStorage.setItem(HIDDEN_AUTO_WORKOUTS_KEY, JSON.stringify(remote.hiddenAutoWorkoutsMap ?? {}));
  if (remote.profileCache) {
    window.localStorage.setItem(PROFILE_LOCAL_CACHE_KEY, remote.profileCache);
  }
  if (remote.xpHistory) {
    window.localStorage.setItem(XP_HISTORY_KEY, remote.xpHistory);
  }
  if (remote.xpProgression) {
    window.localStorage.setItem(XP_PROGRESSION_KEY, remote.xpProgression);
  }
}

export async function pullProgressFromCloud() {
  const response = await fetch("/api/session", { cache: "no-store" });
  if (!response.ok) return null;
  const remote = (await response.json()) as RemoteProgress;
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
