import { WORKOUT_HISTORY_KEY, type CompletedWorkoutHistoryEntry } from "@/lib/workout";

export function loadWorkoutHistory(): CompletedWorkoutHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const rawHistory =
    window.localStorage.getItem("bt.workout-history.v1") ?? window.localStorage.getItem(WORKOUT_HISTORY_KEY);
  if (!rawHistory) return [];
  try {
    return JSON.parse(rawHistory) as CompletedWorkoutHistoryEntry[];
  } catch {
    return [];
  }
}

export function persistWorkoutHistoryEntry(entry: CompletedWorkoutHistoryEntry) {
  if (typeof window === "undefined") return;
  try {
    const parsed = loadWorkoutHistory();
    const nextHistory = [entry, ...parsed.filter((item) => item.id !== entry.id)].slice(0, 365);
    const serialized = JSON.stringify(nextHistory);
    window.localStorage.setItem(WORKOUT_HISTORY_KEY, serialized);
    window.localStorage.setItem("bt.workout-history.v1", serialized);
  } catch {
    const serialized = JSON.stringify([entry]);
    window.localStorage.setItem(WORKOUT_HISTORY_KEY, serialized);
    window.localStorage.setItem("bt.workout-history.v1", serialized);
  }
}
