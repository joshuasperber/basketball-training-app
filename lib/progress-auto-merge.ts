import type { RemoteProgressPayload } from "@/lib/progress-sync";
import { mergeThreeWayJson } from "@/lib/three-way-merge";

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
] as const;

function parseJsonText(value: string | null | undefined) {
  if (value == null || value.trim() === "") return { parsed: false as const, value };
  try {
    return { parsed: true as const, value: JSON.parse(value) as unknown };
  } catch {
    return { parsed: false as const, value };
  }
}

function mergeTextField(
  baseAvailable: boolean,
  base: string | null | undefined,
  remote: string | null,
  local: string | null,
) {
  if (!baseAvailable) {
    if (local == null || local === "") return remote;
    if (remote == null || remote === "") return local;
  }

  const parsedBase = parseJsonText(base);
  const parsedRemote = parseJsonText(remote);
  const parsedLocal = parseJsonText(local);
  if (parsedRemote.parsed && parsedLocal.parsed && (!baseAvailable || parsedBase.parsed)) {
    const merged = mergeThreeWayJson(
      baseAvailable && parsedBase.parsed ? parsedBase.value : undefined,
      parsedRemote.value,
      parsedLocal.value,
    );
    return JSON.stringify(merged.value);
  }

  return mergeThreeWayJson(baseAvailable ? base : undefined, remote, local).value;
}

/** Automatische, datentypgerechte Zusammenführung für den persönlichen Fortschritt. */
export function mergeProgressSnapshots(
  base: RemoteProgressPayload | null | undefined,
  remote: RemoteProgressPayload,
  local: RemoteProgressPayload,
): RemoteProgressPayload {
  const baseAvailable = Boolean(base);
  const merged = mergeThreeWayJson(base ?? undefined, remote, local).value;

  for (const field of TEXT_FIELDS) {
    merged[field] = mergeTextField(baseAvailable, base?.[field], remote[field], local[field]);
  }

  merged.remoteExists = true;
  merged.remoteUpdatedAt = remote.remoteUpdatedAt ?? null;
  return merged;
}

export function serializeCloudBase(progress: RemoteProgressPayload) {
  const snapshot = { ...progress };
  delete snapshot.remoteUpdatedAt;
  return JSON.stringify(snapshot);
}

export function parseCloudBase(raw: string | null): RemoteProgressPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RemoteProgressPayload;
    return parsed && typeof parsed === "object" && parsed.sessions ? parsed : null;
  } catch {
    return null;
  }
}
