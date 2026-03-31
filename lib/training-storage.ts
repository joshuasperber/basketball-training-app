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

async function persistSnapshotToServer(snapshot: { exercises: Exercise[]; workouts: Workout[] }) {
  if (!canUseStorage()) return;

  try {
    await fetch("/api/training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    });
  } catch {
    // Silent fallback to local-only persistence.
  }
}

export async function persistTrainingData(exercises: Exercise[], workouts: Workout[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(EXERCISES_STORAGE_KEY, JSON.stringify(exercises));
  window.localStorage.setItem(WORKOUTS_STORAGE_KEY, JSON.stringify(workouts));
  await persistSnapshotToServer({ exercises, workouts });
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
  void persistSnapshotToServer({ exercises, workouts: loadWorkouts() });
}

export function saveWorkouts(workouts: Workout[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(WORKOUTS_STORAGE_KEY, JSON.stringify(workouts));
  void persistSnapshotToServer({ exercises: loadExercises(), workouts });
}

export async function syncTrainingDataFromServer() {
  if (!canUseStorage()) {
    return { exercises: defaultExercises, workouts: defaultWorkouts };
  }

  try {
    const response = await fetch("/api/training", { cache: "no-store" });
    if (!response.ok) throw new Error("training sync failed");

    const payload = (await response.json()) as {
      exercises?: Exercise[];
      workouts?: Workout[];
    };

    const serverExercises = Array.isArray(payload.exercises) ? payload.exercises : loadExercises();
    const serverWorkouts = Array.isArray(payload.workouts) ? payload.workouts : loadWorkouts();

    window.localStorage.setItem(EXERCISES_STORAGE_KEY, JSON.stringify(serverExercises));
    window.localStorage.setItem(WORKOUTS_STORAGE_KEY, JSON.stringify(serverWorkouts));

    return {
      exercises: serverExercises,
      workouts: serverWorkouts,
    };
  } catch {
    return getLocalSnapshot();
  }
}