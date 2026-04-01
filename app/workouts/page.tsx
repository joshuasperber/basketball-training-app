"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loadExercises, loadWorkouts } from "@/lib/training-storage";
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
  getTodayWorkoutPlan,
  getWorkoutPlanForDay,
  parseWorkoutProgress,
  type WorkoutPlan,
} from "@/lib/workout";
import { appendWorkoutXpEntry } from "@/lib/level-system";

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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

function WorkoutsPageContent() {
  const searchParams = useSearchParams();
  const dayParam = searchParams.get("day");
  const workoutIdParam = searchParams.get("workoutId");
  const selectedDay = dayParam !== null ? Number(dayParam) : null;
  const todayDayIndex = useMemo(() => new Date().getDay(), []);
  const effectiveDay = selectedDay !== null && Number.isInteger(selectedDay) ? selectedDay : todayDayIndex;
  const dateKey = useMemo(
    () => toLocalDateKey(getDateForWeekday(effectiveDay)),
    [effectiveDay],
  );
  const overrideStorageKey = `${WORKOUT_OVERRIDE_PREFIX}${dateKey}`;
  const [overrideWorkoutId, setOverrideWorkoutId] = useState<string | null>(null);
  const workoutOptions = useMemo(() => Object.values(WEEKLY_WORKOUT_PLAN), []);
  const trainingWorkouts = useMemo(() => loadWorkouts(), []);
  const trainingExercises = useMemo(() => loadExercises(), []);

  const customWorkoutFromCatalog = useMemo<WorkoutPlan | null>(() => {
    if (!workoutIdParam) return null;
    const workout = trainingWorkouts.find((entry) => entry.id === workoutIdParam);
    if (!workout) return null;

    const exercises = workout.exerciseIds
      .map((exerciseId) => trainingExercises.find((exercise) => exercise.id === exerciseId))
      .filter((exercise): exercise is NonNullable<typeof exercise> => Boolean(exercise && exercise.category === workout.category))
      .map((exercise) => {
        const targetReps = exercise.targetByMetric?.reps ?? exercise.targetByMetric?.makes ?? exercise.targetValue ?? 12;
        const targetKg = exercise.trackingType === "weight" ? exercise.targetByMetric?.weight ?? exercise.targetValue ?? 20 : 0;
        return {
          name: exercise.name,
          sets: [{ targetKg, targetReps }],
        };
      });

    if (!exercises.length) return null;

    return {
      id: workout.id,
      title: workout.name,
      sport: workout.category === "Gym" ? "Gym" : workout.category === "Home" ? "Home" : "Basketball",
      subcategory: workout.subcategory,
      exercises,
    };
  }, [trainingExercises, trainingWorkouts, workoutIdParam]);

  const defaultWorkout = useMemo(
    () => (selectedDay !== null && Number.isInteger(selectedDay) ? getWorkoutPlanForDay(selectedDay) : getTodayWorkoutPlan()),
    [selectedDay],
  );
  const selectedOverrideWorkout = useMemo(() => {
    if (!overrideWorkoutId) return null;
    return workoutOptions.find((workout) => workout.id === overrideWorkoutId) ?? null;
  }, [overrideWorkoutId, workoutOptions]);
  const activeWorkoutBase = selectedOverrideWorkout ?? customWorkoutFromCatalog ?? defaultWorkout;
  const activeWorkout = activeWorkoutBase;
  const workoutForExecution = useMemo<WorkoutPlan>(() => {
    if (activeWorkout.sport === "Gym") return activeWorkout;
    return {
      ...activeWorkout,
      exercises: activeWorkout.exercises.map((exercise) => ({
        ...exercise,
        sets: [exercise.sets[0] ?? { targetKg: 0, targetReps: 0 }],
      })),
    };
  }, [activeWorkout]);
  const fallbackProgress = useMemo(
    () => getDefaultWorkoutProgress(dateKey, workoutForExecution),
    [dateKey, workoutForExecution],
  );

  const [progress, setProgress] = useState<WorkoutProgress>(fallbackProgress);

  useEffect(() => {
    const rawOverride = window.localStorage.getItem(overrideStorageKey);
    const timer = window.setTimeout(() => {
      if (rawOverride) {
        setOverrideWorkoutId(rawOverride);
      } else {
        setOverrideWorkoutId(null);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [overrideStorageKey]);

  useEffect(() => {
    const parsed = parseWorkoutProgress(
      window.localStorage.getItem(buildWorkoutStorageKey(dateKey)),
      fallbackProgress,
    );
    const isValidForActiveWorkout =
      parsed.workoutId === fallbackProgress.workoutId &&
      parsed.date === fallbackProgress.date;

    const timer = window.setTimeout(() => {
      setProgress(isValidForActiveWorkout ? parsed : fallbackProgress);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dateKey, fallbackProgress]);

  const persistProgress = (next: WorkoutProgress) => {
    setProgress(next);
    window.localStorage.setItem(buildWorkoutStorageKey(dateKey), JSON.stringify(next));
  };

  const isGymWorkout = workoutForExecution.sport === "Gym";
  const safeExerciseIndex = Math.min(
    Math.max(progress.exerciseIndex, 0),
    Math.max(0, workoutForExecution.exercises.length - 1),
  );
  const currentExercise = workoutForExecution.exercises[safeExerciseIndex] ?? workoutForExecution.exercises[0];
  const safeSetIndex = Math.min(
    Math.max(progress.setIndex, 0),
    Math.max(0, (currentExercise?.sets.length ?? 1) - 1),
  );
  const currentSet = currentExercise?.sets[safeSetIndex] ?? { targetKg: 0, targetReps: 0 };
  const currentLogKey = buildSetLogKey(safeExerciseIndex, safeSetIndex);
  const currentLog = progress.logs[currentLogKey] ?? { weight: "", reps: "" };

  const hasSetStarted = (exerciseIndex: number, setIndex: number) => {
    const key = buildSetLogKey(exerciseIndex, setIndex);
    const log = progress.logs[key];
    if (!log) return false;
    const reps = Number(log.reps) || 0;
    const weight = Number(log.weight) || 0;
    return reps > 0 || weight > 0;
  };

  const getExerciseStatus = (exerciseIndex: number): "not_started" | "in_progress" | "completed" => {
    const exercise = workoutForExecution.exercises[exerciseIndex];
    const startedSets = exercise.sets.filter((_, setIndex) => hasSetStarted(exerciseIndex, setIndex)).length;
    if (startedSets <= 0) return "not_started";
    if (startedSets >= exercise.sets.length) return "completed";
    return "in_progress";
  };

  const jumpToExercise = (exerciseIndex: number) => {
    const exercise = workoutForExecution.exercises[exerciseIndex];
    const nextSetIndex = exercise.sets.findIndex((_, setIndex) => !hasSetStarted(exerciseIndex, setIndex));
    persistProgress({
      ...progress,
      exerciseIndex,
      setIndex: nextSetIndex >= 0 ? nextSetIndex : Math.max(0, exercise.sets.length - 1),
      status: progress.status === "not_started" ? "in_progress" : progress.status,
    });
  };

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
      workoutId: completedProgress.workoutId,
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
    workoutForExecution.exercises.forEach((exercise, exerciseIndex) => {
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

    const xpResult = appendWorkoutXpEntry({
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

    if (xpResult.levelDelta > 0) {
      window.alert(`🎉 Level-Up! +${xpResult.levelDelta} Level`);
    } else if (xpResult.levelDelta < 0) {
      window.alert(`⬇️ Level-Down: ${Math.abs(xpResult.levelDelta)} Level verloren`);
    }
  };

  const finishSet = () => {
    const isLastSetInExercise = safeSetIndex === currentExercise.sets.length - 1;
    const isLastExercise = safeExerciseIndex === workoutForExecution.exercises.length - 1;

    if (isLastExercise && (!isGymWorkout || isLastSetInExercise)) {
      completeWorkout();
      return;
    }

    if (!isGymWorkout || isLastSetInExercise) {
      persistProgress({
        ...progress,
        exerciseIndex: safeExerciseIndex + 1,
        setIndex: 0,
        status: "in_progress",
      });
      return;
    }

    persistProgress({
      ...progress,
      setIndex: safeSetIndex + 1,
        status: "in_progress",
      });
  };

  return (
    <main className="min-h-screen bg-black p-6 pb-24 text-white">
      <h1 className="text-2xl font-bold">Workouts</h1>
      <p className="mt-2 text-zinc-400">Hier planst und startest du dein Training</p>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-xl font-semibold">{workoutForExecution.title}</h2>
        <p className="mt-1 text-sm text-zinc-400">Sport: {workoutForExecution.sport}</p>
        <p className="mt-1 text-sm text-zinc-400">Unterkategorie: {workoutForExecution.subcategory}</p>

        <div className="mt-3 rounded-xl border border-zinc-700 bg-zinc-950 p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Übungen im Workout</p>
          <ul className="mt-2 space-y-1 text-sm text-zinc-200">
            {workoutForExecution.exercises.map((exercise, index) => (
              <li key={`${workoutForExecution.id}-overview-${exercise.name}`}>
                {index + 1}. {exercise.name}
              </li>
            ))}
          </ul>
        </div>
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
            <p className="mt-1 text-xs text-zinc-500">
              Bei Änderung wird das heutige Protokoll zurückgesetzt und neue Zukunfts-Vorschläge angepasst.
            </p>
          </label>
        ) : null}
      </section>

      {progress.status === "completed" ? (
        <section className="mt-4 rounded-2xl border border-emerald-700 bg-emerald-950/40 p-4 text-emerald-200">
          Workout abgeschlossen. Sehr stark! ✅
        </section>
      ) : null}

      <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-3">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Workout-Fortschritt</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {workoutForExecution.exercises.map((exercise, index) => {
              const status = getExerciseStatus(index);
              const isActive = index === safeExerciseIndex;
              const badgeClass =
                status === "completed"
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-200"
                  : status === "in_progress"
                    ? "border-amber-500 bg-amber-500/20 text-amber-200"
                    : "border-zinc-700 bg-zinc-950 text-zinc-300";

              return (
                <button
                  type="button"
                  key={`${workoutForExecution.id}-progress-${exercise.name}`}
                  onClick={() => jumpToExercise(index)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs ${badgeClass} ${
                    isActive ? "ring-2 ring-indigo-500" : ""
                  }`}
                >
                  <p className="font-semibold">{exercise.name}</p>
                  <p>
                    {status === "completed"
                      ? "Abgeschlossen"
                      : status === "in_progress"
                        ? "In Arbeit"
                        : "Nicht gestartet"}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {currentExercise ? (
          <article className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400">
              Exercise {safeExerciseIndex + 1}/{workoutForExecution.exercises.length}
            </p>
            <h3 className="mt-1 text-xl font-semibold">{currentExercise.name}</h3>
            <p className="text-sm text-zinc-400">
              Satz {safeSetIndex + 1}/{currentExercise.sets.length}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {isGymWorkout ? (
                <label className="text-sm text-zinc-300">
                  Gewicht (kg)
                  <input
                    value={currentLog.weight}
                    onChange={(event) => updateCurrentLog("weight", event.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white"
                    inputMode="decimal"
                  />
                </label>
              ) : null}

              <label className="text-sm text-zinc-300">
                {isGymWorkout ? "Reps" : "Versuche / Ergebnis"}
                <input
                  value={currentLog.reps}
                  onChange={(event) => updateCurrentLog("reps", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white"
                  inputMode="numeric"
                />
              </label>
            </div>

            <div className="mt-3 text-sm text-zinc-400">
              <p>
                Ziel: {isGymWorkout ? `${currentSet.targetKg} kg × ${currentSet.targetReps} Reps` : `${currentSet.targetReps} Treffer/Reps`}
              </p>
              <p className="mt-1">
                Aktuell: {isGymWorkout ? `${currentLog.weight || 0} kg × ${currentLog.reps || 0}` : `${currentLog.reps || 0}`}
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={startWorkout}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Workout starten
              </button>
              <button
                type="button"
                onClick={finishSet}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Satz abschließen
              </button>
            </div>
          </article>
        ) : (
          <p className="text-sm text-zinc-500">Keine Exercise im Workout gefunden.</p>
        )}
      </section>

      <div className="mt-4">
        <Link href="/Weekly-Workout" className="text-sm text-indigo-300 hover:text-indigo-200">
          ← Zurück zum Weekly Plan
        </Link>
      </div>
    </main>
  );
}

export default function WorkoutsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-black p-6 pb-24 text-white">Workouts werden geladen...</main>}>
      <WorkoutsPageContent />
    </Suspense>
  );
}