export type WorkoutStatus = "not_started" | "in_progress" | "completed";
export type SportType = "Gym" | "Basketball" | "Home" | "Regeneration" | "Rest";


export type WorkoutSet = {
  targetKg: number;
  targetReps: number;
};

export type WorkoutExercise = {
  exerciseId?: string;
  name: string;
  sets: WorkoutSet[];
};

export type WorkoutPlan = {
  id: string;
  title: string;
  sport: SportType;
  subcategory: string;
  durationMin?: number;
  exercises: WorkoutExercise[];
};

export type SetLog = {
  weight: string;
  reps: string;
  tries?: string;
  makes?: string;
  misses?: string;
  time?: string;
  distance?: string;
  distanceUnit?: "m" | "km";
  points?: string;
  /** Kurz-Notiz pro Satz (optional). */
  note?: string;
  completed?: boolean;
  /** Rate of Perceived Exertion (RPE) 1–10 */
  rpe?: string;
  /** ISO timestamp wann der Satz abgeschlossen wurde (für Pausen-Timer). */
  completedAtIso?: string;
};

/** RPE aus Set-Log (1–10); leer oder ungültig → null. */
export function parseSetRpe(raw: string | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 10) return null;
  return Math.round(n * 10) / 10;
}

export type WorkoutProgress = {
  date: string;
  status: WorkoutStatus;
  workoutId: string;
  title: string;
  sport: SportType;
  subcategory: string;
  exerciseIndex: number;
  setIndex: number;
  logs: Record<string, SetLog>;
  /** ISO-Zeitpunkt, an dem der User auf "Workout starten" geklickt hat. */
  startedAtIso?: string;
  /** ISO-Zeitpunkt, an dem das Workout abgeschlossen wurde. */
  endedAtIso?: string;
  /** Aufgelaufene aktive Workout-Zeit ohne Pausen zwischen Stop/Resume. */
  elapsedSeconds?: number;
};

export type CompletedWorkoutHistoryEntry = {
  id: string;
  date: string;
  workoutId?: string;
  title: string;
  sport: SportType;
  subcategory: string;
  totalSets: number;
  totalReps: number;
  totalVolumeKg: number;
};

export const WORKOUT_PROGRESS_PREFIX = "basketball-training-workout-";
export const WORKOUT_HISTORY_KEY = "basketball-training-history";
export const WORKOUT_OVERRIDE_PREFIX = "basketball-training-workout-override-";

