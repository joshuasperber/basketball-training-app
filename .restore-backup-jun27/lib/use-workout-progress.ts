"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { syncPausedWorkoutRegistry } from "@/lib/paused-workouts";
import {
  WorkoutProgress,
  buildWorkoutStorageKey,
  getDefaultWorkoutProgress,
  parseWorkoutProgress,
  type WorkoutPlan,
} from "@/lib/workout";

type UseWorkoutProgressOptions = {
  dateKey: string;
  workout: WorkoutPlan;
  isCatalogWorkoutRun: boolean;
};

export function useWorkoutProgress({ dateKey, workout, isCatalogWorkoutRun }: UseWorkoutProgressOptions) {
  const fallbackProgress = useMemo(
    () => getDefaultWorkoutProgress(dateKey, workout),
    [dateKey, workout],
  );
  const progressStorageKey = useMemo(
    () => `${buildWorkoutStorageKey(dateKey)}-${workout.id}`,
    [dateKey, workout.id],
  );

  const [progress, setProgress] = useState<WorkoutProgress>(fallbackProgress);
  const progressRef = useRef(progress);
  const dateKeyRef = useRef(dateKey);
  const progressStorageKeyRef = useRef(progressStorageKey);

  useEffect(() => {
    progressRef.current = progress;
    dateKeyRef.current = dateKey;
    progressStorageKeyRef.current = progressStorageKey;
  }, [dateKey, progress, progressStorageKey]);

  const persistProgress = useCallback(
    (next: WorkoutProgress) => {
      progressRef.current = next;
      dateKeyRef.current = dateKey;
      progressStorageKeyRef.current = progressStorageKey;
      setProgress(next);
      window.localStorage.setItem(progressStorageKey, JSON.stringify(next));
      window.localStorage.setItem(buildWorkoutStorageKey(dateKey), JSON.stringify(next));
      syncPausedWorkoutRegistry({ progress: next, progressStorageKey });
      window.dispatchEvent(new Event("bt:workout-progress-updated"));
    },
    [dateKey, progressStorageKey],
  );

  useEffect(() => {
    const rawForWorkout = window.localStorage.getItem(progressStorageKey);
    const legacyRaw = window.localStorage.getItem(buildWorkoutStorageKey(dateKey));
    const parsed = parseWorkoutProgress(rawForWorkout ?? legacyRaw, fallbackProgress);
    const isValidForActiveWorkout =
      parsed.workoutId === fallbackProgress.workoutId &&
      parsed.date === fallbackProgress.date &&
      (rawForWorkout != null || parsed.status !== "completed") &&
      (!isCatalogWorkoutRun || parsed.status !== "completed");

    const timer = window.setTimeout(() => {
      const nextProgress = isValidForActiveWorkout ? parsed : fallbackProgress;
      progressRef.current = nextProgress;
      setProgress(nextProgress);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dateKey, fallbackProgress, isCatalogWorkoutRun, progressStorageKey, workout.id]);

  const getAccumulatedElapsedSeconds = useCallback(
    (workoutProgress: WorkoutProgress, endIso = new Date().toISOString()) => {
      const saved = Math.max(0, workoutProgress.elapsedSeconds ?? 0);
      if (!workoutProgress.startedAtIso || workoutProgress.status !== "in_progress") return saved;
      const startMs = new Date(workoutProgress.startedAtIso).getTime();
      const endMs = new Date(endIso).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return saved;
      return saved + Math.max(0, Math.round((endMs - startMs) / 1000));
    },
    [],
  );

  const activateProgressForInput = useCallback(
    (workoutProgress: WorkoutProgress = progressRef.current): WorkoutProgress => {
      if (workoutProgress.status === "in_progress" && workoutProgress.startedAtIso) return workoutProgress;
      return {
        ...workoutProgress,
        status: "in_progress",
        startedAtIso: new Date().toISOString(),
        endedAtIso: undefined,
      };
    },
    [],
  );

  const pauseWorkout = useCallback(
    (sourceProgress: WorkoutProgress = progressRef.current) => {
      const endedAtIso = new Date().toISOString();
      const pausedProgress: WorkoutProgress = {
        ...sourceProgress,
        status: "not_started",
        elapsedSeconds: Math.max(1, getAccumulatedElapsedSeconds(sourceProgress, endedAtIso)),
        startedAtIso: undefined,
        endedAtIso: undefined,
      };
      persistProgress(pausedProgress);
      return pausedProgress;
    },
    [getAccumulatedElapsedSeconds, persistProgress],
  );

  useEffect(() => {
    const pauseActiveWorkout = () => {
      const current = progressRef.current;
      if (current.status !== "in_progress" || !current.startedAtIso) return;

      const endIso = new Date().toISOString();
      const startedAt = Date.parse(current.startedAtIso);
      const endedAt = Date.parse(endIso);
      const elapsedSeconds =
        Math.max(0, current.elapsedSeconds ?? 0) +
        (Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt > startedAt
          ? Math.max(0, Math.round((endedAt - startedAt) / 1000))
          : 0);
      const paused: WorkoutProgress = {
        ...current,
        status: "not_started",
        elapsedSeconds,
        startedAtIso: undefined,
        endedAtIso: undefined,
      };

      progressRef.current = paused;
      window.localStorage.setItem(progressStorageKeyRef.current, JSON.stringify(paused));
      window.localStorage.setItem(buildWorkoutStorageKey(dateKeyRef.current), JSON.stringify(paused));
      syncPausedWorkoutRegistry({
        progress: paused,
        progressStorageKey: progressStorageKeyRef.current,
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") pauseActiveWorkout();
    };
    const handleNavigationClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      try {
        const url = new URL(link.href);
        if (url.origin === window.location.origin && !url.pathname.startsWith("/workouts")) {
          pauseActiveWorkout();
        }
      } catch {
        // Ignore malformed hrefs.
      }
    };

    window.addEventListener("pagehide", pauseActiveWorkout);
    window.addEventListener("beforeunload", pauseActiveWorkout);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("click", handleNavigationClick, true);
    return () => {
      window.removeEventListener("pagehide", pauseActiveWorkout);
      window.removeEventListener("beforeunload", pauseActiveWorkout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("click", handleNavigationClick, true);
    };
  }, []);

  return {
    progress,
    setProgress,
    progressRef,
    progressStorageKey,
    progressStorageKeyRef,
    dateKeyRef,
    fallbackProgress,
    persistProgress,
    getAccumulatedElapsedSeconds,
    activateProgressForInput,
    pauseWorkout,
  };
}
