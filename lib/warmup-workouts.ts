import { type Workout } from "@/lib/training-data";

function normalizeWarmupText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function isWarmupWorkout(workout: Workout) {
  if (workout.category !== "Basketball") return false;
  const subcategory = normalizeWarmupText(workout.subcategory);
  const name = normalizeWarmupText(workout.name);
  return subcategory.includes("warmup") || name.includes("warmup");
}

export function getWarmupWorkouts(workouts: Workout[]) {
  return workouts.filter(isWarmupWorkout);
}

/** Vereinheitlicht erkannte Warm-up-Workouts für Katalog und Spielvorbereitung. */
export function canonicalizeWarmupWorkout(workout: Workout): Workout {
  if (!isWarmupWorkout(workout) || workout.subcategory === "Warm-Up") return workout;
  return { ...workout, subcategory: "Warm-Up" };
}
