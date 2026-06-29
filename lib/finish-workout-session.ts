import type { Category, Exercise, MetricKey } from "@/lib/training-data";
import { loadExercises, loadWorkouts } from "@/lib/training-storage";
import { applyGymGoalsAfterSession } from "@/lib/training-goals";
import { appendWorkoutXpEntry } from "@/lib/level-system";
import {
  buildPausedWorkoutId,
  unregisterPausedWorkout,
  type PausedWorkoutEntry,
} from "@/lib/paused-workouts";
import { appendWorkoutSession } from "@/lib/session-storage";
import { syncWorkoutSessionsToCloudWithRetry } from "@/lib/sync-workout-sessions";
import { countTrackedSetsInLogs } from "@/lib/workout-session-metrics";
import { persistWorkoutHistoryEntry } from "@/lib/workout-history";
import {
  buildSetLogKey,
  buildWorkoutStorageKey,
  getWorkoutPlanForDay,
  parseSetRpe,
  WEEKLY_WORKOUT_PLAN,
  WORKOUT_OVERRIDE_PREFIX,
  type CompletedWorkoutHistoryEntry,
  type SetLog,
  type WorkoutPlan,
  type WorkoutProgress,
} from "@/lib/workout";
import {
  buildSessionLogFromSet,
  repCountFromSessionLog,
} from "@/lib/workout-metrics";
import { MANUAL_DAY_WORKOUTS_KEY } from "@/lib/activity-calendar";

type ManualDayWorkout = {
  id: string;
  title: string;
  sport: WorkoutPlan["sport"];
  subcategory: string;
  exerciseIds: string[];
  durationMin?: number;
};

export type FinishWorkoutResult = {
  ok: boolean;
  error?: string;
  levelDelta?: number;
  bannerMessage?: string;
};

function workoutSportToCategory(sport: WorkoutPlan["sport"]): Category | null {
  if (sport === "Gym" || sport === "Basketball" || sport === "Home" || sport === "Regeneration") return sport;
  return null;
}

