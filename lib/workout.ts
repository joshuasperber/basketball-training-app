export type WorkoutStatus = "not_started" | "in_progress" | "completed";

export type WorkoutSet = {
  targetKg: number;
  targetReps: number;
};

export type WorkoutExercise = {
  name: string;
  sets: WorkoutSet[];
};

export type WorkoutPlan = {
  title: string;
  subcategory: string;
  exercises: WorkoutExercise[];
};

export type SetLog = {
  weight: string;
  reps: string;
};

export type WorkoutProgress = {
  date: string;
  status: WorkoutStatus;
  exerciseIndex: number;
  setIndex: number;
  logs: Record<string, SetLog>;
};

export const TODAY_WORKOUT: WorkoutPlan = {
  title: "BenchPress",
  subcategory: "Kraftaufbau",
  exercises: [
    {
      name: "Flachbank",
      sets: [
        { targetKg: 60, targetReps: 10 },
        { targetKg: 65, targetReps: 8 },
        { targetKg: 70, targetReps: 6 },
      ],
    },
    {
      name: "Schrägbank",
      sets: [
        { targetKg: 45, targetReps: 10 },
        { targetKg: 50, targetReps: 8 },
        { targetKg: 55, targetReps: 6 },
      ],
    },
    {
      name: "Kurzhantel-Press",
      sets: [
        { targetKg: 22, targetReps: 12 },
        { targetKg: 24, targetReps: 10 },
        { targetKg: 26, targetReps: 8 },
      ],
    },
  ],
};

export const buildWorkoutStorageKey = (date: string) =>
  `basketball-training-workout-${date}`;

export const getTodayDateKey = () => new Date().toISOString().slice(0, 10);

export const buildSetLogKey = (exerciseIndex: number, setIndex: number) =>
  `${exerciseIndex}-${setIndex}`;

export const getDefaultWorkoutProgress = (date: string): WorkoutProgress => ({
  date,
  status: "not_started",
  exerciseIndex: 0,
  setIndex: 0,
  logs: {},
});