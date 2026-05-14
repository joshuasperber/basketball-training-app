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
  rpe?: number | null;
};

export type WorkoutSessionEntry = {
  id: string;
  dateISO: string;
  workoutId: string;
  workoutName: string;
  workoutCategory?: string;
  workoutSubcategory?: string;
  sessionNotes?: string;
  durationSeconds?: number;
  avgRpe?: number | null;
  logs: WorkoutSessionLog[];
};

export type SessionDatabase = {
  workoutSessions: WorkoutSessionEntry[];
  exerciseHistory: Record<string, ExerciseHistoryEntry[]>;
};