export const WEEKLY_WORKOUT_PLAN: Record<number, WorkoutPlan> = {
  0: {
    id: "sunday-recovery",
    title: "Recovery Shooting",
    sport: "Basketball",
    subcategory: "Shooting",
    exercises: [
      {
        name: "Form Shooting",
        sets: [
          { targetKg: 0, targetReps: 25 },
          { targetKg: 0, targetReps: 25 },
          { targetKg: 0, targetReps: 25 },
        ],
      },
      {
        name: "Freiwürfe",
        sets: [
          { targetKg: 0, targetReps: 15 },
          { targetKg: 0, targetReps: 15 },
          { targetKg: 0, targetReps: 15 },
        ],
      },
    ],
  },
  1: {
    id: "monday-bench",
    title: "BenchPress",
    sport: "Gym",
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
    ],
  },
  2: {
    id: "tuesday-handles",
    title: "Ballhandling Flow",
    sport: "Basketball",
    subcategory: "Handles",
    exercises: [
      {
        name: "Pound Dribbles",
        sets: [
          { targetKg: 0, targetReps: 60 },
          { targetKg: 0, targetReps: 60 },
          { targetKg: 0, targetReps: 60 },
        ],
      },
      {
        name: "Cone Drills",
        sets: [
          { targetKg: 0, targetReps: 10 },
          { targetKg: 0, targetReps: 10 },
          { targetKg: 0, targetReps: 10 },
        ],
      },
    ],
  },
  3: {
    id: "wednesday-legs",
    title: "Leg Day",
    sport: "Gym",
    subcategory: "Beinkraft",
    exercises: [
      {
        name: "Back Squat",
        sets: [
          { targetKg: 80, targetReps: 8 },
          { targetKg: 85, targetReps: 6 },
          { targetKg: 90, targetReps: 5 },
        ],
      },
      {
        name: "Romanian Deadlift",
        sets: [
          { targetKg: 60, targetReps: 10 },
          { targetKg: 65, targetReps: 8 },
          { targetKg: 70, targetReps: 8 },
        ],
      },
    ],
  },
  4: {
    id: "thursday-shooting",
    title: "Game Shooting",
    sport: "Basketball",
    subcategory: "Shooting",
    exercises: [
      {
        name: "Catch & Shoot",
        sets: [
          { targetKg: 0, targetReps: 20 },
          { targetKg: 0, targetReps: 20 },
          { targetKg: 0, targetReps: 20 },
        ],
      },
      {
        name: "Off-Dribble Pullup",
        sets: [
          { targetKg: 0, targetReps: 12 },
          { targetKg: 0, targetReps: 12 },
          { targetKg: 0, targetReps: 12 },
        ],
      },
    ],
  },
  5: {
    id: "friday-upper",
    title: "Upper Body Power",
    sport: "Gym",
    subcategory: "Power",
    exercises: [
      {
        name: "Overhead Press",
        sets: [
          { targetKg: 40, targetReps: 8 },
          { targetKg: 45, targetReps: 6 },
          { targetKg: 50, targetReps: 5 },
        ],
      },
      {
        name: "Barbell Row",
        sets: [
          { targetKg: 55, targetReps: 10 },
          { targetKg: 60, targetReps: 8 },
          { targetKg: 65, targetReps: 8 },
        ],
      },
    ],
  },
  6: {
    id: "saturday-athleticism",
    title: "Athleticism",
    sport: "Basketball",
    subcategory: "Athleticism",
    exercises: [
      {
        name: "Sprints",
        sets: [
          { targetKg: 0, targetReps: 8 },
          { targetKg: 0, targetReps: 8 },
          { targetKg: 0, targetReps: 8 },
        ],
      },
      {
        name: "Box Jumps",
        sets: [
          { targetKg: 0, targetReps: 10 },
          { targetKg: 0, targetReps: 10 },
          { targetKg: 0, targetReps: 10 },
        ],
      },
    ],
  },
};

export const getTodayWorkoutPlan = (): WorkoutPlan => {
  const today = new Date().getDay();
  return WEEKLY_WORKOUT_PLAN[today] ?? WEEKLY_WORKOUT_PLAN[1];
};

export const getWorkoutPlanForDay = (day: number): WorkoutPlan =>
  WEEKLY_WORKOUT_PLAN[day] ?? WEEKLY_WORKOUT_PLAN[1];

export const getDateForWeekday = (dayIndex: number, fromDate = new Date()) => {
  const normalizedDay = ((dayIndex % 7) + 7) % 7;
  const currentDay = fromDate.getDay();
  const diff = (normalizedDay - currentDay + 7) % 7;
  const result = new Date(fromDate);
  result.setHours(0, 0, 0, 0);
  result.setDate(fromDate.getDate() + diff);
  return result;
};

export const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getWeekdayName = (date: Date) =>
  date.toLocaleDateString("de-DE", { weekday: "long" });

export const buildWorkoutStorageKey = (date: string) =>
  `${WORKOUT_PROGRESS_PREFIX}${date}`;

export const getTodayDateKey = () => toLocalDateKey(new Date());

export const buildSetLogKey = (exerciseIndex: number, setIndex: number) =>
  `${exerciseIndex}-${setIndex}`;

export const getDefaultWorkoutProgress = (
  date: string,
  workout: WorkoutPlan,
): WorkoutProgress => ({
  date,
  status: "not_started",
  workoutId: workout.id,
  title: workout.title,
  sport: workout.sport,
  subcategory: workout.subcategory,
  exerciseIndex: 0,
  setIndex: 0,
  logs: {},
});


export const parseWorkoutProgress = (
  raw: string | null,
  fallback: WorkoutProgress,
): WorkoutProgress => {
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as WorkoutProgress;

    if (!parsed.workoutId) {
      return fallback;
    }

    if (parsed.date && parsed.date !== fallback.date) {
      return fallback;
    }

    return parsed;
  } catch {
    return fallback;
  }
  
};