"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CompletedWorkoutHistoryEntry,
  WorkoutProgress,
  WORKOUT_OVERRIDE_PREFIX,
  WORKOUT_HISTORY_KEY,
  WEEKLY_WORKOUT_PLAN,
  buildSetLogKey,
  buildWorkoutStorageKey,
  getDefaultWorkoutProgress,
  getDateForWeekday,
  getTodayDateKey,
  getTodayWorkoutPlan,
  getWorkoutPlanForDay,
  parseWorkoutProgress,
} from "@/lib/workout";
import { appendWorkoutXpEntry } from "@/lib/level-system";

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
  const searchParams = useSearchParams();
  const dayParam = searchParams.get("day");
  const selectedDay = dayParam !== null ? Number(dayParam) : null;
  const todayDayIndex = useMemo(() => new Date().getDay(), []);
  const effectiveDay = selectedDay !== null && Number.isInteger(selectedDay) ? selectedDay : todayDayIndex;
  const dateKey = useMemo(() => getTodayDateKey(), []);
  const overrideStorageKey = `${WORKOUT_OVERRIDE_PREFIX}${dateKey}`;
  const [overrideWorkoutId, setOverrideWorkoutId] = useState<string | null>(null);
  const workoutOptions = useMemo(() => Object.values(WEEKLY_WORKOUT_PLAN), []);
  const defaultWorkout = useMemo(
    () => (selectedDay !== null && Number.isInteger(selectedDay) ? getWorkoutPlanForDay(selectedDay) : getTodayWorkoutPlan()),
    [selectedDay],
  );
  const selectedOverrideWorkout = useMemo(() => {
    if (!overrideWorkoutId) return null;
    return workoutOptions.find((workout) => workout.id === overrideWorkoutId) ?? null;
  }, [overrideWorkoutId, workoutOptions]);
  const activeWorkout = selectedOverrideWorkout ?? defaultWorkout;
  const fallbackProgress = useMemo(
    () => getDefaultWorkoutProgress(dateKey, activeWorkout),
    [activeWorkout, dateKey],
  );

  const [progress, setProgress] = useState<WorkoutProgress>(fallbackProgress);

  useEffect(() => {
    const rawOverride = window.localStorage.getItem(overrideStorageKey);
    if (rawOverride) {
      setOverrideWorkoutId(rawOverride);
    }
  }, [overrideStorageKey]);

  useEffect(() => {
    setProgress(
      parseWorkoutProgress(
        window.localStorage.getItem(buildWorkoutStorageKey(dateKey)),
        fallbackProgress,
      ),
    );
  }, [dateKey, fallbackProgress]);

  const persistProgress = (next: WorkoutProgress) => {
    setProgress(next);
    window.localStorage.setItem(buildWorkoutStorageKey(dateKey), JSON.stringify(next));
  };

  const currentExercise = activeWorkout.exercises[progress.exerciseIndex];
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

    let achievedSets = 0;
    let totalSets = 0;
    activeWorkout.exercises.forEach((exercise, exerciseIndex) => {
      exercise.sets.forEach((set, setIndex) => {
        totalSets += 1;
        const log = completedProgress.logs[buildSetLogKey(exerciseIndex, setIndex)];
        const reps = Number(log?.reps) || 0;
        const weight = Number(log?.weight) || 0;
        const repsMet = reps >= set.targetReps;
        const weightMet = set.targetKg <= 0 || weight >= set.targetKg;
        if (repsMet && weightMet) {
          achievedSets += 1;
        }
      });
    });

    const qualityScore = totalSets > 0 ? achievedSets / totalSets : 0;
    const exerciseXp = achievedSets * 12;
    const workoutXp = 40 + Math.round(qualityScore * 60);
    const totalXp = exerciseXp + workoutXp;

    appendWorkoutXpEntry({
      id: `${completedProgress.date}-${completedProgress.workoutId}`,
      date: completedProgress.date,
      workoutId: completedProgress.workoutId,
      workoutTitle: completedProgress.title,
      exerciseXp,
      workoutXp,
      totalXp,
      achievedSets,
      totalSets,
      qualityScore,
    });
  };

  const finishSet = () => {
    const isLastSetInExercise = progress.setIndex === currentExercise.sets.length - 1;
    const isLastExercise = progress.exerciseIndex === activeWorkout.exercises.length - 1;

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
        <h2 className="text-xl font-semibold">{activeWorkout.title}</h2>
        <p className="mt-1 text-sm text-zinc-400">Sport: {activeWorkout.sport}</p>
        <p className="mt-1 text-sm text-zinc-400">Unterkategorie: {activeWorkout.subcategory}</p>
        <p className="mt-1 text-xs text-zinc-500">
          Datum: {getDateForWeekday(effectiveDay).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
        </p>
        {effectiveDay === todayDayIndex ? (
          <label className="mt-3 block text-sm text-zinc-300">
            Heutiges Workout manuell wählen
            <select
              value={selectedOverrideWorkout?.id ?? defaultWorkout.id}
              onChange={(event) => {
                const nextWorkoutId = event.target.value;
                const nextIsDefault = nextWorkoutId === defaultWorkout.id;
                const nextOverride = nextIsDefault ? null : nextWorkoutId;
                setOverrideWorkoutId(nextOverride);
                if (nextOverride) {
                  window.localStorage.setItem(overrideStorageKey, nextOverride);
                } else {
                  window.localStorage.removeItem(overrideStorageKey);
                }
                const nextWorkout =
                  workoutOptions.find((workout) => workout.id === nextWorkoutId) ?? defaultWorkout;
                persistProgress(getDefaultWorkoutProgress(dateKey, nextWorkout));
              }}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            >
              {workoutOptions.map((workout) => (
                <option key={workout.id} value={workout.id}>
                  {workout.title} ({workout.sport} • {workout.subcategory})
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-zinc-500">
              Bei Änderung wird das heutige Protokoll zurückgesetzt und neue Zukunfts-Vorschläge angepasst.
            </span>
          </label>
        ) : null}

        {progress.status === "completed" ? (
          <p className="mt-4 rounded-xl bg-green-900/40 p-3 text-sm text-green-300">
            Workout abgeschlossen. Sehr stark! ✅
          </p>
        ) : (
          <>
            <div className="mt-4 rounded-xl bg-zinc-950 p-4">
              <p className="text-sm text-zinc-400">
                {progress.exerciseIndex + 1}/{activeWorkout.exercises.length}
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