function getExercisePrimaryTargetValue(exercise: Exercise) {
  const metricOrder: MetricKey[] = exercise.metricKeys?.length ? exercise.metricKeys : ["reps"];
  const primaryMetric = metricOrder[0];
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

function buildExerciseSets(exercise: Exercise) {
  const setCount = Math.max(1, exercise.setCount ?? 1);
  const perSetTargets = exercise.setTargetsByMetric ?? [];
  return Array.from({ length: setCount }, (_, index) => {
    const perSet = perSetTargets[index];
    const fallbackKg = exercise.trackingType === "weight" ? exercise.targetByMetric?.weight ?? exercise.targetValue ?? 0 : 0;
    const fallbackReps = getExercisePrimaryTargetValue(exercise);
    return {
      targetKg: perSet?.weight ?? fallbackKg,
      targetReps: perSet?.reps ?? perSet?.makes ?? perSet?.time ?? perSet?.points ?? fallbackReps,
    };
  });
}

function roundWorkoutMinutes(minutes: number) {
  return Math.max(5, Math.ceil((Math.max(0, minutes) * 1.1) / 5) * 5);
}

function roundUpToFiveMinutes(minutes: number) {
  if (minutes <= 0) return 0;
  return Math.ceil(minutes / 5) * 5;
}

function getDurationForSetCount(exercise: Exercise | null | undefined, actualSetCount: number) {
  if (!exercise) return 0;
  const baseSetCount = Math.max(1, exercise.setCount ?? 1);
  const perSetMinutes = Math.max(0, exercise.durationMin) / baseSetCount;
  return perSetMinutes * Math.max(1, actualSetCount);
}

function getExtraSetDuration(exercise: Exercise | null | undefined, actualSetCount: number) {
  if (!exercise) return 0;
  const baseSetCount = Math.max(1, exercise.setCount ?? 1);
  const extraSets = Math.max(0, actualSetCount - baseSetCount);
  if (extraSets <= 0) return 0;
  return (Math.max(0, exercise.durationMin) / baseSetCount) * extraSets;
}

function parseNonNegative(value?: string) {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

export function setLogHasStarted(log: Partial<SetLog> | undefined) {
  if (!log) return false;
  const reps = Number(log.reps) || 0;
  const weight = Number(log.weight) || 0;
  const tries = parseNonNegative(log.reps) || parseNonNegative(log.tries);
  const makes = Number(log.makes) || 0;
  const misses = Number(log.misses) || 0;
  return reps > 0 || weight > 0 || tries > 0 || makes > 0 || misses > 0 || log.completed === true || Boolean(log.completedAtIso);
}

function buildManualWorkoutPlan(entry: ManualDayWorkout, exercises: Exercise[]): WorkoutPlan | null {
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

function synthesizeWorkoutPlanFromProgress(progress: WorkoutProgress): WorkoutPlan {
  const exerciseIndices = new Set<number>();
  for (const key of Object.keys(progress.logs)) {
    const match = /^(\d+)-/.exec(key);
    if (match) exerciseIndices.add(Number(match[1]));
  }
  const sorted = [...exerciseIndices].sort((a, b) => a - b);
  const exercises =
    sorted.length > 0
      ? sorted.map((exerciseIndex) => {
          const setIndices = Object.keys(progress.logs)
            .filter((key) => key.startsWith(`${exerciseIndex}-`))
            .map((key) => Number(key.split("-")[1] ?? 0));
          const maxSet = setIndices.length ? Math.max(...setIndices) : 0;
          return {
            name: `Übung ${exerciseIndex + 1}`,
            sets: Array.from({ length: maxSet + 1 }, () => ({ targetKg: 0, targetReps: 20 })),
          };
        })
      : [{ name: progress.title, sets: [{ targetKg: 0, targetReps: 20 }] }];
  return {
    id: progress.workoutId,
    title: progress.title,
    sport: progress.sport,
    subcategory: progress.subcategory,
    exercises,
  };
}

export function resolveWorkoutPlan(progress: WorkoutProgress): WorkoutPlan {
  const { workoutId, date: dateKey } = progress;
  const exercises = loadExercises();
  const catalogWorkouts = loadWorkouts();

  const catalog = catalogWorkouts.find((entry) => entry.id === workoutId);
  if (catalog) {
    const catalogExercises = catalog.exerciseIds
      .map((exerciseId) => exercises.find((exercise) => exercise.id === exerciseId))
      .filter((exercise): exercise is Exercise => Boolean(exercise));
    if (catalogExercises.length) {
      return {
        id: catalog.id,
        title: catalog.name,
        sport: catalog.category === "Gym" ? "Gym" : catalog.category === "Home" ? "Home" : "Basketball",
        subcategory: catalog.subcategory,
        durationMin: roundWorkoutMinutes(
          catalogExercises.reduce((sum, exercise) => sum + Math.max(0, exercise.durationMin), 0),
        ),
        exercises: catalogExercises.map((exercise) => ({
          exerciseId: exercise.id,
          name: exercise.name,
          sets: buildExerciseSets(exercise),
        })),
      };
    }
  }

  if (typeof window !== "undefined") {
    const manualRaw = window.localStorage.getItem(MANUAL_DAY_WORKOUTS_KEY);
    if (manualRaw) {
      try {
        const store = JSON.parse(manualRaw) as Record<string, ManualDayWorkout[]>;
        const manualEntry = (store[dateKey] ?? []).find((entry) => entry.id === workoutId);
        if (manualEntry) {
          const manualPlan = buildManualWorkoutPlan(manualEntry, exercises);
          if (manualPlan) return manualPlan;
        }
      } catch {
        // Ignore invalid manual store.
      }
    }

    const overrideId = window.localStorage.getItem(`${WORKOUT_OVERRIDE_PREFIX}${dateKey}`);
    if (overrideId) {
      const overridePlan = Object.values(WEEKLY_WORKOUT_PLAN).find((plan) => plan.id === overrideId);
      if (overridePlan && overridePlan.id === workoutId) return overridePlan;
    }
  }

  for (const plan of Object.values(WEEKLY_WORKOUT_PLAN)) {
    if (plan.id === workoutId) return plan;
  }

  const dayIndex = new Date(`${dateKey}T12:00:00`).getDay();
  const dayPlan = getWorkoutPlanForDay(dayIndex);
  if (dayPlan.id === workoutId) return dayPlan;

  return synthesizeWorkoutPlanFromProgress(progress);
}

export function finishWorkoutSession(input: {
  progress: WorkoutProgress;
  workoutPlan: WorkoutPlan;
  progressStorageKey: string;
  allowPartial: boolean;
  allowEmptyFinish?: boolean;
  isCatalogWorkoutRun?: boolean;
}): FinishWorkoutResult {
  if (typeof window === "undefined") return { ok: false, error: "Nur im Browser verfügbar." };

  const trainingExercises = loadExercises();
  const {
    progress: sourceProgress,
    workoutPlan,
    progressStorageKey,
    allowPartial,
    allowEmptyFinish = false,
    isCatalogWorkoutRun = false,
  } = input;
  const dateKey = sourceProgress.date;

  const startedSetCount = Object.entries(sourceProgress.logs).filter(([, log]) => setLogHasStarted(log)).length;
  if (startedSetCount === 0 && !allowEmptyFinish) {
    return { ok: false, error: "Es wurden noch keine Sätze erfasst." };
  }

  const endedAtIso = new Date().toISOString();
  const runStartedAtIso = sourceProgress.startedAtIso ?? sourceProgress.endedAtIso ?? endedAtIso;
  const elapsedSeconds =
    (sourceProgress.elapsedSeconds ?? 0) +
    (sourceProgress.status === "in_progress" && sourceProgress.startedAtIso
      ? Math.max(
          0,
          Math.round((Date.parse(endedAtIso) - Date.parse(sourceProgress.startedAtIso)) / 1000),
        )
      : 0);

  const completedProgress: WorkoutProgress = {
    ...sourceProgress,
    status: "completed",
    endedAtIso,
    elapsedSeconds,
    startedAtIso: undefined,
  };

  const exerciseMeta = workoutPlan.exercises.map((exercise) =>
    exercise.exerciseId
      ? trainingExercises.find((item) => item.id === exercise.exerciseId) ??
        trainingExercises.find((item) => item.name === exercise.name) ??
        null
      : trainingExercises.find((item) => item.name === exercise.name) ?? null,
  );

  const sessionLogsFromProgress = workoutPlan.exercises.flatMap((exercise, exerciseIndex) => {
    const exerciseDef = exerciseMeta[exerciseIndex];
    const exerciseId = exercise.exerciseId ?? exerciseDef?.id ?? `custom-${exerciseIndex}-${exercise.name}`;
    const fallbackCategory = workoutSportToCategory(workoutPlan.sport) ?? "Basketball";
    const sessionExercise =
      exerciseDef ??
      ({
        id: exerciseId,
        name: exercise.name,
        durationMin: 0,
        category: fallbackCategory,
        subcategory: workoutPlan.subcategory,
        metricKeys: ["reps"] as MetricKey[],
        trackingType: "reps" as const,
      } satisfies Exercise);

    return exercise.sets.flatMap((set, setIndex) => {
      const log = completedProgress.logs[buildSetLogKey(exerciseIndex, setIndex)];
      if (allowPartial && !setLogHasStarted(log)) return [];
      return [
        buildSessionLogFromSet({
          exercise: sessionExercise,
          log,
          setTargetReps: set.targetReps,
          rpe: parseSetRpe(log?.rpe),
        }),
      ];
    });
  });

  if (sessionLogsFromProgress.length === 0) {
    if (!allowEmptyFinish) {
      return { ok: false, error: "Keine erfassten Sätze zum Speichern." };
    }

    window.localStorage.removeItem(progressStorageKey);
    window.localStorage.removeItem(buildWorkoutStorageKey(dateKey));
    unregisterPausedWorkout(buildPausedWorkoutId(sourceProgress.date, sourceProgress.workoutId));
    window.dispatchEvent(new Event("bt:workout-progress-updated"));
    window.dispatchEvent(new Event("bt:paused-workouts-updated"));
    return {
      ok: true,
      bannerMessage: "Workout beendet — es wurden keine Sätze erfasst.",
    };
  }

  const exerciseLookupForSession = new Map(
    exerciseMeta.filter((exercise): exercise is Exercise => Boolean(exercise)).map((exercise) => [exercise.id, exercise]),
  );
  const repCountForHistory = (log: (typeof sessionLogsFromProgress)[number]) =>
    repCountFromSessionLog(log, exerciseLookupForSession.get(log.exerciseId));

  const historyEntry: CompletedWorkoutHistoryEntry = {
    id: isCatalogWorkoutRun
      ? `${completedProgress.date}-${completedProgress.workoutId}-${runStartedAtIso}`
      : `${completedProgress.date}-${completedProgress.workoutId}`,
    date: completedProgress.date,
    workoutId: completedProgress.workoutId,
    title: completedProgress.title,
    sport: completedProgress.sport,
    subcategory: completedProgress.subcategory,
    totalSets: countTrackedSetsInLogs(sessionLogsFromProgress),
    totalReps: sessionLogsFromProgress.reduce((sum, log) => sum + repCountForHistory(log), 0),
    totalVolumeKg: sessionLogsFromProgress.reduce(
      (sum, log) => sum + repCountForHistory(log) * Math.max(0, log.weightKg ?? 0),
      0,
    ),
  };
  persistWorkoutHistoryEntry(historyEntry);

  const rpeSamples = sessionLogsFromProgress.map((log) => log.rpe).filter((v): v is number => typeof v === "number");
  const avgRpe =
    rpeSamples.length > 0 ? Math.round((rpeSamples.reduce((a, b) => a + b, 0) / rpeSamples.length) * 10) / 10 : null;

  const extraSetMinutes = workoutPlan.exercises.reduce((sum, exercise, exerciseIndex) => {
    const exerciseDef = exercise.exerciseId
      ? trainingExercises.find((item) => item.id === exercise.exerciseId) ??
        trainingExercises.find((item) => item.name === exercise.name)
      : trainingExercises.find((item) => item.name === exercise.name);
    return sum + getExtraSetDuration(exerciseDef ?? null, exercise.sets.length);
  }, 0);

  const calculatedDurationMinutes = workoutPlan.exercises.reduce((sum, exercise, exerciseIndex) => {
    const exerciseDef = exercise.exerciseId
      ? trainingExercises.find((item) => item.id === exercise.exerciseId) ??
        trainingExercises.find((item) => item.name === exercise.name)
      : trainingExercises.find((item) => item.name === exercise.name);
    return sum + getDurationForSetCount(exerciseDef ?? null, exercise.sets.length);
  }, 0);

  const attributedDurationMinutes =
    workoutPlan.durationMin && workoutPlan.durationMin > 0
      ? roundUpToFiveMinutes(workoutPlan.durationMin + extraSetMinutes)
      : roundUpToFiveMinutes(calculatedDurationMinutes);

  const plannedDurationSeconds = attributedDurationMinutes > 0 ? attributedDurationMinutes * 60 : 0;
  const durationSeconds =
    plannedDurationSeconds > 0
      ? plannedDurationSeconds
      : completedProgress.elapsedSeconds && completedProgress.elapsedSeconds > 0
        ? Math.max(60, completedProgress.elapsedSeconds)
        : Math.max(300, sessionLogsFromProgress.length * 180);

  const sessionId = isCatalogWorkoutRun
    ? `${completedProgress.date}-${completedProgress.workoutId}-${runStartedAtIso}`
    : `${completedProgress.date}-${completedProgress.workoutId}`;

  appendWorkoutSession({
    id: `ws-${sessionId}`,
    dateISO: new Date(`${dateKey}T12:00:00`).toISOString(),
    workoutId: completedProgress.workoutId,
    workoutName: completedProgress.title,
    workoutCategory: completedProgress.sport,
    workoutSubcategory: completedProgress.subcategory,
    sessionNotes: allowPartial ? "Workout vorzeitig beendet" : "",
    durationSeconds,
    avgRpe,
    allowMultiple: isCatalogWorkoutRun,
    logs: sessionLogsFromProgress,
  });

  if (completedProgress.sport === "Gym") {
    applyGymGoalsAfterSession({
      id: `ws-${sessionId}`,
      dateISO: new Date(`${dateKey}T12:00:00`).toISOString(),
      workoutId: completedProgress.workoutId,
      workoutName: completedProgress.title,
      workoutCategory: completedProgress.sport,
      workoutSubcategory: completedProgress.subcategory,
      durationSeconds,
      avgRpe,
      logs: sessionLogsFromProgress,
    });
  }

  let achievedSets = 0;
  let completedSetCount = 0;
  const completedExercises = new Set<number>();
  workoutPlan.exercises.forEach((exercise, exerciseIndex) => {
    let exerciseWasCompleted = false;
    let exerciseTargetMet = false;
    exercise.sets.forEach((set, setIndex) => {
      const log = completedProgress.logs[buildSetLogKey(exerciseIndex, setIndex)];
      if (allowPartial && !setLogHasStarted(log)) return;
      const reps = Number(log?.reps) || 0;
      const makes = Number(log?.makes) || 0;
      const weight = Number(log?.weight) || 0;
      const tries = parseNonNegative(log?.reps) || parseNonNegative(log?.tries);
      const misses = Number(log?.misses) || 0;
      const time = Number(log?.time) || 0;
      const distance = Number(log?.distance) || 0;
      const points = Number(log?.points) || 0;
      const setCompleted = log?.completed ?? true;
      const effectiveReps = makes > 0 ? makes : reps;
      const repsMet = effectiveReps >= set.targetReps;
      const weightMet = set.targetKg <= 0 || weight >= set.targetKg;
      if (
        setCompleted &&
        (effectiveReps > 0 || weight > 0 || tries > 0 || misses > 0 || makes > 0 || time > 0 || distance > 0 || points > 0)
      ) {
        exerciseWasCompleted = true;
        completedExercises.add(exerciseIndex);
      }
      if (setCompleted && repsMet && weightMet) exerciseTargetMet = true;
    });
    if (exerciseWasCompleted) completedSetCount += 1;
    if (exerciseTargetMet) achievedSets += 1;
  });

  const trackedExerciseIds = new Set(sessionLogsFromProgress.map((log) => log.exerciseId));
  completedSetCount = Math.max(completedSetCount, trackedExerciseIds.size);
  const qualityScore = completedSetCount > 0 ? achievedSets / completedSetCount : 0;

  const targetMakes = workoutPlan.exercises.reduce(
    (sum, _, exerciseIndex) => sum + Math.max(0, exerciseMeta[exerciseIndex]?.targetByMetric?.makes ?? 0),
    0,
  );
  const actualMakes = workoutPlan.exercises.reduce((sum, exercise, exerciseIndex) => {
    return (
      sum +
      exercise.sets.reduce((inner, _, setIndex) => {
        const log = completedProgress.logs[buildSetLogKey(exerciseIndex, setIndex)];
        if (allowPartial && !setLogHasStarted(log)) return inner;
        return inner + (Number(log?.makes) || 0);
      }, 0)
    );
  }, 0);
  const percentFactor = targetMakes > 0 ? Math.min(1.5, Math.max(0.5, actualMakes / targetMakes)) : 1;
  const completedExerciseCount = Math.max(completedExercises.size, trackedExerciseIds.size);
  const boundedWorkoutCount = completedExerciseCount > 0 ? 1 : 0;
  const exerciseXp = Math.round(completedExerciseCount * 12);
  const workoutXp = boundedWorkoutCount > 0 ? Math.round((20 + qualityScore * 30) * percentFactor) : 0;

  const xpResult = appendWorkoutXpEntry({
    id: `${completedProgress.date}-${completedProgress.workoutId}`,
    date: completedProgress.date,
    workoutId: completedProgress.workoutId,
    workoutTitle: completedProgress.title,
    exerciseXp,
    workoutXp,
    totalXp: exerciseXp + workoutXp,
    achievedSets: Math.min(achievedSets, completedSetCount),
    totalSets: Math.max(1, completedSetCount),
    qualityScore,
  });

  window.localStorage.setItem(progressStorageKey, JSON.stringify(completedProgress));
  window.localStorage.setItem(buildWorkoutStorageKey(dateKey), JSON.stringify(completedProgress));
  unregisterPausedWorkout(buildPausedWorkoutId(completedProgress.date, completedProgress.workoutId));

  if (isCatalogWorkoutRun) {
    window.localStorage.removeItem(progressStorageKey);
    window.localStorage.removeItem(buildWorkoutStorageKey(dateKey));
  }

  window.dispatchEvent(new Event("bt:workout-progress-updated"));
  window.dispatchEvent(new Event("bt:sessions-updated"));
  void syncWorkoutSessionsToCloudWithRetry().catch(() => {});

  const bannerMessage = allowPartial
    ? "Workout beendet — erfasster Fortschritt wurde in Stats gespeichert."
    : "Stark! Workout abgeschlossen ✅";

  return { ok: true, levelDelta: xpResult.levelDelta, bannerMessage };
}

export function finishPausedWorkoutEntry(entry: PausedWorkoutEntry): FinishWorkoutResult {
  const workoutPlan = resolveWorkoutPlan(entry.progress);
  const isCatalogRun = Boolean(
    entry.progress.workoutId && loadWorkouts().some((workout) => workout.id === entry.progress.workoutId),
  );
  return finishWorkoutSession({
    progress: entry.progress,
    workoutPlan,
    progressStorageKey: entry.progressStorageKey,
    allowPartial: true,
    allowEmptyFinish: true,
    isCatalogWorkoutRun: isCatalogRun,
  });
}
