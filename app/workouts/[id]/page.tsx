"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { defaultExercises, defaultWorkouts } from "@/lib/training-data";

type WorkoutLog = {
  exerciseId: string;
  completedValue: string;
  note: string;
};

export default function WorkoutExecutionPage() {
  const params = useParams<{ id: string }>();
  const workoutId = params.id;

  const workout = useMemo(
    () => defaultWorkouts.find((entry) => entry.id === workoutId),
    [workoutId],
  );

  const workoutExercises = useMemo(() => {
    if (!workout) return [];

    return workout.exerciseIds
      .map((exerciseId) => defaultExercises.find((exercise) => exercise.id === exerciseId))
      .filter((exercise) => exercise !== undefined);
  }, [workout]);

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
            completedValue: patch.completedValue ?? "",
            note: patch.note ?? "",
          },
        ];
      }

      return previous.map((entry) =>
        entry.exerciseId === exerciseId ? { ...entry, ...patch } : entry,
      );
    });
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
                    Ziel: {exercise.targetValue ?? "-"} {exercise.trackingType === "weight" ? "kg" : "Reps"}
                  </p>

                  <label className="mt-3 block text-sm text-zinc-300">
                    Geschafft
                    <input
                      type="number"
                      value={currentLog?.completedValue ?? ""}
                      onChange={(event) =>
                        updateLog(exercise.id, { completedValue: event.target.value })
                      }
                      placeholder={exercise.trackingType === "weight" ? "kg" : "Reps"}
                      className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                    />
                  </label>

                  <label className="mt-3 block text-sm text-zinc-300">
                    Notiz
                    <textarea
                      value={currentLog?.note ?? ""}
                      onChange={(event) => updateLog(exercise.id, { note: event.target.value })}
                      rows={2}
                      className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                    />
                  </label>
                </article>
              );
            })
          )}
        </section>

        <button
          type="button"
          onClick={() => setSaved(true)}
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