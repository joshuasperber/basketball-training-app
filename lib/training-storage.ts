import { defaultExercises, defaultWorkouts, type Exercise, type MetricKey, type Workout } from "@/lib/training-data";

const EXERCISES_STORAGE_KEY = "training-exercises-v1";
const WORKOUTS_STORAGE_KEY = "training-workouts-v1";

const LEGACY_METRICS = new Set(["tries", "intensity"]);

function sanitizeExercise(exercise: Exercise): Exercise {
  const metricKeys = exercise.metricKeys.filter((m) => !LEGACY_METRICS.has(m as string)) as MetricKey[];
  const filterTargets = (row: Partial<Record<MetricKey, number>> | undefined) => {
    if (!row) return undefined;
    const next = Object.fromEntries(
      Object.entries(row).filter(([key]) => !LEGACY_METRICS.has(key)),
    ) as Partial<Record<MetricKey, number>>;
    return Object.keys(next).length ? next : undefined;
  };
  const setTargets = exercise.setTargetsByMetric?.map((row) => filterTargets(row) ?? {});
  return {
    ...exercise,
    metricKeys: metricKeys.length > 0 ? metricKeys : ["reps"],
    targetByMetric: filterTargets(exercise.targetByMetric),
    setTargetsByMetric: setTargets,
  };
}

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
  if (!canUseStorage()) return defaultExercises.map(sanitizeExercise);
  const parsed = safeParse<Exercise[]>(window.localStorage.getItem(EXERCISES_STORAGE_KEY), defaultExercises);
  return parsed.map(sanitizeExercise);
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