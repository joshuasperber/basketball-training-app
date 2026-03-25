"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { type Exercise, type Workout } from "@/lib/training-data";
import {
  appendExerciseHistory,
  appendWorkoutSession,
  getExerciseHistoryMap,
} from "@/lib/session-storage";
import { loadExercises, loadWorkouts, saveWorkouts } from "@/lib/training-storage";

type WorkoutLog = {
  exerciseId: string;
  metricValues: Partial<Record<string, string>>;
  note: string;
};

function getNumeric(values: Partial<Record<string, string>>, key: string) {
  const raw = values[key];
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function validateMetricValues(values: Partial<Record<string, string>>) {
  const tries = getNumeric(values, "tries");
  const reps = getNumeric(values, "reps");
  const makes = getNumeric(values, "makes");
  const misses = getNumeric(values, "misses");
  const base = tries ?? reps;

  if (base !== null) {
    if (makes !== null && makes > base) return "Makes darf nicht größer als Trys/Reps sein.";
    if (misses !== null && misses > base) return "Misses darf nicht größer als Trys/Reps sein.";
    if (makes !== null && misses !== null && makes + misses > base) {
      return "Makes + Misses darf nicht größer als Trys/Reps sein.";
    }
  }

  return null;
}

export default function WorkoutExecutionPage() {
  const params = useParams<{ id: string }>();
  const workoutId = params.id;
  const [exercises] = useState<Exercise[]>(() => loadExercises());
  const [workouts] = useState<Workout[]>(() => loadWorkouts());

  const workout = useMemo(
    () => workouts.find((entry) => entry.id === workoutId),
    [workoutId, workouts],
  );

  const workoutExercises = useMemo(() => {
    if (!workout) return [];

    return workout.exerciseIds
      .map((exerciseId) => exercises.find((exercise) => exercise.id === exerciseId))
      .filter((exercise) => exercise !== undefined);
  }, [exercises, workout]);

  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [saved, setSaved] = useState(false);
  const [historyMap, setHistoryMap] = useState<Record<string, { dateISO: string; value: number }[]>>(() => {
    const history = getExerciseHistoryMap();
    const compactHistory: Record<string, { dateISO: string; value: number }[]> = {};

    for (const [exerciseId, entries] of Object.entries(history)) {
      compactHistory[exerciseId] = entries
        .filter((entry) => Number.isFinite(entry.value))
        .map((entry) => ({ dateISO: entry.dateISO, value: entry.value }))
        .slice(0, 5);
    }

    return compactHistory;
  });

  function getLog(exerciseId: string) {
    return logs.find((entry) => entry.exerciseId === exerciseId);
  }

  function updateLog(exerciseId: string, patch: Partial<WorkoutLog>) {
    setSaved(false);
    setLogs((previous) => {
      const existing = previous.find((entry) => entry.exerciseId === exerciseId);
      if (!existing) {
        return [
          ...previous,
          {
            exerciseId,
            metricValues: patch.metricValues ?? {},
            note: patch.note ?? "",
          },
        ];
      }

      return previous.map((entry) =>
        entry.exerciseId === exerciseId ? { ...entry, ...patch } : entry,
      );
    });
  }

  function handleSaveWorkout() {
    if (!workout) return;

    const hasValidationError = workoutExercises.some((exercise) => {
      const current = getLog(exercise.id);
      return Boolean(validateMetricValues(current?.metricValues ?? {}));
    });
    if (hasValidationError) {
      return;
    }

    const nowISO = new Date().toISOString();
    const normalizedLogs = workoutExercises.map((exercise) => {
      const existing = getLog(exercise.id);
      const primaryMetric = exercise.metricKeys[0];
      const rawPrimaryValue = existing?.metricValues?.[primaryMetric];
      const valueNumber = rawPrimaryValue ? Number(rawPrimaryValue) : null;

      if (valueNumber !== null && Number.isFinite(valueNumber)) {
        appendExerciseHistory({
          id: `eh-${Date.now()}-${exercise.id}`,
          dateISO: nowISO,
          exerciseId: exercise.id,
          value: valueNumber,
          note: existing?.note,
          source: "workout",
          workoutId: workout.id,
        });
      }

      return {
        exerciseId: exercise.id,
        completedValue: valueNumber !== null && Number.isFinite(valueNumber) ? valueNumber : null,
        note: existing?.note ?? "",
      };
    });

    appendWorkoutSession({
      id: `ws-${Date.now()}`,
      dateISO: nowISO,
      workoutId: workout.id,
      workoutName: workout.name,
      logs: normalizedLogs,
    });

    const reachedTargets = workoutExercises.reduce((count, exercise) => {
      const existing = getLog(exercise.id);
      const primaryMetric = exercise.metricKeys[0];
      const target = exercise.targetByMetric?.[primaryMetric];
      if (target === undefined) {
        return count + 1;
      }
      const rawPrimaryValue = existing?.metricValues?.[primaryMetric];
      const value = rawPrimaryValue ? Number(rawPrimaryValue) : null;
      return value !== null && Number.isFinite(value) && value >= target ? count + 1 : count;
    }, 0);

    const reachedRatio = workoutExercises.length > 0 ? reachedTargets / workoutExercises.length : 0;
    if (reachedRatio >= 0.8) {
      const updatedWorkouts = workouts.map((entry) =>
        entry.id === workout.id ? { ...entry, level: entry.level + 1 } : entry,
      );
      saveWorkouts(updatedWorkouts);
    }

    const updatedHistory = getExerciseHistoryMap();
    const compactHistory: Record<string, { dateISO: string; value: number }[]> = {};
    for (const [exerciseId, entries] of Object.entries(updatedHistory)) {
      compactHistory[exerciseId] = entries
        .filter((entry) => Number.isFinite(entry.value))
        .map((entry) => ({ dateISO: entry.dateISO, value: entry.value }))
        .slice(0, 5);
    }

    setHistoryMap(compactHistory);
    setSaved(true);
  }

  if (!workout) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 pb-24 pt-6 text-white">
        <div className="mx-auto max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-lg font-semibold">Workout nicht gefunden.</p>
          <Link href="/training" className="mt-3 inline-block text-indigo-300 underline">
            Zurück zu Training
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-24 pt-6 text-white">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <header className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
          <h1 className="text-2xl font-bold">{workout.name}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {workout.category} • {workout.subcategory} • Level {workout.level}
          </p>
          {workout.notes ? <p className="mt-1 text-xs text-zinc-500">Notizen: {workout.notes}</p> : null}
        </header>

        <section className="space-y-3">
          {workoutExercises.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-700 p-4 text-zinc-400">
              Dieses Workout enthält aktuell keine Exercises.
            </p>
          ) : (
            workoutExercises.map((exercise) => {
              const currentLog = getLog(exercise.id);
              return (
                <article key={exercise.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <h2 className="text-lg font-semibold">{exercise.name}</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    Ziel:{" "}
                    {exercise.metricKeys
                      .map((metric) => {
                        const value = exercise.targetByMetric?.[metric];
                        return value !== undefined ? `${metric}: ${value}` : null;
                      })
                      .filter((value): value is string => Boolean(value))
                      .join(" • ") || "-"}
                  </p>
                  {exercise.notes ? <p className="mt-1 text-xs text-zinc-500">Notizen: {exercise.notes}</p> : null}

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {exercise.metricKeys.map((metric) => (
                      <label key={metric} className="block text-sm text-zinc-300">
                        {metric}
                        <input
                          type="number"
                          value={currentLog?.metricValues?.[metric] ?? ""}
                          onChange={(event) =>
                            updateLog(exercise.id, {
                              metricValues: {
                                ...(currentLog?.metricValues ?? {}),
                                [metric]: event.target.value,
                              },
                            })
                          }
                          placeholder={metric}
                          className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                        />
                      </label>
                    ))}
                  </div>
                  {validateMetricValues(currentLog?.metricValues ?? {}) ? (
                    <p className="mt-2 text-xs text-rose-300">
                      {validateMetricValues(currentLog?.metricValues ?? {})}
                    </p>
                  ) : null}

                  <label className="mt-3 block text-sm text-zinc-300">
                    Notiz
                    <textarea
                      value={currentLog?.note ?? ""}
                      onChange={(event) => updateLog(exercise.id, { note: event.target.value })}
                      rows={2}
                      className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                    />
                  </label>

                  <div className="mt-3 rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Letzte 5 Einträge</p>
                    {(historyMap[exercise.id] ?? []).length === 0 ? (
                      <p className="mt-1 text-xs text-zinc-500">Noch keine History vorhanden.</p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-xs text-zinc-300">
                        {(historyMap[exercise.id] ?? []).map((entry, index) => (
                          <li key={`${entry.dateISO}-${index}`}>
                            {new Date(entry.dateISO).toLocaleDateString("de-DE")} • {entry.value}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>

        <button
          type="button"
          onClick={handleSaveWorkout}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold"
        >
          Workout speichern
        </button>

        {saved ? (
          <p className="rounded-xl border border-emerald-600 bg-emerald-900/20 px-4 py-3 text-emerald-300">
            Session gespeichert (lokal im State). Nächster Schritt: Persistenz über DB.
          </p>
        ) : null}

        <Link href="/training" className="text-sm text-indigo-300 underline">
          Zurück zu Training
        </Link>
      </div>
    </main>
  );
}