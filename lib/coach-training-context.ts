import type { WorkoutSessionEntry } from "@/lib/session-storage";
import type { Exercise, Workout } from "@/lib/training-data";

export type CoachWorkoutCatalogItem = {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  level?: number;
};

export type CoachSession14dItem = {
  date: string;
  workoutId: string;
  workoutName: string;
  category: string;
  subcategory: string;
  setCount: number;
  avgRpe: number | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function sessionsCompletedInLastDays(sessions: WorkoutSessionEntry[], days: number): WorkoutSessionEntry[] {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setTime(cutoff.getTime() - days * MS_PER_DAY);
  return sessions.filter((s) => new Date(s.dateISO).getTime() >= cutoff.getTime());
}

export function buildWorkoutCatalogForCoach(workouts: Workout[], limit = 60): CoachWorkoutCatalogItem[] {
  return workouts.slice(0, limit).map((w) => ({
    id: w.id,
    name: w.name,
    category: w.category,
    subcategory: w.subcategory,
    level: w.level,
  }));
}

export function buildRecentTrainingLog14d(
  sessions: WorkoutSessionEntry[],
  exerciseLookup: Map<string, Exercise>,
  workoutLookup: Map<string, Workout>,
): CoachSession14dItem[] {
  const recent = sessionsCompletedInLastDays(sessions, 14).filter((s) => s.workoutId !== "single-exercise-session");
  return recent.map((session) => {
    const workout = workoutLookup.get(session.workoutId);
    const sampleExercise = session.logs.map((log) => exerciseLookup.get(log.exerciseId)).find(Boolean);
    const fromLogs = session.logs.map((l) => l.rpe).filter((v): v is number => typeof v === "number");
    const avgLogRpe =
      fromLogs.length > 0 ? Math.round((fromLogs.reduce((a, b) => a + b, 0) / fromLogs.length) * 10) / 10 : null;
    const avgRpe = typeof session.avgRpe === "number" && Number.isFinite(session.avgRpe) ? session.avgRpe : avgLogRpe;
    return {
      date: session.dateISO.slice(0, 10),
      workoutId: session.workoutId,
      workoutName: session.workoutName,
      category: (workout?.category ?? session.workoutCategory ?? sampleExercise?.category ?? "Basketball") as string,
      subcategory: (workout?.subcategory ?? session.workoutSubcategory ?? sampleExercise?.subcategory ?? "") as string,
      setCount: session.logs.length,
      avgRpe,
    };
  });
}

export function countSubcategories14d(items: CoachSession14dItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of items) {
    const key = `${row.category}:${row.subcategory || "?"}`;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}
