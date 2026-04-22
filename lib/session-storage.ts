export type ExerciseHistoryEntry = {
  id: string;
  dateISO: string;
  exerciseId: string;
  value: number;
  note?: string;
  source: "exercise" | "workout";
  workoutId?: string;
};

export type WorkoutSessionLog = {
  exerciseId: string;
  completedValue: number | null;
  completed?: boolean;
  note: string;
  made?: number | null;
  attempts?: number | null;
  misses?: number | null;
  weightKg?: number | null;
};

export type WorkoutSessionEntry = {
  id: string;
  dateISO: string;
  workoutId: string;
  workoutName: string;
  workoutCategory?: string;
  workoutSubcategory?: string;
  logs: WorkoutSessionLog[];
};

const EXERCISE_HISTORY_KEY = "bt.exercise-history.v1";
const WORKOUT_SESSIONS_KEY = "bt.workout-sessions.v1";

function canUseStorage() {
  return typeof window !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;

  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) return fallback;

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getExerciseHistoryMap() {
  return readJson<Record<string, ExerciseHistoryEntry[]>>(EXERCISE_HISTORY_KEY, {});
}

export function getExerciseHistory(exerciseId: string) {
  const map = getExerciseHistoryMap();
  return map[exerciseId] ?? [];
}

export function appendExerciseHistory(entry: ExerciseHistoryEntry) {
  const map = getExerciseHistoryMap();
  const current = map[entry.exerciseId] ?? [];

  map[entry.exerciseId] = [entry, ...current].slice(0, 50);
  writeJson(EXERCISE_HISTORY_KEY, map);
}

export function getWorkoutSessions() {
  return readJson<WorkoutSessionEntry[]>(WORKOUT_SESSIONS_KEY, []);
}

export function appendWorkoutSession(entry: WorkoutSessionEntry) {
  const current = getWorkoutSessions();
  writeJson(WORKOUT_SESSIONS_KEY, [entry, ...current].slice(0, 50));
}