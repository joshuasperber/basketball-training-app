import { DAILY_PLAN_KEY, type DailyPlanMap } from "@/lib/activity-calendar";
import { getExerciseHistoryMap, getWorkoutSessions } from "@/lib/session-storage";
import { SessionDatabase } from "@/lib/session-types";

const EXERCISE_HISTORY_KEY = "bt.exercise-history.v1";
const WORKOUT_SESSIONS_KEY = "bt.workout-sessions.v1";

type RemoteProgress = {
  sessions: SessionDatabase;
  dailyPlanMap: DailyPlanMap;
};

export function buildLocalProgressSnapshot(): RemoteProgress {
  return {
    sessions: {
      workoutSessions: getWorkoutSessions(),
      exerciseHistory: getExerciseHistoryMap(),
    },
    dailyPlanMap: readLocalDailyPlanMap(),
  };
}

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

export function applyRemoteProgressToLocal(remote: RemoteProgress) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKOUT_SESSIONS_KEY, JSON.stringify(remote.sessions.workoutSessions ?? []));
  window.localStorage.setItem(EXERCISE_HISTORY_KEY, JSON.stringify(remote.sessions.exerciseHistory ?? {}));
  window.localStorage.setItem(DAILY_PLAN_KEY, JSON.stringify(remote.dailyPlanMap ?? {}));
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