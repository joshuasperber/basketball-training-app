import type { MetricKey } from "@/lib/training-data";
import { loadExercises } from "@/lib/training-storage";
import type { WorkoutPlan } from "@/lib/workout";
import type { Category } from "@/lib/training-data";

export type ManualDayWorkout = {
  id: string;
  title: string;
  sport: "Basketball" | "Gym" | "Home" | "Regeneration" | "Rest";
  subcategory: string;
  notes: string;
  exerciseIds: string[];
  basketballMode?: "basketball_training" | "game_training" | "game";
  durationMin?: number;
};

export type BasketballMode = "basketball_training" | "game_training" | "game";

export const DEFAULT_MANUAL_TITLE = "Manuelles Workout";

export function workoutSportToCategory(sport: WorkoutPlan["sport"]): Category | null {
  return sport === "Rest" ? null : sport;
}

export function newManualDayWorkoutId(editingId: string | null): string {
  if (editingId) return editingId;
  return `manual-day-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function deriveSmartWorkoutTitle(
  category: "Basketball" | "Gym" | "Home" | "Regeneration",
  exercises: ReturnType<typeof loadExercises>,
): string {
  if (exercises.length === 0) return DEFAULT_MANUAL_TITLE;
  if (exercises.length === 1) return exercises[0].name;

  const subcatCounts = new Map<string, number>();
  exercises.forEach((exercise) => {
    const sub = exercise.subcategory?.trim() || category;
    subcatCounts.set(sub, (subcatCounts.get(sub) ?? 0) + 1);
  });
  const sortedSubs = [...subcatCounts.entries()].sort((a, b) => b[1] - a[1]);
  const subcategories = sortedSubs.map(([sub]) => sub);

  if (subcategories.length === 1) {
    const sub = subcategories[0];
    if (exercises.length >= 4) return `${sub} Komplett`;
    return `${sub} Fokus`;
  }

  if (subcategories.length === 2) {
    return `${subcategories[0]} + ${subcategories[1]}`;
  }

  return `${category} Mix (${exercises.length} Übungen)`;
}

export function normalizeExerciseFamily(name: string) {
  return name
    .toLowerCase()
    .replace(/\s*-\s*(rechts|links|right|left)\b/g, "")
    .replace(/\s*[-–]?\s*\d+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildGroupedExercisesByFamily(params: {
  exerciseIds: string[];
  category: "Basketball" | "Gym" | "Home" | "Regeneration";
  subcategory: string;
  exercises: ReturnType<typeof loadExercises>;
}) {
  const baseExercises = params.exerciseIds
    .map((exerciseId) => params.exercises.find((exercise) => exercise.id === exerciseId))
    .filter((exercise): exercise is NonNullable<typeof exercise> => Boolean(exercise && exercise.category === params.category));

  const familyKeys = new Set(baseExercises.map((exercise) => normalizeExerciseFamily(exercise.name)));
  const grouped = params.exercises.filter(
    (exercise) =>
      exercise.category === params.category &&
      exercise.subcategory === params.subcategory &&
      familyKeys.has(normalizeExerciseFamily(exercise.name)),
  );

  const merged = [...baseExercises, ...grouped];
  const uniqueById = new Map(merged.map((exercise) => [exercise.id, exercise]));
  return Array.from(uniqueById.values());
}

export function expandExercisesWithFamily(params: {
  selectedExerciseIds: string[];
  category: "Basketball" | "Gym" | "Home" | "Regeneration";
  subcategory?: string;
  exercises: ReturnType<typeof loadExercises>;
}) {
  const selected = params.selectedExerciseIds
    .map((exerciseId) => params.exercises.find((exercise) => exercise.id === exerciseId))
    .filter((exercise): exercise is NonNullable<typeof exercise> => Boolean(exercise && exercise.category === params.category));
  if (!selected.length) return [];
  const families = new Set(selected.map((exercise) => normalizeExerciseFamily(exercise.name)));
  const related = params.exercises.filter(
    (exercise) =>
      exercise.category === params.category &&
      (!params.subcategory || exercise.subcategory === params.subcategory) &&
      families.has(normalizeExerciseFamily(exercise.name)),
  );
  const unique = new Map([...selected, ...related].map((exercise) => [exercise.id, exercise]));
  return Array.from(unique.values());
}

export function getExercisePrimaryTargetValue(exercise: ReturnType<typeof loadExercises>[number]) {
  const metricOrder: MetricKey[] = exercise.metricKeys?.length ? exercise.metricKeys : ["reps"];
  const primaryMetric: MetricKey = metricOrder[0];
  const primaryTarget = exercise.targetByMetric?.[primaryMetric];
  if (primaryTarget !== undefined) return primaryTarget;

  return (
    exercise.targetByMetric?.reps ??
    exercise.targetByMetric?.makes ??
    exercise.targetByMetric?.time ??
    exercise.targetByMetric?.points ??
    exercise.targetByMetric?.distance ??
    exercise.targetByMetric?.weight ??
    exercise.targetValue ??
    12
  );
}

export function buildExerciseSets(exercise: ReturnType<typeof loadExercises>[number]) {
  const setCount = Math.max(1, exercise.setCount ?? 1);
  const perSetTargets = exercise.setTargetsByMetric ?? [];
  return Array.from({ length: setCount }, (_, index) => {
    const perSet = perSetTargets[index];
    const fallbackKg = exercise.trackingType === "weight" ? exercise.targetByMetric?.weight ?? exercise.targetValue ?? 0 : 0;
    const fallbackReps = getExercisePrimaryTargetValue(exercise);
    return {
      targetKg: perSet?.weight ?? fallbackKg,
      targetReps:
        perSet?.reps ??
        perSet?.makes ??
        perSet?.time ??
        perSet?.points ??
        fallbackReps,
    };
  });
}

export function roundWorkoutMinutes(minutes: number) {
  return Math.max(5, Math.ceil(Math.max(0, minutes) * 1.1 / 5) * 5);
}

export function roundUpToFiveMinutes(minutes: number) {
  if (minutes <= 0) return 0;
  return Math.ceil(minutes / 5) * 5;
}

export function getDurationForSetCount(
  exercise: ReturnType<typeof loadExercises>[number] | null | undefined,
  actualSetCount: number,
) {
  if (!exercise) return 0;
  const baseSetCount = Math.max(1, exercise.setCount ?? 1);
  const perSetMinutes = Math.max(0, exercise.durationMin) / baseSetCount;
  return perSetMinutes * Math.max(1, actualSetCount);
}

export function getExtraSetDuration(
  exercise: ReturnType<typeof loadExercises>[number] | null | undefined,
  actualSetCount: number,
) {
  if (!exercise) return 0;
  const baseSetCount = Math.max(1, exercise.setCount ?? 1);
  const extraSets = Math.max(0, actualSetCount - baseSetCount);
  if (extraSets <= 0) return 0;
  return (Math.max(0, exercise.durationMin) / baseSetCount) * extraSets;
}

export function buildBasketballWarmupExerciseIds(params: {
  exercises: ReturnType<typeof loadExercises>;
  minutes: number;
}) {
  const preferredOrder = ["Handles", "Shooting", "Finishing"];
  const pool = params.exercises.filter(
    (exercise) =>
      exercise.category === "Basketball" &&
      preferredOrder.includes(exercise.subcategory),
  );
  const sorted = [...pool].sort((left, right) => {
    const leftIdx = preferredOrder.indexOf(left.subcategory);
    const rightIdx = preferredOrder.indexOf(right.subcategory);
    if (leftIdx !== rightIdx) return leftIdx - rightIdx;
    return left.name.localeCompare(right.name);
  });

  let total = 0;
  const selected: string[] = [];
  sorted.forEach((exercise) => {
    if (selected.length >= 8) return;
    if (total >= params.minutes && selected.length >= 3) return;
    selected.push(exercise.id);
    total += Math.max(5, exercise.durationMin || 10);
  });
  return selected;
}
