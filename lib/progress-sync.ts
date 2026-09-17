import {
  DAILY_PLAN_KEY,
  MANUAL_DAY_DISABLED_KEY,
  MANUAL_DAY_WORKOUTS_KEY,
  MANUAL_PLAN_OVERRIDES_KEY,
  WEEKLY_REGEN_SLOT_MAP_KEY,
  type DailyPlanMap,
} from "@/lib/activity-calendar";
import { PLAYER_INTAKE_STORAGE_KEY, PLAYER_INTAKE_UPDATED_EVENT } from "@/lib/coach-intake";
import { GAME_STATS_KEY, GAME_STATS_UPDATED_EVENT } from "@/lib/game-stats";
import { LEAGUE_STORAGE_KEY, LEAGUE_UPDATED_EVENT } from "@/lib/league";
import { checkAuthSession, ACTIVE_AUTH_EMAIL_KEY } from "@/lib/auth-session-align";
import { clearLocalUserProgress, SYNC_USER_ID_KEY } from "@/lib/clear-local-user-data";
import { isAppOnline } from "@/lib/app-online";
import { createCoalescingAsyncQueue } from "@/lib/coalescing-async-queue";
import { mergeProgressForFirstSync } from "@/lib/first-sync-progress-merge";
import {
  hasConfiguredWeekRhythm,
  hasProfileBasics,
  type ProfileCacheShape,
} from "@/lib/onboarding-gate";
import { clearLocalProgressDirty, isLocalProgressDirty, markLocalProgressDirty } from "@/lib/sync-dirty";
import { buildWorkoutSessionsForCloud } from "@/lib/workout-sessions-cloud";
import { TRAINING_GOALS_STORAGE_KEY } from "@/lib/training-goals";
import { REMINDER_PREFS_KEY } from "@/lib/workout-reminders";
import { READINESS_STORAGE_KEY } from "@/lib/readiness";
import { SessionDatabase } from "@/lib/session-types";
import { dispatchSyncStatus } from "@/lib/sync-status";
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
  readinessHistory: string | null;
  coachWeeklyNote: string | null;
  trainingExercises: string | null;
  trainingWorkouts: string | null;
  workoutOverrides: Record<string, string>;
  remoteExists?: boolean;
  remoteUpdatedAt?: string | null;
};

export type RemoteProgressPayload = RemoteProgress;

const CLOUD_UPDATED_AT_KEY = "bt.cloud-updated-at.v1";
const CLOUD_PULL_TTL_MS = 30_000;

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
    readinessHistory: readRawString(READINESS_STORAGE_KEY),
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
    Boolean(snapshot.readinessHistory) ||
    Boolean(snapshot.coachWeeklyNote) ||
    Boolean(snapshot.trainingExercises) ||
    Boolean(snapshot.trainingWorkouts) ||
    Object.keys(snapshot.workoutOverrides ?? {}).length > 0
  );
}

function writeRemoteString(key: string, value: string | null | undefined) {
  if (value == null) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, value);
}

function parseProfileCache(raw: string | null | undefined): ProfileCacheShape | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProfileCacheShape;
  } catch {
    return null;
  }
}

function profileCacheHasContent(cache: ProfileCacheShape): boolean {
  return Boolean(
    cache.onboardingComplete || hasProfileBasics(cache) || hasConfiguredWeekRhythm(cache),
  );
}

function mergeProfileCacheFromRemote(remoteCache: string | null | undefined) {
  if (typeof window === "undefined") return;
  if (!remoteCache) {
    window.localStorage.removeItem(PROFILE_LOCAL_CACHE_KEY);
    return;
  }

  const remote = parseProfileCache(remoteCache);
  if (!remote || !profileCacheHasContent(remote)) return;
  window.localStorage.setItem(PROFILE_LOCAL_CACHE_KEY, JSON.stringify(remote));
}

