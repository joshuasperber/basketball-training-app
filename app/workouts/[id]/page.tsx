"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { type Exercise, type Workout } from "@/lib/training-data";
import {
  appendExerciseHistory,
  appendWorkoutSession,
} from "@/lib/session-storage";
import { loadExercises, loadWorkouts, saveWorkouts } from "@/lib/training-storage";
import { pullProgressFromCloud, pushProgressToCloud } from "@/lib/progress-sync";

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
  const router = useRouter();
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
      const triesValue = getNumeric(existing?.metricValues ?? {}, "tries");
      const makesValue = getNumeric(existing?.metricValues ?? {}, "makes");
      const missesValue = getNumeric(existing?.metricValues ?? {}, "misses");
      const repsValue = getNumeric(existing?.metricValues ?? {}, "reps");
      const weightValue = getNumeric(existing?.metricValues ?? {}, "weight");

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
        made: makesValue,
        attempts: triesValue ?? repsValue,
        misses: missesValue,
        weightKg: weightValue,
      };
    });

    appendWorkoutSession({
      id: `ws-${Date.now()}`,
      dateISO: nowISO,
      workoutId: workout.id,
      workoutName: workout.name,
      workoutCategory: workout.category,
      workoutSubcategory: workout.subcategory,
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
      const previousLevel = workout.level;
      const updatedWorkouts = workouts.map((entry) =>
        entry.id === workout.id ? { ...entry, level: entry.level + 1 } : entry,
      );
      saveWorkouts(updatedWorkouts);
      window.alert(`🎉 Workout-Level-Up! ${workout.name} ist jetzt Level ${previousLevel + 1}.`);
    }

    setSaved(true);
    void pushProgressToCloud();
    router.push("/training?completed=workout");
  }

  useEffect(() => {
    void pullProgressFromCloud();
  }, []);

  if (!workout) {
    return (
      <main className="app-container">
        <div className="app-card">
          <p className="text-lg font-bold">Workout nicht gefunden.</p>
          <Link href="/training" className="btn btn-ghost btn-sm mt-3">
            ← Zurück zu Training
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="app-container animate-in">
      <div className="flex w-full flex-col gap-4">
        <header className="app-card--brand">
          <p className="page-eyebrow">Workout</p>
          <h1 className="page-title">{workout.name}</h1>
          <p className="mt-2 text-sm text-muted">
            {workout.category} · {workout.subcategory} · Level {workout.level}
          </p>
          {workout.notes ? <p className="mt-1 text-xs text-faint">Notizen: {workout.notes}</p> : null}
        </header>

        <section className="space-y-3">
          {workoutExercises.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/15 p-4 text-muted">
              Dieses Workout enthält aktuell keine Exercises.
            </p>
          ) : (
            workoutExercises.map((exercise) => {
              const currentLog = getLog(exercise.id);
              return (
                <article key={exercise.id} className="app-card">
                  <h2 className="section-title">{exercise.name}</h2>
                  <p className="mt-1 text-sm text-muted">
                    Ziel:{" "}
                    {exercise.metricKeys
                      .map((metric) => {
                        const value = exercise.targetByMetric?.[metric];
                        return value !== undefined ? `${metric}: ${value}` : null;
                      })
                      .filter((value): value is string => Boolean(value))
                      .join(" · ") || "-"}
                  </p>
                  {exercise.notes ? <p className="mt-1 text-xs text-faint">Notizen: {exercise.notes}</p> : null}

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {exercise.metricKeys.map((metric) => (
                      <div key={metric}>
                        <label className="input-label">{metric}</label>
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
                          className="input"
                        />
                      </div>
                    ))}
                  </div>
                  {validateMetricValues(currentLog?.metricValues ?? {}) ? (
                    <p className="mt-2 text-xs text-rose-300">
                      {validateMetricValues(currentLog?.metricValues ?? {})}
                    </p>
                  ) : null}

                  <div className="mt-3">
                    <label className="input-label">Notiz</label>
                    <textarea
                      value={currentLog?.note ?? ""}
                      onChange={(event) => updateLog(exercise.id, { note: event.target.value })}
                      rows={2}
                      className="textarea"
                    />
                  </div>
                </article>
              );
            })
          )}
        </section>

        <button type="button" onClick={handleSaveWorkout} className="btn btn-primary btn-block">
          Workout speichern
        </button>

        {saved ? (
          <p className="app-card--accent-emerald text-sm">
            Session gespeichert (lokal im State). Nächster Schritt: Persistenz über DB.
          </p>
        ) : null}

        <Link href="/training" className="btn btn-ghost btn-sm self-start">
          ← Zurück zu Training
        </Link>
      </div>
    </main>
  );
}