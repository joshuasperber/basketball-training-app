"use client";

import { useCallback, useRef, type MutableRefObject } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { MetricKey } from "@/lib/training-data";
import { finishWorkoutSession, setLogHasStarted } from "@/lib/finish-workout-session";
import { getPostWorkoutCompletionHref } from "@/lib/offline-navigation";
import { appendRegenerationTagsAfterWorkoutComplete } from "@/lib/post-workout-regeneration";
import type { SetLog, WorkoutPlan, WorkoutProgress } from "@/lib/workout";
import { getDefaultWorkoutProgress } from "@/lib/workout";
import { completeShootingValues, validateSetLogForMetrics } from "@/lib/workout-metrics";

type AppDialogLike = {
  confirm: (options: {
    message: string;
    confirmLabel?: string;
    tone?: "danger" | "default";
  }) => Promise<boolean>;
  alert: (options: { message: string }) => Promise<void>;
};

type UseWorkoutCompletionOptions = {
  progressRef: MutableRefObject<WorkoutProgress>;
  setProgress: (progress: WorkoutProgress) => void;
  workoutForExecution: WorkoutPlan;
  progressStorageKey: string;
  isCatalogWorkoutRun: boolean;
  dateKey: string;
  catalogReturnTo: string;
  router: AppRouterInstance;
  appDialog: AppDialogLike;
  persistProgress: (progress: WorkoutProgress) => void;
  activateProgressForInput: (progress?: WorkoutProgress) => WorkoutProgress;
  pauseWorkout: (progress?: WorkoutProgress) => void;
  getAccumulatedElapsedSeconds: (progress: WorkoutProgress, nowIso?: string) => number;
  isWorkoutFullyTracked: (progress?: WorkoutProgress) => boolean;
  getCurrentLogFromProgress: (progress: WorkoutProgress) => SetLog;
  currentLogKey: string;
  currentMetricOptions: MetricKey[];
  tracksRepsAndMakes: boolean;
  safeExerciseIndex: number;
  safeSetIndex: number;
  currentExercise: WorkoutPlan["exercises"][number] | undefined;
  setSetValidationError: (message: string | null) => void;
  setCompletionBanner: (message: string | null) => void;
  appendQueryParams: (href: string, params: Record<string, string>) => string;
  onCompleteStart?: () => void;
};

