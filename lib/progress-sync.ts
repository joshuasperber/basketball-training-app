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
import { LEAGUE_STORAGE_KEY } from "@/lib/league";
import { checkAuthSession } from "@/lib/auth-session-align";
import { getWorkoutSessions } from "@/lib/session-storage";
import { buildWorkoutSessionsForCloud } from "@/lib/workout-sessions-cloud";
import { TRAINING_GOALS_STORAGE_KEY } from "@/lib/training-goals";
import { REMINDER_PREFS_KEY } from "@/lib/workout-reminders";
import { SessionDatabase } from "@/lib/session-types";
import { WORKOUT_HISTORY_KEY as LEGACY_WORKOUT_HISTORY_KEY, WORKOUT_OVERRIDE_PREFIX } from "@/lib/workout";

const EXERCISE_HISTORY_KEY = "bt.exercise-history.v1";
const WORKOUT_SESSIONS_KEY = "bt.workout-sessions.v1";
const PROFILE_LOCAL_CACHE_KEY = "profile_cache_v4";
const PROFILE_USERNAME_KEY = "profile_username";
const PROFILE_WEEK_CONFIG_KEY = "bt.profile-week-config.v1";
const XP_HISTORY_KEY = "bt.xp-history.v1";
const XP_PROGRESSION_KEY = "bt.progression.v1";
const HIDDEN_AUTO_WORKOUTS_KEY = "bt.hidden-auto-workouts.v1";
const PERFORMANCE_TIPS_KEY = "bt.performance-tips.v1";
const CUSTOM_SUBCATEGORY_KEY = "bt.custom-subcategories.v1";
const WORKOUT_HISTORY_KEY = "bt.workout-history.v1";
const LEGACY_REMINDER_PREFS_KEY = "bt.workout-reminders.v1";
const COACH_WEEKLY_NOTE_STORAGE_KEY = "bt.coach-weekly-context";
const TRAINING_EXERCISES_KEY = "training-exercises-v1";
const TRAINING_WORKOUTS_KEY = "training-workouts-v1";

type RemoteProgress = {
  sessions: SessionDatabase;
  dailyPlanMap: DailyPlanMap;
  manualDayWorkoutsMap: Record<string, unknown[]>;
  manualDayDisabledMap: Record<string, boolean>;
  manualPlanOverrides: string | null;
  weeklyRegenSlotMap: Record<string, boolean>;
  profileCache: string | null;
  profileUsername: string | null;
  profileWeekConfig: string | null;
  playerIntake: string | null;
  xpHistory: string | null;
  xpProgression: string | null;
  hiddenAutoWorkoutsMap: Record<string, string[]>;
  performanceTips: string | null;
  gameStats: string | null;
  leagueData: string | null;
  trainingGoals: string | null;
  customSubcategories: string | null;
  workoutHistory: string | null;
  reminderPrefs: string | null;
  coachWeeklyNote: string | null;
  trainingExercises: string | null;
  trainingWorkouts: string | null;
  workoutOverrides: Record<string, string>;
  remoteExists?: boolean;
  remoteUpdatedAt?: string | null;
};

export type RemoteProgressPayload = RemoteProgress;

const CLOUD_UPDATED_AT_KEY = "bt.cloud-updated-at.v1";

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

function readWorkoutOverrides(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const overrides: Record<string, string> = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(WORKOUT_OVERRIDE_PREFIX)) continue;
    const dateKey = key.slice(WORKOUT_OVERRIDE_PREFIX.length);
    const workoutId = window.localStorage.getItem(key);
    if (dateKey && workoutId) overrides[dateKey] = workoutId;
  }
  return overrides;
}

function readReminderPrefsRaw() {
  return readRawString(REMINDER_PREFS_KEY) ?? readRawString(LEGACY_REMINDER_PREFS_KEY);
}

// #region agent log
function agentDebugLog(hypothesisId: string, message: string, data: Record<string, unknown>) {
  void hypothesisId;
  void message;
  void data;
}
// #endregion

