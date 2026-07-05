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
  timeSeconds?: number | null;
  distanceMeters?: number | null;
  distanceUnit?: "m" | "km" | null;
  points?: number | null;
  shotZone?: "free_throw" | "two_pointer" | "three_pointer" | "general" | null;
  /** RPE 1–10 pro Satz, falls beim Abschluss erfasst. */
  rpe?: number | null;
};

export type WorkoutSessionEntry = {
  id: string;
  dateISO: string;
  workoutId: string;
  workoutName: string;
  workoutCategory?: string;
  workoutSubcategory?: string;
  /** Optionale Gesamt-Notiz zum Workout (nachträglich editierbar). */
  sessionNotes?: string;
  /** Geschätzte oder gemessene Session-Dauer (Sekunden), z. B. für Export. */
  durationSeconds?: number;
  /** Durchschnittliches RPE der erfassten Sätze (1–10). */
  avgRpe?: number | null;
  /** Wiederholbare Training-Sessions sollen am selben Tag nicht ersetzt werden. */
  allowMultiple?: boolean;
  logs: WorkoutSessionLog[];
};

const EXERCISE_HISTORY_KEY = "bt.exercise-history.v1";
const WORKOUT_SESSIONS_KEY = "bt.workout-sessions.v1";

function queueSessionCloudSync() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("bt:sessions-updated"));
  void import("@/lib/app-online").then(({ isAppOnline }) => {
    if (!isAppOnline()) {
      void import("@/lib/sync-dirty").then(({ markLocalProgressDirty }) => markLocalProgressDirty());
      return;
    }
    void import("@/lib/sync-workout-sessions").then(({ syncWorkoutSessionsToCloudWithRetry }) => {
      void syncWorkoutSessionsToCloudWithRetry();
    });
  });
}

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
  const entryDate = entry.dateISO.slice(0, 10);
  const withoutExisting =
    entry.allowMultiple || entry.workoutId === "single-exercise-session"
      ? current.filter((session) => session.id !== entry.id)
      : current.filter(
          (session) =>
            session.id !== entry.id &&
            !(session.workoutId === entry.workoutId && session.dateISO.slice(0, 10) === entryDate),
        );
  writeJson(WORKOUT_SESSIONS_KEY, [entry, ...withoutExisting].slice(0, 50));
  queueSessionCloudSync();
}

export function updateWorkoutSession(sessionId: string, patch: Partial<Pick<WorkoutSessionEntry, "sessionNotes" | "logs">>) {
  const current = getWorkoutSessions();
  const next = current.map((session) => (session.id === sessionId ? { ...session, ...patch } : session));
  writeJson(WORKOUT_SESSIONS_KEY, next);
  queueSessionCloudSync();
}

export function updateWorkoutSessionLogNote(sessionId: string, logIndex: number, note: string) {
  const current = getWorkoutSessions();
  const next = current.map((session) => {
    if (session.id !== sessionId) return session;
    const logs = session.logs.map((log, index) => (index === logIndex ? { ...log, note } : log));
    return { ...session, logs };
  });
  writeJson(WORKOUT_SESSIONS_KEY, next);
  queueSessionCloudSync();
}
