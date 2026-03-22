"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { defaultExercises } from "@/lib/training-data";

type ExerciseSet = {
  id: string;
  value: string;
};

export default function ExerciseExecutionPage() {
  const params = useParams<{ id: string }>();
  const exerciseId = params.id;

  const exercise = useMemo(
    () => defaultExercises.find((entry) => entry.id === exerciseId),
    [exerciseId],
  );

  const [sets, setSets] = useState<ExerciseSet[]>([{ id: "set-1", value: "" }]);
  const [saved, setSaved] = useState(false);

  function updateSet(id: string, value: string) {
    setSaved(false);
    setSets((previous) => previous.map((entry) => (entry.id === id ? { ...entry, value } : entry)));
  }

  function addSet() {
    setSaved(false);
    setSets((previous) => [...previous, { id: `set-${Date.now()}`, value: "" }]);
  }

  if (!exercise) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 pb-24 pt-6 text-white">
        <div className="mx-auto max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-lg font-semibold">Exercise nicht gefunden.</p>
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
          <h1 className="text-2xl font-bold">{exercise.name}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {exercise.category} • {exercise.subcategory}
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            Ziel: {exercise.targetValue ?? "-"} {exercise.trackingType === "weight" ? "kg" : "Reps"}
          </p>
        </header>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-lg font-semibold">Sets erfassen</h2>
          <div className="mt-3 space-y-2">
            {sets.map((set, index) => (
              <label key={set.id} className="block text-sm text-zinc-300">
                Satz {index + 1}
                <input
                  type="number"
                  value={set.value}
                  onChange={(event) => updateSet(set.id, event.target.value)}
                  placeholder={exercise.trackingType === "weight" ? "kg" : "Reps"}
                  className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                />
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={addSet}
            className="mt-3 rounded-xl border border-zinc-600 px-3 py-2 text-sm font-semibold text-zinc-200"
          >
            + Satz hinzufügen
          </button>
        </section>

        <button
          type="button"
          onClick={() => setSaved(true)}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold"
        >
          Exercise speichern
        </button>

        {saved ? (
          <p className="rounded-xl border border-emerald-600 bg-emerald-900/20 px-4 py-3 text-emerald-300">
            Exercise-Session gespeichert (lokal im State).
          </p>
        ) : null}

        <Link href="/training" className="text-sm text-indigo-300 underline">
          Zurück zu Training
        </Link>
      </div>
    </main>
  );
}