export function buildLocalProgressSnapshot(): RemoteProgress {
  return {
    sessions: buildWorkoutSessionsForCloud(),
    dailyPlanMap: readLocalDailyPlanMap(),
    manualDayWorkoutsMap: readLocalJsonMap<Record<string, unknown[]>>(MANUAL_DAY_WORKOUTS_KEY, {}),
    manualDayDisabledMap: readLocalJsonMap<Record<string, boolean>>(MANUAL_DAY_DISABLED_KEY, {}),
    manualPlanOverrides: readRawString(MANUAL_PLAN_OVERRIDES_KEY),
    weeklyRegenSlotMap: readLocalJsonMap<Record<string, boolean>>(WEEKLY_REGEN_SLOT_MAP_KEY, {}),
    profileCache: readRawString(PROFILE_LOCAL_CACHE_KEY),
    profileUsername: readRawString(PROFILE_USERNAME_KEY),
    profileWeekConfig: readRawString(PROFILE_WEEK_CONFIG_KEY),
    playerIntake: readRawString(PLAYER_INTAKE_STORAGE_KEY),
    xpHistory: readRawString(XP_HISTORY_KEY),
    xpProgression: readRawString(XP_PROGRESSION_KEY),
    hiddenAutoWorkoutsMap: readLocalJsonMap<Record<string, string[]>>(HIDDEN_AUTO_WORKOUTS_KEY, {}),
    performanceTips: readRawString(PERFORMANCE_TIPS_KEY),
    gameStats: readRawString(GAME_STATS_KEY),
    leagueData: readRawString(LEAGUE_STORAGE_KEY),
    trainingGoals: readRawString(TRAINING_GOALS_STORAGE_KEY),
    customSubcategories: readRawString(CUSTOM_SUBCATEGORY_KEY),
    workoutHistory: readRawString(WORKOUT_HISTORY_KEY) ?? readRawString(LEGACY_WORKOUT_HISTORY_KEY),
    reminderPrefs: readReminderPrefsRaw(),
    coachWeeklyNote: readRawString(COACH_WEEKLY_NOTE_STORAGE_KEY),
    trainingExercises: readRawString(TRAINING_EXERCISES_KEY),
    trainingWorkouts: readRawString(TRAINING_WORKOUTS_KEY),
    workoutOverrides: readWorkoutOverrides(),
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
    Boolean(snapshot.profileWeekConfig) ||
    Boolean(snapshot.playerIntake) ||
    Boolean(snapshot.xpHistory) ||
    Boolean(snapshot.xpProgression) ||
    Boolean(snapshot.performanceTips) ||
    Boolean(snapshot.gameStats) ||
    Boolean(snapshot.leagueData) ||
    Boolean(snapshot.trainingGoals) ||
    Boolean(snapshot.customSubcategories) ||
    Boolean(snapshot.workoutHistory) ||
    Boolean(snapshot.reminderPrefs) ||
    Boolean(snapshot.coachWeeklyNote) ||
    Boolean(snapshot.trainingExercises) ||
    Boolean(snapshot.trainingWorkouts) ||
    Object.keys(snapshot.workoutOverrides ?? {}).length > 0
  );
}

function writeRawStringIfPresent(key: string, value: string | null | undefined) {
  if (value == null) return;
  window.localStorage.setItem(key, value);
}

function mergeProfileCacheFromRemote(remoteCache: string | null | undefined) {
  if (!remoteCache || typeof window === "undefined") return;
  const localRaw = window.localStorage.getItem(PROFILE_LOCAL_CACHE_KEY);
  if (!localRaw) {
    window.localStorage.setItem(PROFILE_LOCAL_CACHE_KEY, remoteCache);
    return;
  }
  try {
    const local = JSON.parse(localRaw) as {
      profile?: {
        username?: string | null;
        full_name?: string | null;
        favorite_position?: string | null;
        height_cm?: number | null;
        weight_kg?: number | null;
        email?: string | null;
      };
      playStyle?: string;
      weekConfig?: unknown;
      weeklyGoalSessions?: number;
      bodyMetrics?: {
        wingspan_cm?: number | null;
        standing_reach_cm?: number | null;
        body_fat_pct?: number | null;
      };
    };
    const remote = JSON.parse(remoteCache) as typeof local;
    const merged = {
      ...remote,
      ...local,
      profile: {
        ...remote.profile,
        ...local.profile,
        username: local.profile?.username || remote.profile?.username || "",
        full_name: local.profile?.full_name || remote.profile?.full_name || "",
        favorite_position: local.profile?.favorite_position ?? remote.profile?.favorite_position ?? "sg",
        height_cm: local.profile?.height_cm ?? remote.profile?.height_cm ?? null,
        weight_kg: local.profile?.weight_kg ?? remote.profile?.weight_kg ?? null,
        email: local.profile?.email ?? remote.profile?.email ?? null,
      },
      playStyle: local.playStyle || remote.playStyle || "Shooter",
      weekConfig: local.weekConfig ?? remote.weekConfig,
      weeklyGoalSessions: local.weeklyGoalSessions ?? remote.weeklyGoalSessions ?? 4,
      bodyMetrics: local.bodyMetrics ?? remote.bodyMetrics,
    };
    window.localStorage.setItem(PROFILE_LOCAL_CACHE_KEY, JSON.stringify(merged));
  } catch {
    window.localStorage.setItem(PROFILE_LOCAL_CACHE_KEY, remoteCache);
  }
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
  mergeProfileCacheFromRemote(remote.profileCache);
  writeRawStringIfPresent(PROFILE_USERNAME_KEY, remote.profileUsername);
  writeRawStringIfPresent(PROFILE_WEEK_CONFIG_KEY, remote.profileWeekConfig);
  writeRawStringIfPresent(PLAYER_INTAKE_STORAGE_KEY, remote.playerIntake);
  writeRawStringIfPresent(XP_HISTORY_KEY, remote.xpHistory);
  writeRawStringIfPresent(XP_PROGRESSION_KEY, remote.xpProgression);
  writeRawStringIfPresent(PERFORMANCE_TIPS_KEY, remote.performanceTips);
  writeRawStringIfPresent(GAME_STATS_KEY, remote.gameStats);
  writeRawStringIfPresent(LEAGUE_STORAGE_KEY, remote.leagueData);
  writeRawStringIfPresent(TRAINING_GOALS_STORAGE_KEY, remote.trainingGoals);
  writeRawStringIfPresent(CUSTOM_SUBCATEGORY_KEY, remote.customSubcategories);
  writeRawStringIfPresent(WORKOUT_HISTORY_KEY, remote.workoutHistory);
  writeRawStringIfPresent(REMINDER_PREFS_KEY, remote.reminderPrefs);
  writeRawStringIfPresent(COACH_WEEKLY_NOTE_STORAGE_KEY, remote.coachWeeklyNote);
  writeRawStringIfPresent(TRAINING_EXERCISES_KEY, remote.trainingExercises);
  writeRawStringIfPresent(TRAINING_WORKOUTS_KEY, remote.trainingWorkouts);
  for (const [dateKey, workoutId] of Object.entries(remote.workoutOverrides ?? {})) {
    window.localStorage.setItem(`${WORKOUT_OVERRIDE_PREFIX}${dateKey}`, workoutId);
  }
  window.dispatchEvent(new Event("bt:plan-updated"));
  window.dispatchEvent(new Event(PLAYER_INTAKE_UPDATED_EVENT));
  if (remote.trainingGoals) {
    window.dispatchEvent(new Event("bt:training-goals-updated"));
  }
}

