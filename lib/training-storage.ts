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

function canUseStorage() {
  return typeof window !== "undefined";
}

function getLocalSnapshot() {
  return {
    exercises: loadExercises(),
    workouts: loadWorkouts(),
  };
}

export async function persistTrainingData(exercises: Exercise[], workouts: Workout[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(EXERCISES_STORAGE_KEY, JSON.stringify(exercises));
  window.localStorage.setItem(WORKOUTS_STORAGE_KEY, JSON.stringify(workouts));
}

export function loadExercises(): Exercise[] {
  if (!canUseStorage()) return defaultExercises;
  return safeParse<Exercise[]>(window.localStorage.getItem(EXERCISES_STORAGE_KEY), defaultExercises);
}

export function loadWorkouts(): Workout[] {
  if (!canUseStorage()) return defaultWorkouts;
  return safeParse<Workout[]>(window.localStorage.getItem(WORKOUTS_STORAGE_KEY), defaultWorkouts);
}

export function saveExercises(exercises: Exercise[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(EXERCISES_STORAGE_KEY, JSON.stringify(exercises));
}

export function saveWorkouts(workouts: Workout[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(WORKOUTS_STORAGE_KEY, JSON.stringify(workouts));
}

export async function syncTrainingDataFromServer() {
  if (!canUseStorage()) return { exercises: defaultExercises, workouts: defaultWorkouts };
  return getLocalSnapshot();
}