export function applyRemoteProgressToLocal(remote: RemoteProgress) {
  if (typeof window === "undefined") return;
  clearLocalProgressDirty();
  const remoteSessions = [...(remote.sessions.workoutSessions ?? [])]
    .sort((left, right) => right.dateISO.localeCompare(left.dateISO))
    .slice(0, 300);
  // Legacy local-only values have already been folded into the one-time
  // first-sync snapshot before this function runs. During ordinary pulls the
  // cloud is authoritative, including deletions made on another device.
  window.localStorage.setItem(WORKOUT_SESSIONS_KEY, JSON.stringify(remoteSessions));
  window.localStorage.setItem(EXERCISE_HISTORY_KEY, JSON.stringify(remote.sessions.exerciseHistory ?? {}));
  window.localStorage.setItem(DAILY_PLAN_KEY, JSON.stringify(remote.dailyPlanMap ?? {}));
  window.localStorage.setItem(MANUAL_DAY_WORKOUTS_KEY, JSON.stringify(remote.manualDayWorkoutsMap ?? {}));
  window.localStorage.setItem(MANUAL_DAY_DISABLED_KEY, JSON.stringify(remote.manualDayDisabledMap ?? {}));
  writeRemoteString(MANUAL_PLAN_OVERRIDES_KEY, remote.manualPlanOverrides);
  window.localStorage.setItem(WEEKLY_REGEN_SLOT_MAP_KEY, JSON.stringify(remote.weeklyRegenSlotMap ?? {}));
  window.localStorage.setItem(HIDDEN_AUTO_WORKOUTS_KEY, JSON.stringify(remote.hiddenAutoWorkoutsMap ?? {}));
  mergeProfileCacheFromRemote(remote.profileCache);
  writeRemoteString(PROFILE_USERNAME_KEY, remote.profileUsername);
  writeRemoteString(PROFILE_WEEK_CONFIG_KEY, remote.profileWeekConfig);
  writeRemoteString(PLAYER_INTAKE_STORAGE_KEY, remote.playerIntake);
  writeRemoteString(XP_HISTORY_KEY, remote.xpHistory);
  writeRemoteString(XP_PROGRESSION_KEY, remote.xpProgression);
  writeRemoteString(PERFORMANCE_TIPS_KEY, remote.performanceTips);
  writeRemoteString(GAME_STATS_KEY, remote.gameStats);
  writeRemoteString(LEAGUE_STORAGE_KEY, remote.leagueData);
  writeRemoteString(TRAINING_GOALS_STORAGE_KEY, remote.trainingGoals);
  writeRemoteString(CUSTOM_SUBCATEGORY_KEY, remote.customSubcategories);
  writeRemoteString(WORKOUT_HISTORY_KEY, remote.workoutHistory);
  writeRemoteString(REMINDER_PREFS_KEY, remote.reminderPrefs);
  writeRemoteString(READINESS_STORAGE_KEY, remote.readinessHistory);
  writeRemoteString(COACH_WEEKLY_NOTE_STORAGE_KEY, remote.coachWeeklyNote);
  writeRemoteString(TRAINING_EXERCISES_KEY, remote.trainingExercises);
  writeRemoteString(TRAINING_WORKOUTS_KEY, remote.trainingWorkouts);
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(WORKOUT_OVERRIDE_PREFIX)) window.localStorage.removeItem(key);
  }
  for (const [dateKey, workoutId] of Object.entries(remote.workoutOverrides ?? {})) {
    window.localStorage.setItem(`${WORKOUT_OVERRIDE_PREFIX}${dateKey}`, workoutId);
  }
  window.dispatchEvent(new CustomEvent("bt:plan-updated", { detail: { source: "remote" } }));
  window.dispatchEvent(new CustomEvent("bt:sessions-updated", { detail: { source: "remote" } }));
  window.dispatchEvent(new CustomEvent(GAME_STATS_UPDATED_EVENT, { detail: { source: "remote" } }));
  window.dispatchEvent(new CustomEvent(PLAYER_INTAKE_UPDATED_EVENT, { detail: { source: "remote" } }));
  if (remote.leagueData) {
    window.dispatchEvent(new CustomEvent(LEAGUE_UPDATED_EVENT, { detail: { source: "remote" } }));
  }
  if (remote.trainingGoals) {
    window.dispatchEvent(new CustomEvent("bt:training-goals-updated", { detail: { source: "remote" } }));
  }
  window.dispatchEvent(new Event("bt:cloud-progress-applied"));
}

