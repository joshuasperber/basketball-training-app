import { parseGamePlanId } from "@/lib/game-plan-ids";
import { getWorkoutSessions } from "@/lib/session-storage";
import { toLocalDateKey, WORKOUT_PROGRESS_PREFIX } from "@/lib/workout";

function expandCompletedId(id: string, dateKey: string): string[] {
  const ids = [id];
  const game = parseGamePlanId(id);
  if (game) {
    ids.push(`game-${game.dateKey}`, `game_training-${game.dateKey}`, `game-training-${game.dateKey}`);
  }
  if (id === `game-${dateKey}` || id === `game_training-${dateKey}` || id === `game-training-${dateKey}`) {
    ids.push(`game-${dateKey}`, `game_training-${dateKey}`, `game-training-${dateKey}`);
  }
  return [...new Set(ids)];
}

/** Abgeschlossene Workout-IDs an einem Kalendertag (lokal, yyyy-mm-dd). */
export function getCompletedWorkoutIdsForDate(dateKey: string): Set<string> {
  const ids = new Set<string>();
  for (const session of getWorkoutSessions()) {
    if (toLocalDateKey(new Date(session.dateISO)) === dateKey) {
      expandCompletedId(session.workoutId, dateKey).forEach((id) => ids.add(id));
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
          expandCompletedId(progress.workoutId, dateKey).forEach((id) => ids.add(id));
        }
      } catch {
        // Ignore invalid legacy progress entries.
      }
    }
  }
  return ids;
}

export function isWorkoutIdCompletedOnDate(dateKey: string, workoutId: string): boolean {
  const completed = getCompletedWorkoutIdsForDate(dateKey);
  return expandCompletedId(workoutId, dateKey).some((id) => completed.has(id));
}

export function isWorkoutCompletedOnDate(dateKey: string, workoutIds: string[]): boolean {
  if (workoutIds.length === 0) return false;
  return workoutIds.some((id) => isWorkoutIdCompletedOnDate(dateKey, id));
}
