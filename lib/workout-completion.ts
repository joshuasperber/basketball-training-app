import { getWorkoutSessions } from "@/lib/session-storage";
import { toLocalDateKey } from "@/lib/workout";

/** Abgeschlossene Workout-IDs an einem Kalendertag (lokal, yyyy-mm-dd). */
export function getCompletedWorkoutIdsForDate(dateKey: string): Set<string> {
  const ids = new Set<string>();
  for (const session of getWorkoutSessions()) {
    if (toLocalDateKey(new Date(session.dateISO)) === dateKey) {
      ids.add(session.workoutId);
    }
  }
  return ids;
}

export function isWorkoutCompletedOnDate(dateKey: string, workoutIds: string[]): boolean {
  if (workoutIds.length === 0) return false;
  const completed = getCompletedWorkoutIdsForDate(dateKey);
  return workoutIds.some((id) => completed.has(id));
}