export function useWorkoutCompletion({
  progressRef,
  setProgress,
  workoutForExecution,
  progressStorageKey,
  isCatalogWorkoutRun,
  dateKey,
  catalogReturnTo,
  router,
  appDialog,
  persistProgress,
  activateProgressForInput,
  pauseWorkout,
  getAccumulatedElapsedSeconds,
  isWorkoutFullyTracked,
  getCurrentLogFromProgress,
  currentLogKey,
  currentMetricOptions,
  tracksRepsAndMakes,
  safeExerciseIndex,
  safeSetIndex,
  currentExercise,
  setSetValidationError,
  setCompletionBanner,
  appendQueryParams,
  onCompleteStart,
}: UseWorkoutCompletionOptions) {
  const completionRunLockRef = useRef<string | null>(null);
  const completedSessionKeysRef = useRef<Set<string>>(new Set());

  const resetCompletionRun = useCallback(() => {
    completionRunLockRef.current = null;
  }, []);

  const showLevelDeltaAlerts = useCallback(
    async (levelDelta?: number | null) => {
      if (levelDelta && levelDelta > 0) {
        await appDialog.alert({ message: `🎉 Level-Up! +${levelDelta} Level` });
      } else if (levelDelta && levelDelta < 0) {
        await appDialog.alert({ message: `⬇️ Level-Down: ${Math.abs(levelDelta)} Level verloren` });
      }
    },
    [appDialog],
  );

  const navigateAfterCompletion = useCallback(
    (freshProgress?: WorkoutProgress) => {
      if (freshProgress) {
        progressRef.current = freshProgress;
        setProgress(freshProgress);
      }
      if (isCatalogWorkoutRun) {
        router.push(getPostWorkoutCompletionHref(true, catalogReturnTo));
        return;
      }
      router.push(getPostWorkoutCompletionHref(false));
    },
    [catalogReturnTo, isCatalogWorkoutRun, progressRef, router, setProgress],
  );

  const clampShootingLog = useCallback(
    (log: SetLog): SetLog => {
      if (!tracksRepsAndMakes) return log;
      const completed = completeShootingValues({
        reps: log.reps,
        tries: log.tries,
        makes: log.makes,
        misses: log.misses,
      });
      if (completed.reps <= 0) return log;
      return {
        ...log,
        reps: String(completed.reps),
        tries: "",
        makes: String(completed.makes),
        misses: String(completed.misses),
      };
    },
    [tracksRepsAndMakes],
  );

  const completeWorkout = useCallback(
    (sourceProgress: WorkoutProgress = progressRef.current) => {
      if (!isWorkoutFullyTracked(sourceProgress)) {
        pauseWorkout(sourceProgress);
        return;
      }

      const runStartedAtIso = sourceProgress.startedAtIso ?? sourceProgress.endedAtIso ?? new Date().toISOString();
      const completionKey = `${sourceProgress.date}-${sourceProgress.workoutId}-${runStartedAtIso}`;
      if (completionRunLockRef.current === completionKey) return;
      completionRunLockRef.current = completionKey;
      if (completedSessionKeysRef.current.has(completionKey)) return;
      completedSessionKeysRef.current.add(completionKey);

      const result = finishWorkoutSession({
        progress: sourceProgress,
        workoutPlan: workoutForExecution,
        progressStorageKey,
        allowPartial: false,
        isCatalogWorkoutRun,
      });
      if (!result.ok) {
        setSetValidationError(result.error ?? "Workout konnte nicht abgeschlossen werden.");
        return;
      }

      void showLevelDeltaAlerts(result.levelDelta);

      const completedProgress: WorkoutProgress = {
        ...sourceProgress,
        status: "completed",
        endedAtIso: new Date().toISOString(),
        startedAtIso: undefined,
      };
      progressRef.current = completedProgress;
      setProgress(completedProgress);

      const regenBanner = appendRegenerationTagsAfterWorkoutComplete(completedProgress.sport);
      setCompletionBanner(regenBanner ?? result.bannerMessage ?? "Stark! Workout abgeschlossen ✅");

      if (isCatalogWorkoutRun) {
        navigateAfterCompletion(getDefaultWorkoutProgress(dateKey, workoutForExecution));
        return;
      }
      router.push(getPostWorkoutCompletionHref(false));
    },
    [
      dateKey,
      isCatalogWorkoutRun,
      isWorkoutFullyTracked,
      navigateAfterCompletion,
      pauseWorkout,
      progressRef,
      progressStorageKey,
      router,
      setCompletionBanner,
      setProgress,
      setSetValidationError,
      showLevelDeltaAlerts,
      workoutForExecution,
    ],
  );

  const endWorkoutEarly = useCallback(async () => {
    const latestProgress = progressRef.current;
    const hasSets = Object.values(latestProgress.logs).some((log) => setLogHasStarted(log));
    const confirmed = await appDialog.confirm({
      message: hasSets
        ? `„${latestProgress.title}“ beenden? Erfasster Fortschritt wird in Stats gespeichert.`
        : `„${latestProgress.title}“ beenden? Es wurden noch keine Sätze erfasst.`,
      confirmLabel: "Beenden",
      tone: "danger",
    });
    if (!confirmed) return;

    const result = finishWorkoutSession({
      progress: latestProgress,
      workoutPlan: workoutForExecution,
      progressStorageKey,
      allowPartial: true,
      allowEmptyFinish: true,
      isCatalogWorkoutRun,
    });
    if (!result.ok) {
      void appDialog.alert({ message: result.error ?? "Workout konnte nicht beendet werden." });
      return;
    }

    await showLevelDeltaAlerts(result.levelDelta);
    setCompletionBanner(result.bannerMessage ?? "Workout beendet.");

    if (isCatalogWorkoutRun) {
      navigateAfterCompletion(getDefaultWorkoutProgress(dateKey, workoutForExecution));
      return;
    }
    if (hasSets) {
      router.push(getPostWorkoutCompletionHref(false));
    }
  }, [
    appDialog,
    dateKey,
    isCatalogWorkoutRun,
    navigateAfterCompletion,
    progressRef,
    progressStorageKey,
    router,
    setCompletionBanner,
    showLevelDeltaAlerts,
    workoutForExecution,
  ]);

  const finishSet = useCallback(() => {
    if (!currentExercise) return;

    const activeProgress = activateProgressForInput(progressRef.current);
    const activeLog = clampShootingLog(getCurrentLogFromProgress(activeProgress));
    const validationMessage = validateSetLogForMetrics(activeLog, currentMetricOptions);
    if (validationMessage) {
      setSetValidationError(validationMessage);
      return;
    }

    const nowIso = new Date().toISOString();
    const updatedLog = { ...activeLog, completedAtIso: nowIso };
    const updatedLogs = { ...activeProgress.logs, [currentLogKey]: updatedLog };
    const isLastSetInExercise = safeSetIndex === currentExercise.sets.length - 1;
    const isLastExercise = safeExerciseIndex === workoutForExecution.exercises.length - 1;

    if (isLastExercise && isLastSetInExercise) {
      const next: WorkoutProgress = {
        ...activeProgress,
        logs: updatedLogs,
        status: "completed",
        endedAtIso: nowIso,
        elapsedSeconds: getAccumulatedElapsedSeconds(activeProgress, nowIso),
        startedAtIso: undefined,
      };
      persistProgress(next);
      completeWorkout(next);
      return;
    }

    if (isLastSetInExercise) {
      persistProgress({
        ...activeProgress,
        logs: updatedLogs,
        exerciseIndex: safeExerciseIndex + 1,
        setIndex: 0,
        status: "in_progress",
      });
      return;
    }

    persistProgress({
      ...activeProgress,
      logs: updatedLogs,
      setIndex: safeSetIndex + 1,
      status: "in_progress",
    });
  }, [
    activateProgressForInput,
    clampShootingLog,
    completeWorkout,
    currentExercise,
    currentLogKey,
    currentMetricOptions,
    getAccumulatedElapsedSeconds,
    getCurrentLogFromProgress,
    persistProgress,
    progressRef,
    safeExerciseIndex,
    safeSetIndex,
    setSetValidationError,
    workoutForExecution.exercises.length,
  ]);

  const startWorkout = useCallback(() => {
    onCompleteStart?.();
    resetCompletionRun();
    persistProgress({
      ...progressRef.current,
      status: "in_progress",
      startedAtIso: new Date().toISOString(),
      endedAtIso: undefined,
    });
  }, [onCompleteStart, persistProgress, progressRef, resetCompletionRun]);

  return {
    completeWorkout,
    endWorkoutEarly,
    finishSet,
    startWorkout,
    resetCompletionRun,
  };
}
