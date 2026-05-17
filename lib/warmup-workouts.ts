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
