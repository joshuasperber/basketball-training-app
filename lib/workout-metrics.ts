import type { Category, Exercise, MetricKey } from "@/lib/training-data";
import type { SetLog } from "@/lib/workout";
import type { WorkoutSessionLog } from "@/lib/session-storage";

export type DistanceUnit = "m" | "km";
export type ShotZone = "free_throw" | "two_pointer" | "three_pointer" | "general";

export const METRIC_LABELS: Record<MetricKey, string> = {
  reps: "Reps",
  weight: "Gewicht",
  time: "Zeit",
  distance: "Distanz",
  makes: "Makes",
  misses: "Misses",
  points: "Punkte",
};

export const METRICS_BY_CATEGORY: Record<Category, MetricKey[]> = {
  Basketball: ["reps", "makes", "misses", "points", "time"],
  Gym: ["reps", "weight", "time", "distance"],
  Home: ["reps", "weight", "time", "distance"],
  Regeneration: ["reps", "time", "distance"],
};

const SHOOTING_METRICS: MetricKey[] = ["reps", "makes", "misses"];

export function normalizeMetricKeysForCategory(category: Category, metricKeys: MetricKey[]): MetricKey[] {
  const allowed = METRICS_BY_CATEGORY[category];
  const input = metricKeys.filter((metric) => allowed.includes(metric));
  const hasShootingMetric = input.some((metric) => SHOOTING_METRICS.includes(metric));
  const withShooting = hasShootingMetric
    ? [...SHOOTING_METRICS, ...input.filter((metric) => !SHOOTING_METRICS.includes(metric))]
    : input;
  const withDistanceTime =
    withShooting.includes("distance") && !withShooting.includes("time")
      ? [...withShooting, "time" as MetricKey]
      : withShooting;
  return Array.from(new Set(withDistanceTime.length > 0 ? withDistanceTime : [allowed[0]]));
}

export function shouldUseShootingInputs(metricKeys: MetricKey[]) {
  return metricKeys.some((metric) => SHOOTING_METRICS.includes(metric));
}

export function parseNonNegativeNumber(value?: string | null) {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

export function completeShootingValues(values: { reps?: string; makes?: string; misses?: string }) {
  const reps = parseNonNegativeNumber(values.reps);
  const makes = parseNonNegativeNumber(values.makes);
  const misses = parseNonNegativeNumber(values.misses);
  const hasReps = Boolean(values.reps?.trim());
  const hasMakes = Boolean(values.makes?.trim());
  const hasMisses = Boolean(values.misses?.trim());

  if (hasReps && hasMakes) {
    const safeMakes = Math.min(makes, reps);
    return { reps, makes: safeMakes, misses: Math.max(0, reps - safeMakes) };
  }
  if (hasReps && hasMisses) {
    const safeMisses = Math.min(misses, reps);
    return { reps, makes: Math.max(0, reps - safeMisses), misses: safeMisses };
  }
  if (hasMakes && hasMisses) {
    return { reps: makes + misses, makes, misses };
  }
  if (hasReps) return { reps, makes: 0, misses: 0 };
  if (hasMakes) return { reps: makes, makes, misses: 0 };
  if (hasMisses) return { reps: misses, makes: 0, misses };
  return { reps: 0, makes: 0, misses: 0 };
}

export function validateSetLogForMetrics(log: Partial<SetLog>, metricKeys: MetricKey[]) {
  if (shouldUseShootingInputs(metricKeys)) {
    const reps = parseNonNegativeNumber(log.reps);
    const makes = parseNonNegativeNumber(log.makes);
    const misses = parseNonNegativeNumber(log.misses);
    if (reps > 0) {
      if (makes > reps) return "Makes darf nicht größer als Reps sein.";
      if (misses > reps) return "Misses darf nicht größer als Reps sein.";
      if (makes > 0 && misses > 0 && makes + misses > reps) return "Makes + Misses darf nicht größer als Reps sein.";
    }
  }
  if (metricKeys.includes("distance") && parseNonNegativeNumber(log.distance) > 0 && parseNonNegativeNumber(log.time) <= 0) {
    return "Bitte gib bei Distanz auch eine Zeit an.";
  }
  return null;
}

export function distanceToMeters(distance: number, unit: DistanceUnit = "m") {
  return unit === "km" ? distance * 1000 : distance;
}

export function inferShotZone(exercise?: Pick<Exercise, "name" | "subcategory"> | null): ShotZone {
  const text = `${exercise?.name ?? ""} ${exercise?.subcategory ?? ""}`.toLowerCase();
  if (text.includes("free") || text.includes("freiwurf")) return "free_throw";
  if (text.includes("3") || text.includes("three") || text.includes("dreier")) return "three_pointer";
  if (text.includes("2") || text.includes("midrange") || text.includes("layup") || text.includes("finish")) return "two_pointer";
  return "general";
}

export function buildSessionLogFromSet(params: {
  exercise: Pick<Exercise, "id" | "category" | "subcategory" | "metricKeys" | "name">;
  log: Partial<SetLog> | undefined;
  setTargetReps?: number;
  note?: string;
  rpe?: number | null;
}): WorkoutSessionLog {
  const metricKeys = normalizeMetricKeysForCategory(params.exercise.category, params.exercise.metricKeys);
  const log = params.log ?? {};
  const shooting = completeShootingValues(log);
  const timeSeconds = parseNonNegativeNumber(log.time);
  const distanceValue = parseNonNegativeNumber(log.distance);
  const distanceUnit = (log.distanceUnit === "km" ? "km" : "m") as DistanceUnit;
  const repsAllowed =
    metricKeys.includes("reps") &&
    !(params.exercise.category === "Basketball" && params.exercise.subcategory.toLowerCase() === "conditioning");
  const reps = shouldUseShootingInputs(metricKeys) ? shooting.reps : repsAllowed ? parseNonNegativeNumber(log.reps) : 0;
  const weight = parseNonNegativeNumber(log.weight);

  return {
    exerciseId: params.exercise.id,
    completedValue: reps > 0 ? reps : null,
    completed: true,
    note: params.note ?? log.note?.trim() ?? "",
    made: shouldUseShootingInputs(metricKeys) ? shooting.makes : null,
    attempts: shouldUseShootingInputs(metricKeys) ? shooting.reps : reps > 0 ? reps : null,
    misses: shouldUseShootingInputs(metricKeys) ? shooting.misses : null,
    weightKg: weight > 0 ? weight : null,
    rpe: params.rpe ?? null,
    timeSeconds: timeSeconds > 0 ? timeSeconds : null,
    distanceMeters: distanceValue > 0 ? distanceToMeters(distanceValue, distanceUnit) : null,
    distanceUnit,
    points: metricKeys.includes("points") ? parseNonNegativeNumber(log.points) || null : null,
    shotZone: shouldUseShootingInputs(metricKeys) ? inferShotZone(params.exercise) : null,
  };
}

export function repCountFromSessionLog(log: WorkoutSessionLog, exercise?: Pick<Exercise, "category" | "subcategory" | "metricKeys"> | null) {
  if (exercise?.category === "Basketball" && exercise.subcategory.toLowerCase() === "conditioning") return 0;
  const metricKeys = exercise ? normalizeMetricKeysForCategory(exercise.category, exercise.metricKeys) : [];
  if (shouldUseShootingInputs(metricKeys)) return Math.max(0, log.attempts ?? (log.made ?? 0) + (log.misses ?? 0));
  if (metricKeys.includes("reps")) return Math.max(0, log.attempts ?? log.completedValue ?? 0);
  return 0;
}
