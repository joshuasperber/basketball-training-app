import { getWorkoutSessions } from "@/lib/session-storage";
import { toLocalDateKey, WORKOUT_PROGRESS_PREFIX } from "@/lib/workout";

/** Abgeschlossene Workout-IDs an einem Kalendertag (lokal, yyyy-mm-dd). */
export function getCompletedWorkoutIdsForDate(dateKey: string): Set<string> {
  const ids = new Set<string>();
  for (const session of getWorkoutSessions()) {
    if (toLocalDateKey(new Date(session.dateISO)) === dateKey) {
      ids.add(session.workoutId);
    }
  }
  if (typeof window !== "undefined") {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(WORKOUT_PROGRESS_PREFIX)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const progress = JSON.parse(raw) as { date?: string; workoutId?: string; status?: string };
        if (progress.date === dateKey && progress.workoutId && progress.status === "completed") {
          ids.add(progress.workoutId);
        }
      } catch {
        // Ignore invalid legacy progress entries.
      }
    }
  }
  return ids;
}

export function isWorkoutCompletedOnDate(dateKey: string, workoutIds: string[]): boolean {
  if (workoutIds.length === 0) return false;
  const completed = getCompletedWorkoutIdsForDate(dateKey);
  return workoutIds.some((id) => completed.has(id));
}