let initialCloudSyncPromise: Promise<RemoteProgress | null> | null = null;

/** Einmaliger Cloud-Pull beim App-Start — verhindert doppelte parallele Requests. */
export function ensureInitialCloudSync(): Promise<RemoteProgress | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!initialCloudSyncPromise) {
    initialCloudSyncPromise = pullProgressFromCloud().finally(() => {
      initialCloudSyncPromise = null;
    });
  }
  return initialCloudSyncPromise;
}

export async function pullProgressFromCloud() {
  const { me } = await checkAuthSession();
  if (!me) return null;
  const response = await fetch("/api/session", { cache: "no-store", credentials: "same-origin" });
  // #region agent log
  agentDebugLog("H1,H2", "pull progress response", { ok: response.ok, status: response.status });
  // #endregion
  if (!response.ok) return null;
  const remote = (await response.json()) as RemoteProgress;
  if (remote.remoteUpdatedAt) {
    window.localStorage.setItem(CLOUD_UPDATED_AT_KEY, remote.remoteUpdatedAt);
  }
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

export async function pushProgressToCloud(overrides?: Partial<RemoteProgress>): Promise<boolean> {
  const { me, accountSwitched } = await checkAuthSession();
  if (!me) return false;
  if (accountSwitched) {
    await pullProgressFromCloud();
  }

  const snapshot = { ...buildLocalProgressSnapshot(), ...overrides };
  const clientKnownRemoteUpdatedAt = window.localStorage.getItem(CLOUD_UPDATED_AT_KEY);
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      ...snapshot,
      clientKnownRemoteUpdatedAt,
    }),
  });
  if (response.status === 409) {
    const conflict = (await response.json()) as { remote?: RemoteProgress; remoteUpdatedAt?: string };
    if (conflict.remote && conflict.remoteUpdatedAt) {
      const { dispatchSyncConflict } = await import("@/lib/sync-conflict");
      dispatchSyncConflict({ remote: conflict.remote, remoteUpdatedAt: conflict.remoteUpdatedAt });
    }
    return false;
  }
  if (response.ok) {
    const json = (await response.json()) as { remoteUpdatedAt?: string };
    if (json.remoteUpdatedAt) {
      window.localStorage.setItem(CLOUD_UPDATED_AT_KEY, json.remoteUpdatedAt);
    }
  }
  // #region agent log
  agentDebugLog("H1,H2", "push progress response", {
    ok: response.ok,
    status: response.status,
    sessions: snapshot.sessions.workoutSessions.length,
    manualDays: Object.keys(snapshot.manualDayWorkoutsMap).length,
    dailyPlanDays: Object.keys(snapshot.dailyPlanMap).length,
  });
  // #endregion
  return response.ok;
}

/** Sync mit kurzem Retry — hilft direkt nach Workout-Abschluss. */
export async function pushProgressToCloudWithRetry(attempts = 3): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await pushProgressToCloud()) return true;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  return false;
}