let initialCloudSyncPromise: Promise<RemoteProgress | null> | null = null;
let initialCloudSyncResult: RemoteProgress | null | undefined;
let initialCloudSyncSucceededAt = 0;

/** Erlaubt erneuten Cloud-Pull nach Offline-Start oder wenn zuvor noch nicht synchronisiert wurde. */
export function resetInitialCloudSyncCache() {
  initialCloudSyncResult = undefined;
  initialCloudSyncSucceededAt = 0;
  initialCloudSyncPromise = null;
}

/**
 * Cloud-Pull mit kurzem Cache. Fehler und leere Antworten werden nicht dauerhaft
 * gecacht, damit ein spaeterer Fokus-/Online-Event erneut synchronisieren kann.
 */
export function ensureInitialCloudSync(options: { force?: boolean } = {}): Promise<RemoteProgress | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!isAppOnline()) {
    return Promise.resolve(initialCloudSyncResult ?? null);
  }
  const cacheIsFresh =
    initialCloudSyncResult !== undefined &&
    Date.now() - initialCloudSyncSucceededAt < CLOUD_PULL_TTL_MS;
  if (!options.force && cacheIsFresh) {
    return Promise.resolve(initialCloudSyncResult ?? null);
  }
  if (!initialCloudSyncPromise) {
    initialCloudSyncPromise = pullProgressFromCloud()
      .then((result) => {
        if (result !== null) {
          initialCloudSyncResult = result;
          initialCloudSyncSucceededAt = Date.now();
        }
        return result;
      })
      .finally(() => {
        initialCloudSyncPromise = null;
      });
  }
  return initialCloudSyncPromise;
}

