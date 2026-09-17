import type { Exercise, MetricKey } from "@/lib/training-data";
import type { WorkoutSessionEntry, WorkoutSessionLog } from "@/lib/session-storage";
import { repCountFromSessionLog } from "@/lib/workout-metrics";
import { workoutAlreadyCoversRecovery } from "@/lib/post-workout-regeneration";

const PERFORMANCE_METRICS: MetricKey[] = ["reps", "time", "distance", "weight", "makes", "points"];

export type HomeMetricProgress = {
  metric: MetricKey;
  target: number | null;
  latest: number | null;
  best: number | null;
};

export type HomeExerciseGoalStat = {
  exerciseId: string;
  exerciseName: string;
  subcategory: string;
  sessionCount: number;
  latestDateISO: string | null;
  metrics: HomeMetricProgress[];
};

export function isHomePerformanceExercise(exercise: Exercise): boolean {
  return exercise.category === "Home" && !workoutAlreadyCoversRecovery("Home", exercise.subcategory);
}

export function getPerformanceMetricTarget(exercise: Exercise, metric: MetricKey): number | null {
  const rawTarget =
    exercise.targetByMetric?.[metric] ??
    (exercise.metricKeys[0] === metric ? exercise.targetValue : undefined);
  if (rawTarget == null || !Number.isFinite(rawTarget) || rawTarget <= 0) return null;
  if (metric === "time" && exercise.timeUnit === "minutes") return rawTarget * 60;
  if (metric === "distance" && exercise.distanceUnit === "km") return rawTarget * 1000;
  return rawTarget;
}

function metricValue(log: WorkoutSessionLog, exercise: Exercise, metric: MetricKey): number | null {
  const value =
    metric === "reps"
      ? repCountFromSessionLog(log, exercise)
      : metric === "time"
        ? log.timeSeconds
        : metric === "distance"
          ? log.distanceMeters
          : metric === "weight"
            ? log.weightKg
            : metric === "makes"
              ? log.made
              : metric === "points"
                ? log.points
                : null;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function buildHomeExerciseGoalStats(
  exercises: Exercise[],
  sessions: WorkoutSessionEntry[],
): HomeExerciseGoalStat[] {
  return exercises
    .filter(isHomePerformanceExercise)
    .map((exercise) => {
      const exerciseSessions = sessions
        .filter((session) => session.logs.some((log) => log.exerciseId === exercise.id && log.completed !== false))
        .sort((left, right) => right.dateISO.localeCompare(left.dateISO));
      const latestSession = exerciseSessions[0] ?? null;
      const exerciseLogs = exerciseSessions.flatMap((session) =>
        session.logs.filter((log) => log.exerciseId === exercise.id && log.completed !== false),
      );
      const latestLogs = latestSession
        ? latestSession.logs.filter((log) => log.exerciseId === exercise.id && log.completed !== false)
        : [];
      const metrics = PERFORMANCE_METRICS.filter(
        (metric) => exercise.metricKeys.includes(metric) || exercise.targetByMetric?.[metric] != null,
      ).map((metric) => {
        const values = exerciseLogs
          .map((log) => metricValue(log, exercise, metric))
          .filter((value): value is number => value != null);
        const latestValues = latestLogs
          .map((log) => metricValue(log, exercise, metric))
          .filter((value): value is number => value != null);
        return {
          metric,
          target: getPerformanceMetricTarget(exercise, metric),
          latest: latestValues.length > 0 ? Math.max(...latestValues) : null,
          best: values.length > 0 ? Math.max(...values) : null,
        };
      });

      return {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        subcategory: exercise.subcategory,
        sessionCount: exerciseSessions.length,
        latestDateISO: latestSession?.dateISO ?? null,
        metrics,
      };
    })
    .sort((left, right) => {
      if (left.latestDateISO && right.latestDateISO) return right.latestDateISO.localeCompare(left.latestDateISO);
      if (left.latestDateISO) return -1;
      if (right.latestDateISO) return 1;
      const categoryOrder = left.subcategory.localeCompare(right.subcategory, "de");
      return categoryOrder || left.exerciseName.localeCompare(right.exerciseName, "de");
    });
}

export function formatPerformanceMetricValue(metric: MetricKey, value: number, exercise?: Exercise): string {
  if (metric === "time") {
    if (exercise?.timeUnit === "minutes") return `${Math.round((value / 60) * 10) / 10} Min.`;
    return `${Math.round(value * 10) / 10} Sek.`;
  }
  if (metric === "distance") {
    if (exercise?.distanceUnit === "km") return `${Math.round((value / 1000) * 100) / 100} km`;
    return `${Math.round(value * 10) / 10} m`;
  }
  if (metric === "weight") return `${Math.round(value * 10) / 10} kg`;
  return String(Math.round(value * 10) / 10);
}
