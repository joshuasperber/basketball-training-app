import type { SetLog, WorkoutProgress } from "@/lib/workout";
import { WORKOUT_PROGRESS_PREFIX } from "@/lib/workout";

export const PAUSED_WORKOUTS_KEY = "bt:paused-workouts-v1";
export const MAX_PAUSED_WORKOUTS = 2;

export type PausedWorkoutEntry = {
  id: string;
  progress: WorkoutProgress;
  progressStorageKey: string;
  resumeHref: string;
  pausedAtIso: string;
};

export function buildPausedWorkoutId(dateKey: string, workoutId: string) {
  return `${dateKey}:${workoutId}`;
}

function hasPartialSetLogs(logs: Record<string, SetLog>) {
  return Object.values(logs).some((log) => {
    if (!log) return false;
    return Boolean(
      log.reps?.trim() ||
        log.weight?.trim() ||
        log.tries?.trim() ||
        log.makes?.trim() ||
        log.misses?.trim() ||
        log.time?.trim() ||
        log.distance?.trim() ||
        log.completed ||
        log.completedAtIso,
    );
  });
}

export function isWorkoutPausedProgress(progress: WorkoutProgress): boolean {
  if (progress.status === "in_progress" || progress.status === "completed") return false;
  return (progress.elapsedSeconds ?? 0) > 0 || hasPartialSetLogs(progress.logs);
}

export function loadPausedWorkouts(): PausedWorkoutEntry[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(PAUSED_WORKOUTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PausedWorkoutEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => {
      if (
        !entry ||
        typeof entry.id !== "string" ||
        !entry.progress ||
        typeof entry.progressStorageKey !== "string" ||
        typeof entry.resumeHref !== "string"
      ) {
        return false;
      }
      const storedRaw = window.localStorage.getItem(entry.progressStorageKey);
      if (!storedRaw) return false;
      try {
        const storedProgress = JSON.parse(storedRaw) as WorkoutProgress;
        return isWorkoutPausedProgress(storedProgress);
      } catch {
        return false;
      }
    }).map((entry) => {
      const storedRaw = window.localStorage.getItem(entry.progressStorageKey);
      if (!storedRaw) return entry;
      try {
        return { ...entry, progress: JSON.parse(storedRaw) as WorkoutProgress };
      } catch {
        return entry;
      }
    });
  } catch {
    return [];
  }
}

function savePausedWorkouts(entries: PausedWorkoutEntry[]) {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(entries);
  const current = window.localStorage.getItem(PAUSED_WORKOUTS_KEY);
  if (current === serialized) return;
  window.localStorage.setItem(PAUSED_WORKOUTS_KEY, serialized);
  window.dispatchEvent(new Event("bt:paused-workouts-updated"));
}

function evictPausedWorkoutProgress(entry: PausedWorkoutEntry) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(entry.progressStorageKey);
}

export function unregisterPausedWorkout(id: string) {
  const next = loadPausedWorkouts().filter((entry) => entry.id !== id);
  savePausedWorkouts(next);
}

export function registerPausedWorkout(input: {
  progress: WorkoutProgress;
  progressStorageKey: string;
  resumeHref: string;
  pausedAtIso?: string;
}) {
  if (typeof window === "undefined") return;
  if (!isWorkoutPausedProgress(input.progress)) return;

  const id = buildPausedWorkoutId(input.progress.date, input.progress.workoutId);
  const entry: PausedWorkoutEntry = {
    id,
    progress: input.progress,
    progressStorageKey: input.progressStorageKey,
    resumeHref: input.resumeHref,
    pausedAtIso: input.pausedAtIso ?? new Date().toISOString(),
  };

  const withoutDuplicate = loadPausedWorkouts().filter((item) => item.id !== id);
  const next = [...withoutDuplicate, entry];
  while (next.length > MAX_PAUSED_WORKOUTS) {
    const removed = next.shift();
    if (removed) evictPausedWorkoutProgress(removed);
  }
  savePausedWorkouts(next);
}

export function syncPausedWorkoutRegistry(input: {
  progress: WorkoutProgress;
  progressStorageKey: string;
  resumeHref?: string;
}) {
  if (typeof window === "undefined") return;
  const id = buildPausedWorkoutId(input.progress.date, input.progress.workoutId);
  if (isWorkoutPausedProgress(input.progress)) {
    const resumeHref =
      input.resumeHref ??
      `${window.location.pathname}${window.location.search || ""}`;
    registerPausedWorkout({
      progress: input.progress,
      progressStorageKey: input.progressStorageKey,
      resumeHref,
    });
    return;
  }
  unregisterPausedWorkout(id);
}

export function formatPausedWorkoutDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function parseProgressStorageKey(key: string): { dateKey: string; workoutId: string } | null {
  if (!key.startsWith(WORKOUT_PROGRESS_PREFIX)) return null;
  const suffix = key.slice(WORKOUT_PROGRESS_PREFIX.length);
  const match = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(suffix);
  if (!match) return null;
  return { dateKey: match[1], workoutId: match[2] };
}

function buildResumeHrefFromProgress(progress: WorkoutProgress, progressStorageKey: string) {
  const parsed = parseProgressStorageKey(progressStorageKey);
  if (!parsed) return `/workouts?workoutId=${encodeURIComponent(progress.workoutId)}`;
  const date = new Date(`${parsed.dateKey}T12:00:00`);
  const day = Number.isFinite(date.getTime()) ? date.getDay() : new Date().getDay();
  const { workoutId } = parsed;
  if (workoutId.startsWith("manual-day-")) {
    return `/workouts?day=${day}&manualWorkoutId=${encodeURIComponent(workoutId)}`;
  }
  if (workoutId.startsWith("auto-weekly-")) {
    return `/workouts?day=${day}&autoWorkout=${day}`;
  }
  return `/workouts?day=${day}&workoutId=${encodeURIComponent(workoutId)}`;
}

/** Pausierte Workouts aus Registry und localStorage synchronisieren. */
export function refreshPausedWorkoutsRegistry(): PausedWorkoutEntry[] {
  if (typeof window === "undefined") return [];

  const merged = new Map<string, PausedWorkoutEntry>();

  for (const entry of loadPausedWorkouts()) {
    merged.set(entry.id, entry);
  }

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !parseProgressStorageKey(key)) continue;
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      const progress = JSON.parse(raw) as WorkoutProgress;
      if (!progress.date || !progress.workoutId || !isWorkoutPausedProgress(progress)) continue;
      const id = buildPausedWorkoutId(progress.date, progress.workoutId);
      if (merged.has(id)) continue;
      merged.set(id, {
        id,
        progress,
        progressStorageKey: key,
        resumeHref: buildResumeHrefFromProgress(progress, key),
        pausedAtIso: progress.endedAtIso ?? progress.startedAtIso ?? new Date().toISOString(),
      });
    } catch {
      // Ignore invalid entries.
    }
  }

  const next = Array.from(merged.values());
  savePausedWorkouts(next);
  return next;
}

/** @deprecated Use refreshPausedWorkoutsRegistry */
export function reconcilePausedWorkoutsFromStorage() {
  refreshPausedWorkoutsRegistry();
}
