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
};

export type WorkoutSessionEntry = {
  id: string;
  dateISO: string;
  workoutId: string;
  workoutName: string;
  logs: WorkoutSessionLog[];
};

export type SessionDatabase = {
  workoutSessions: WorkoutSessionEntry[];
  exerciseHistory: Record<string, ExerciseHistoryEntry[]>;
};