export async function pullProgressFromCloud() {
  if (!isAppOnline()) {
    dispatchSyncStatus({ status: "offline" });
    return null;
  }

  const { me, accountSwitched } = await checkAuthSession();
  if (!me) return null;

  if (accountSwitched) {
    clearLocalUserProgress();
  }

  const localKnownAt = window.localStorage.getItem(CLOUD_UPDATED_AT_KEY);
  const response = await fetch("/api/session", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) return null;
  const remote = (await response.json()) as RemoteProgress;

  const syncUserId = window.localStorage.getItem(SYNC_USER_ID_KEY);
  if (syncUserId && syncUserId !== me.id) {
    const activeEmail = window.localStorage.getItem(ACTIVE_AUTH_EMAIL_KEY)?.trim().toLowerCase();
    const currentEmail = me.email.trim().toLowerCase();
    if (!activeEmail || activeEmail !== currentEmail) {
      clearLocalUserProgress();
    }
  }

  if (remote.remoteExists === false) {
    const local = buildLocalProgressSnapshot();
    const canMigrateLocal =
      !accountSwitched && (syncUserId === me.id || (syncUserId == null && hasLocalUserData(local)));
    if (canMigrateLocal && hasLocalUserData(local)) {
      const migrated = await pushProgressToCloud();
      if (migrated) {
        window.localStorage.setItem(SYNC_USER_ID_KEY, me.id);
        return {
          ...local,
          remoteExists: true,
          remoteUpdatedAt: window.localStorage.getItem(CLOUD_UPDATED_AT_KEY),
        };
      }
      return null;
    }
    window.localStorage.setItem(SYNC_USER_ID_KEY, me.id);
    return remote;
  }

  if (isLocalProgressDirty()) {
    if (
      remote.remoteUpdatedAt &&
      (!localKnownAt || remote.remoteUpdatedAt > localKnownAt)
    ) {
      const { dispatchSyncConflict } = await import("@/lib/sync-conflict");
      dispatchSyncConflict({ remote, remoteUpdatedAt: remote.remoteUpdatedAt });
    }
    window.localStorage.setItem(SYNC_USER_ID_KEY, me.id);
    return remote;
  }

  // Older app versions could already have created the account row while
  // keeping individual fields (notably profile, league and game stats) only
  // in localStorage. Fill only missing cloud text and append-only sessions.
  // Calendar maps are included solely before this device has ever completed
  // a cloud pull, so deleted remote map entries are not resurrected later.
  const local = buildLocalProgressSnapshot();
  const firstSyncMerge = mergeProgressForFirstSync(remote, local, {
    includeLocalMapEntries: !localKnownAt,
  });
  if (firstSyncMerge.addedLocalData) {
    // First apply the conflict-safe merged snapshot locally. If the network
    // write fails, the retry queue then uploads this merged state instead of
    // an older local snapshot that could replace newer cloud maps.
    applyRemoteProgressToLocal(firstSyncMerge.progress);
    if (remote.remoteUpdatedAt) {
      window.localStorage.setItem(CLOUD_UPDATED_AT_KEY, remote.remoteUpdatedAt);
    }
    const migrated = await pushProgressToCloud(firstSyncMerge.progress, {
      quiet: true,
      clientKnownRemoteUpdatedAt: remote.remoteUpdatedAt ?? localKnownAt,
    });
    if (!migrated) return remote;

    const migratedProgress = {
      ...firstSyncMerge.progress,
      remoteExists: true,
      remoteUpdatedAt: window.localStorage.getItem(CLOUD_UPDATED_AT_KEY),
    };
    window.localStorage.setItem(SYNC_USER_ID_KEY, me.id);
    return migratedProgress;
  }

  applyRemoteProgressToLocal(remote);
  if (remote.remoteUpdatedAt) {
    window.localStorage.setItem(CLOUD_UPDATED_AT_KEY, remote.remoteUpdatedAt);
    dispatchSyncStatus({ status: "saved", at: remote.remoteUpdatedAt, message: "Cloud-Daten sind aktuell" });
  }
  window.localStorage.setItem(SYNC_USER_ID_KEY, me.id);
  return remote;
}

type PushOptions = {
  /** Toast anzeigen (Standard: still) */
  quiet?: boolean;
  /** Nach Sync-Konflikt lokale Version erzwingen */
  forceOverwrite?: boolean;
  /** Expliziter Stand des unmittelbar zuvor gelesenen Cloud-Snapshots. */
  clientKnownRemoteUpdatedAt?: string | null;
};

async function postProgressSnapshot(
  snapshot: RemoteProgress,
  clientKnownRemoteUpdatedAt: string | null,
  forceOverwrite: boolean,
): Promise<Response> {
  return fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      ...snapshot,
      clientKnownRemoteUpdatedAt,
      forceOverwrite,
    }),
  });
}

