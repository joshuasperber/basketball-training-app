/** App-Routen, die offline erreichbar sein sollen (nach einmaligem Online-Warmup). */
export const OFFLINE_APP_ROUTES = [
  "/dashboard",
  "/training",
  "/weekly-workout",
  "/workouts",
  "/stats",
  "/team",
  "/profile",
  "/tips",
  "/game-track",
  "/level",
  "/liga",
  "/review",
  "/create-exercise",
] as const;

export type OfflineAppRoute = (typeof OFFLINE_APP_ROUTES)[number];

/** Exercise- und Workout-Seiten aus lokalem Katalog — für Offline-Cache. */
export function collectCatalogWarmPaths(): string[] {
  if (typeof window === "undefined") return [];

  const paths = new Set<string>();

  try {
    const exercisesRaw = window.localStorage.getItem("training-exercises-v1");
    const workoutsRaw = window.localStorage.getItem("training-workouts-v1");
    const exercises = exercisesRaw ? (JSON.parse(exercisesRaw) as { id?: string }[]) : [];
    const workouts = workoutsRaw ? (JSON.parse(workoutsRaw) as { id?: string }[]) : [];

    for (const exercise of exercises) {
      if (exercise?.id) paths.add(`/exercises/${exercise.id}`);
    }
    for (const workout of workouts) {
      if (workout?.id) paths.add(`/workouts?workoutId=${encodeURIComponent(workout.id)}`);
    }
  } catch {
    /* ignore */
  }

  return [...paths];
}
