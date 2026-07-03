import { checkAuthSession } from "@/lib/auth-session-align";
import { markLocalProgressDirty } from "@/lib/sync-dirty";
import { buildWorkoutSessionsForCloud } from "@/lib/workout-sessions-cloud";
import { WORKOUT_HISTORY_KEY as LEGACY_WORKOUT_HISTORY_KEY } from "@/lib/workout";

const CLOUD_HISTORY_KEY = "bt.workout-history.v1";

function readWorkoutHistoryRaw(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CLOUD_HISTORY_KEY) ?? window.localStorage.getItem(LEGACY_WORKOUT_HISTORY_KEY);
}

export type WorkoutSyncResult = {
  ok: boolean;
  status: number;
  sessionCount: number;
  error?: string;
  detail?: string;
};

/** Nur Workouts in die Cloud — kleiner Payload, überschreibt keine anderen Profil-Felder. */
export async function syncWorkoutSessionsToCloud(): Promise<WorkoutSyncResult> {
  const { me, accountSwitched } = await checkAuthSession();
  if (!me) {
    return { ok: false, status: 401, sessionCount: 0, error: "unauthorized" };
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    markLocalProgressDirty();
    return { ok: false, status: 0, sessionCount: 0, error: "offline" };
  }

  if (accountSwitched) {
    await fetch("/api/session", { cache: "no-store", credentials: "same-origin" });
  }

  const sessions = buildWorkoutSessionsForCloud();
  const response = await fetch("/api/session/workouts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      sessions,
      workoutHistory: readWorkoutHistoryRaw(),
    }),
  });

  const json = (await response.json().catch(() => null)) as {
    ok?: boolean;
    sessionCount?: number;
    error?: string;
    detail?: string;
  } | null;

  const result: WorkoutSyncResult = {
    ok: response.ok,
    status: response.status,
    sessionCount: json?.sessionCount ?? sessions.workoutSessions.length,
    error: json?.error,
    detail: json?.detail,
  };

  if (!result.ok) {
    markLocalProgressDirty();
  }

  return result;
}

export async function syncWorkoutSessionsToCloudWithRetry(attempts = 3): Promise<WorkoutSyncResult> {
  let last: WorkoutSyncResult = { ok: false, status: 0, sessionCount: 0 };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await syncWorkoutSessionsToCloud();
    if (last.ok) return last;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  return last;
}