async function pushProgressToCloudOnce(
  overrides?: Partial<RemoteProgress>,
  options?: PushOptions,
): Promise<boolean> {
  const forceOverwrite = options?.forceOverwrite ?? false;
  const { me, accountSwitched } = await checkAuthSession();
  if (!me) return false;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    markLocalProgressDirty();
    if (!options?.quiet) dispatchSyncStatus({ status: "offline" });
    return false;
  }
  if (accountSwitched) {
    clearLocalUserProgress();
    await pullProgressFromCloud();
  }

  markLocalProgressDirty();
  if (!options?.quiet) dispatchSyncStatus({ status: "saving" });

  const snapshot = { ...buildLocalProgressSnapshot(), ...overrides };
  const clientKnownRemoteUpdatedAt = options?.clientKnownRemoteUpdatedAt !== undefined
    ? options.clientKnownRemoteUpdatedAt
    : window.localStorage.getItem(CLOUD_UPDATED_AT_KEY);

  let response = await postProgressSnapshot(snapshot, clientKnownRemoteUpdatedAt, forceOverwrite);

  if (response.status === 401) {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
    if (refreshed.ok) {
      response = await postProgressSnapshot(snapshot, clientKnownRemoteUpdatedAt, forceOverwrite);
    }
  }

  if (response.status === 409) {
    const conflict = (await response.json()) as { remote?: RemoteProgress; remoteUpdatedAt?: string };
    if (conflict.remote && conflict.remoteUpdatedAt) {
      const { dispatchSyncConflict } = await import("@/lib/sync-conflict");
      dispatchSyncConflict({ remote: conflict.remote, remoteUpdatedAt: conflict.remoteUpdatedAt });
    }
    if (!options?.quiet) dispatchSyncStatus({ status: "error", message: "Cloud-Konflikt – bitte Version wählen" });
    return false;
  }

  if (response.ok) {
    const json = (await response.json()) as { remoteUpdatedAt?: string };
    if (json.remoteUpdatedAt) {
      window.localStorage.setItem(CLOUD_UPDATED_AT_KEY, json.remoteUpdatedAt);
    }
    clearLocalProgressDirty();
    if (!options?.quiet) {
      dispatchSyncStatus({ status: "saved", at: json.remoteUpdatedAt, message: "In der Cloud gespeichert" });
    }
    return true;
  }

  if (!options?.quiet) dispatchSyncStatus({ status: "error", message: "Cloud-Sync fehlgeschlagen" });
  return false;
}

type QueuedProgressPush = {
  overrides?: Partial<RemoteProgress>;
  options?: PushOptions;
};

const progressPushQueue = createCoalescingAsyncQueue<QueuedProgressPush>({
  merge: (current, incoming) => ({
    overrides:
      current.overrides || incoming.overrides
        ? { ...(current.overrides ?? {}), ...(incoming.overrides ?? {}) }
        : undefined,
    options: {
      quiet: Boolean(current.options?.quiet && incoming.options?.quiet),
      forceOverwrite: Boolean(current.options?.forceOverwrite || incoming.options?.forceOverwrite),
      clientKnownRemoteUpdatedAt:
        incoming.options?.clientKnownRemoteUpdatedAt ?? current.options?.clientKnownRemoteUpdatedAt,
    },
  }),
  worker: ({ overrides, options }) => pushProgressToCloudOnce(overrides, options),
});

export async function pushProgressToCloud(
  overrides?: Partial<RemoteProgress>,
  options?: PushOptions,
): Promise<boolean> {
  markLocalProgressDirty();
  return progressPushQueue.enqueue({ overrides, options });
}

/** Sync mit kurzem Retry — hilft direkt nach Workout-Abschluss. */
export async function pushProgressToCloudWithRetry(
  overridesOrAttempts?: Partial<RemoteProgress> | number,
  attemptsArg = 3,
): Promise<boolean> {
  const overrides = typeof overridesOrAttempts === "number" ? undefined : overridesOrAttempts;
  const attempts = typeof overridesOrAttempts === "number" ? overridesOrAttempts : attemptsArg;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await pushProgressToCloud(overrides, { quiet: true })) {
      dispatchSyncStatus({ status: "saved", message: "In der Cloud gespeichert" });
      return true;
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  dispatchSyncStatus({
    status: isAppOnline() ? "error" : "offline",
    message: isAppOnline() ? "Cloud-Sync fehlgeschlagen – wird erneut versucht" : undefined,
  });
  return false;
}

export { markLocalProgressDirty, clearLocalProgressDirty, isLocalProgressDirty };
