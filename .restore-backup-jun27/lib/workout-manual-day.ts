import type { Exercise } from "@/lib/training-data";
import type { WorkoutPlan } from "@/lib/workout";
import { buildExerciseSets, roundWorkoutMinutes, type ManualDayWorkout } from "@/lib/workout-page-utils";

export function buildManualWorkoutPlanFromEntry(
  entry: ManualDayWorkout,
  exercises: Exercise[],
): WorkoutPlan | null {
  if (entry.sport === "Rest") {
    return {
      id: entry.id,
      title: entry.title,
      sport: "Rest",
      subcategory: entry.subcategory,
      durationMin: entry.durationMin,
      exercises: [],
    };
  }
  const selectedExercises = entry.exerciseIds
    .map((exerciseId) => exercises.find((exercise) => exercise.id === exerciseId))
    .filter((exercise): exercise is Exercise => Boolean(exercise));
  if (!selectedExercises.length) return null;
  return {
    id: entry.id,
    title: entry.title,
    sport: entry.sport,
    subcategory: entry.subcategory,
    durationMin:
      entry.durationMin ??
      roundWorkoutMinutes(selectedExercises.reduce((sum, exercise) => sum + Math.max(0, exercise.durationMin), 0)),
    exercises: selectedExercises.map((exercise) => ({
      exerciseId: exercise.id,
      name: exercise.name,
      sets: buildExerciseSets(exercise),
    })),
  };
}

export function syncProfileDayConfigForManualWorkout(
  dayIndex: number,
  category: "Basketball" | "Gym" | "Home" | "Regeneration" | "Rest",
  minutes: number,
) {
  if (typeof window === "undefined") return;
  const dayMap: Record<number, "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday"> = {
    0: "sunday",
    1: "monday",
    2: "tuesday",
    3: "wednesday",
    4: "thursday",
    5: "friday",
    6: "saturday",
  };
  const dayKey = dayMap[((dayIndex % 7) + 7) % 7];
  const rawProfileCache = window.localStorage.getItem("profile_cache_v4");
  if (!rawProfileCache || !dayKey) return;
  try {
    const parsed = JSON.parse(rawProfileCache) as {
      weekConfig?: Record<string, { mode: string; minutes: number }>;
    };
    const currentWeek = parsed.weekConfig ?? {};
    const nextMode =
      category === "Gym"
        ? "gym"
        : category === "Rest"
          ? "unavailable"
          : category === "Basketball"
            ? "basketball_training"
            : category === "Regeneration"
              ? "recovery"
              : "custom";
    parsed.weekConfig = {
      ...currentWeek,
      [dayKey]: {
        mode: nextMode,
        minutes: Math.max(0, Math.round(minutes)),
      },
    };
    window.localStorage.setItem("profile_cache_v4", JSON.stringify(parsed));
    window.dispatchEvent(new Event("bt:plan-updated"));
  } catch {
    // noop
  }
}
