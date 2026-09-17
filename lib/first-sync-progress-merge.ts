import type { RemoteProgressPayload } from "@/lib/progress-sync";
import type { ExerciseHistoryEntry, SessionDatabase, WorkoutSessionEntry } from "@/lib/session-types";

type TextField = {
  [Key in keyof RemoteProgressPayload]: RemoteProgressPayload[Key] extends string | null ? Key : never;
}[keyof RemoteProgressPayload];

const TEXT_FIELDS = [
  "manualPlanOverrides",
  "profileCache",
  "profileUsername",
  "profileWeekConfig",
  "playerIntake",
  "xpHistory",
  "xpProgression",
  "performanceTips",
  "gameStats",
  "leagueData",
  "trainingGoals",
  "customSubcategories",
  "workoutHistory",
  "reminderPrefs",
  "readinessHistory",
  "coachWeeklyNote",
  "trainingExercises",
  "trainingWorkouts",
] as const satisfies readonly TextField[];

type MapField =
  | "dailyPlanMap"
  | "manualDayWorkoutsMap"
  | "manualDayDisabledMap"
  | "weeklyRegenSlotMap"
  | "hiddenAutoWorkoutsMap"
  | "workoutOverrides";

const MAP_FIELDS = [
  "dailyPlanMap",
  "manualDayWorkoutsMap",
  "manualDayDisabledMap",
  "weeklyRegenSlotMap",
  "hiddenAutoWorkoutsMap",
  "workoutOverrides",
] as const satisfies readonly MapField[];

export type FirstSyncProgressMergeResult = {
  /** Snapshot that can safely be uploaded during the first cloud sync. */
  progress: RemoteProgressPayload;
  /** True only when at least one local value was added to missing cloud data. */
  addedLocalData: boolean;
};

type FirstSyncProgressMergeOptions = {
  /**
   * Calendar maps are merged only on a device's first known cloud sync.
   * Later pulls must not resurrect keys intentionally removed elsewhere.
   */
  includeLocalMapEntries?: boolean;
};

function hasOwn(record: object, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isMissingText(value: string | null | undefined) {
  return value == null || value.trim().length === 0;
}

function mergeMap<
  Cloud extends Record<string, unknown>,
  Local extends Record<string, unknown>,
>(cloud: Cloud | null | undefined, local: Local | null | undefined) {
  const safeCloud = cloud ?? ({} as Cloud);
  const safeLocal = local ?? ({} as Local);
  const addedLocalData = Object.keys(safeLocal).some((key) => !hasOwn(safeCloud, key));

  return {
    value: { ...safeLocal, ...safeCloud },
    addedLocalData,
  };
}

function mergeEntriesById<T extends { id: string }>(cloud: T[] | null | undefined, local: T[] | null | undefined) {
  const byId = new Map<string, T>();
  for (const entry of local ?? []) byId.set(entry.id, entry);
  for (const entry of cloud ?? []) byId.set(entry.id, entry);

  const cloudIds = new Set((cloud ?? []).map((entry) => entry.id));
  return {
    value: [...byId.values()],
    addedLocalData: (local ?? []).some((entry) => !cloudIds.has(entry.id)),
  };
}

function sortByNewest<T extends { dateISO: string }>(entries: T[]) {
  return [...entries].sort((left, right) => right.dateISO.localeCompare(left.dateISO));
}

function mergeSessions(cloud: SessionDatabase | null | undefined, local: SessionDatabase | null | undefined) {
  const workoutSessions = mergeEntriesById<WorkoutSessionEntry>(
    cloud?.workoutSessions,
    local?.workoutSessions,
  );
  const exerciseIds = new Set([
    ...Object.keys(local?.exerciseHistory ?? {}),
    ...Object.keys(cloud?.exerciseHistory ?? {}),
  ]);
  const exerciseHistory: Record<string, ExerciseHistoryEntry[]> = {};
  let addedLocalData = workoutSessions.addedLocalData;

  for (const exerciseId of exerciseIds) {
    const entries = mergeEntriesById<ExerciseHistoryEntry>(
      cloud?.exerciseHistory?.[exerciseId],
      local?.exerciseHistory?.[exerciseId],
    );
    exerciseHistory[exerciseId] = sortByNewest(entries.value);
    addedLocalData ||= entries.addedLocalData;
  }

  return {
    value: {
      workoutSessions: sortByNewest(workoutSessions.value),
      exerciseHistory,
    },
    addedLocalData,
  };
}

/**
 * Builds the one-time migration snapshot used when this device has local data
 * but the account already has a (possibly partial) cloud row.
 *
 * Cloud data is authoritative: local text is used only for missing cloud text,
 * while maps and session collections add local-only keys/IDs. Inputs are never
 * mutated. Callers remain responsible for limiting this merge to the first sync.
 */
export function mergeProgressForFirstSync(
  cloud: RemoteProgressPayload,
  local: RemoteProgressPayload,
  options: FirstSyncProgressMergeOptions = {},
): FirstSyncProgressMergeResult {
  const progress: RemoteProgressPayload = {
    ...local,
    ...cloud,
    sessions: cloud.sessions,
    dailyPlanMap: cloud.dailyPlanMap,
    manualDayWorkoutsMap: cloud.manualDayWorkoutsMap,
    manualDayDisabledMap: cloud.manualDayDisabledMap,
    weeklyRegenSlotMap: cloud.weeklyRegenSlotMap,
    hiddenAutoWorkoutsMap: cloud.hiddenAutoWorkoutsMap,
    workoutOverrides: cloud.workoutOverrides,
  };
  let addedLocalData = false;

  for (const field of TEXT_FIELDS) {
    const cloudValue = cloud[field];
    const localValue = local[field];
    if (isMissingText(cloudValue) && !isMissingText(localValue)) {
      progress[field] = localValue;
      addedLocalData = true;
    }
  }

  if (options.includeLocalMapEntries !== false) {
    for (const field of MAP_FIELDS) {
      const merged = mergeMap(cloud[field], local[field]);
      Object.assign(progress, { [field]: merged.value });
      addedLocalData ||= merged.addedLocalData;
    }
  }

  const sessions = mergeSessions(cloud.sessions, local.sessions);
  progress.sessions = sessions.value;
  addedLocalData ||= sessions.addedLocalData;

  return { progress, addedLocalData };
}
