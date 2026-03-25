import { defaultExercises, defaultWorkouts, type Exercise, type Workout } from "@/lib/training-data";

const EXERCISES_STORAGE_KEY = "training-exercises-v1";
const WORKOUTS_STORAGE_KEY = "training-workouts-v1";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadExercises(): Exercise[] {
  if (typeof window === "undefined") return defaultExercises;
  return safeParse<Exercise[]>(window.localStorage.getItem(EXERCISES_STORAGE_KEY), defaultExercises);
}

export function loadWorkouts(): Workout[] {
  if (typeof window === "undefined") return defaultWorkouts;
  return safeParse<Workout[]>(window.localStorage.getItem(WORKOUTS_STORAGE_KEY), defaultWorkouts);
}

export function saveExercises(exercises: Exercise[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EXERCISES_STORAGE_KEY, JSON.stringify(exercises));
}

export function saveWorkouts(workouts: Workout[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKOUTS_STORAGE_KEY, JSON.stringify(workouts));
}