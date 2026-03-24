"use client";

import { useMemo, useState } from "react";
import {
  CompletedWorkoutHistoryEntry,
  WorkoutProgress,
  WORKOUT_HISTORY_KEY,
  buildSetLogKey,
  buildWorkoutStorageKey,
  getDefaultWorkoutProgress,
  getTodayDateKey,
  getTodayWorkoutPlan,
  parseWorkoutProgress,
} from "@/lib/workout";

function persistHistoryEntry(entry: CompletedWorkoutHistoryEntry) {
  const rawHistory = window.localStorage.getItem(WORKOUT_HISTORY_KEY);

  try {
    const parsed = rawHistory ? (JSON.parse(rawHistory) as CompletedWorkoutHistoryEntry[]) : [];
    const nextHistory = [entry, ...parsed.filter((item) => item.id !== entry.id)].slice(0, 365);
    window.localStorage.setItem(WORKOUT_HISTORY_KEY, JSON.stringify(nextHistory));
  } catch {
    window.localStorage.setItem(WORKOUT_HISTORY_KEY, JSON.stringify([entry]));
  }
}

export default function WorkoutsPage() {
  const dateKey = useMemo(() => getTodayDateKey(), []);
  const todayWorkout = useMemo(() => getTodayWorkoutPlan(), []);

  const [progress, setProgress] = useState<WorkoutProgress>(() => {
    const fallback = getDefaultWorkoutProgress(dateKey, todayWorkout);

    if (typeof window === "undefined") {
      return fallback;
    }

    return parseWorkoutProgress(
      window.localStorage.getItem(buildWorkoutStorageKey(dateKey)),
      fallback,
    );
  });

  const persistProgress = (next: WorkoutProgress) => {
    setProgress(next);
    window.localStorage.setItem(buildWorkoutStorageKey(dateKey), JSON.stringify(next));
  };

  const currentExercise = todayWorkout.exercises[progress.exerciseIndex];
  const currentSet = currentExercise.sets[progress.setIndex];
  const currentLogKey = buildSetLogKey(progress.exerciseIndex, progress.setIndex);
  const currentLog = progress.logs[currentLogKey] ?? { weight: "", reps: "" };

  const updateCurrentLog = (field: "weight" | "reps", value: string) => {
    persistProgress({
      ...progress,
      logs: {
        ...progress.logs,
        [currentLogKey]: {
          ...currentLog,
          [field]: value,
        },
      },
    });
  };

  const startWorkout = () => {
    persistProgress({ ...progress, status: "in_progress" });
  };

  const completeWorkout = () => {
    const completedProgress: WorkoutProgress = { ...progress, status: "completed" };
    persistProgress(completedProgress);

    const totals = Object.values(completedProgress.logs).reduce(
      (accumulator, setLog) => {
        const reps = Number(setLog.reps) || 0;
        const weight = Number(setLog.weight) || 0;

        if (reps > 0 || weight > 0) {
          accumulator.totalSets += 1;
        }

        accumulator.totalReps += reps;
        accumulator.totalVolumeKg += reps * weight;

        return accumulator;
      },
      { totalSets: 0, totalReps: 0, totalVolumeKg: 0 },
    );

    const historyEntry: CompletedWorkoutHistoryEntry = {
      id: `${completedProgress.date}-${completedProgress.workoutId}`,
      date: completedProgress.date,
      title: completedProgress.title,
      sport: completedProgress.sport,
      subcategory: completedProgress.subcategory,
      totalSets: totals.totalSets,
      totalReps: totals.totalReps,
      totalVolumeKg: totals.totalVolumeKg,
    };

    persistHistoryEntry(historyEntry);
  };

  const finishSet = () => {
    const isLastSetInExercise = progress.setIndex === currentExercise.sets.length - 1;
    const isLastExercise = progress.exerciseIndex === todayWorkout.exercises.length - 1;

    if (isLastSetInExercise && isLastExercise) {
      completeWorkout();
      return;
    }

    if (isLastSetInExercise) {
      persistProgress({
        ...progress,
        exerciseIndex: progress.exerciseIndex + 1,
        setIndex: 0,
        status: "in_progress",
      });
      return;
    }

    persistProgress({
      ...progress,
      setIndex: progress.setIndex + 1,
      status: "in_progress",
    });
  };

  return (
    <main className="min-h-screen bg-black p-6 pb-24 text-white">
      <h1 className="text-2xl font-bold">Workouts</h1>
      <p className="mt-2 text-zinc-400">Hier planst und startest du dein Training</p>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-xl font-semibold">{todayWorkout.title}</h2>
        <p className="mt-1 text-sm text-zinc-400">Sport: {todayWorkout.sport}</p>
        <p className="mt-1 text-sm text-zinc-400">Unterkategorie: {todayWorkout.subcategory}</p>

        {progress.status === "completed" ? (
          <p className="mt-4 rounded-xl bg-green-900/40 p-3 text-sm text-green-300">
            Workout abgeschlossen. Sehr stark! ✅
          </p>
        ) : (
          <>
            <div className="mt-4 rounded-xl bg-zinc-950 p-4">
              <p className="text-sm text-zinc-400">
                {progress.exerciseIndex + 1}/{todayWorkout.exercises.length}
              </p>
              <p className="mt-1 text-lg font-medium">{currentExercise.name}</p>

              <p className="mt-4 text-sm text-zinc-400">
                Satz {progress.setIndex + 1}/{currentExercise.sets.length}
              </p>
              <p className="mt-1 text-sm">Target kg: {currentSet.targetKg}</p>
              <label className="mt-2 block text-sm text-zinc-300">
                Gewicht:
                <input
                  value={currentLog.weight}
                  onChange={(event) => updateCurrentLog("weight", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
                  placeholder="kg eintragen"
                />
              </label>

              <p className="mt-3 text-sm">Target reps: {currentSet.targetReps}</p>
              <label className="mt-2 block text-sm text-zinc-300">
                Reps:
                <input
                  value={currentLog.reps}
                  onChange={(event) => updateCurrentLog("reps", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
                  placeholder="Wiederholungen eintragen"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              {progress.status === "not_started" ? (
                <button
                  type="button"
                  onClick={startWorkout}
                  className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"
                >
                  Workout starten
                </button>
              ) : null}

              {progress.status === "in_progress" ? (
                <button
                  type="button"
                  onClick={finishSet}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
                >
                  Satz abschließen
                </button>
              ) : null}
            </div>
          </>
        )}
      </section>
    </main>
  );
}