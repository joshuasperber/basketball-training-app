"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultExercises } from "@/lib/training-data";
import { SessionDatabase } from "@/lib/session-types";

export default function StatsPage() {
  const [db, setDb] = useState<SessionDatabase>({ workoutSessions: [], exerciseHistory: {} });

  useEffect(() => {
    async function loadDb() {
      const response = await fetch("/api/sessions", { cache: "no-store" });
      const data = (await response.json()) as SessionDatabase;
      setDb(data);
    }

    void loadDb();
  }, []);

  const totalWorkoutSessions = db.workoutSessions.length;
  const totalExerciseEntries = Object.values(db.exerciseHistory).reduce(
    (sum, entries) => sum + entries.length,
    0,
  );

  const bestExercise = useMemo(() => {
    let best: { exerciseId: string; value: number } | null = null;

    for (const [exerciseId, entries] of Object.entries(db.exerciseHistory)) {
      for (const entry of entries) {
        if (!best || entry.value > best.value) {
          best = { exerciseId, value: entry.value };
        }
      }
    }

    if (!best) return null;
    const exercise = defaultExercises.find((item) => item.id === best.exerciseId);
    return {
      name: exercise?.name ?? best.exerciseId,
      value: best.value,
    };
  }, [db.exerciseHistory]);

  return (
    <main className="min-h-screen bg-black p-6 pb-24 text-white">
      <h1 className="text-2xl font-bold">Statistiken</h1>
      <p className="mt-2 text-zinc-400">Dein Fortschritt aus der gespeicherten Datenbank</p>

      <section className="mt-6 grid gap-3">
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
          <p className="text-sm text-zinc-400">Workout Sessions</p>
          <p className="text-2xl font-semibold">{totalWorkoutSessions}</p>
        </div>

        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
          <p className="text-sm text-zinc-400">Exercise Einträge</p>
          <p className="text-2xl font-semibold">{totalExerciseEntries}</p>
        </div>

        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
          <p className="text-sm text-zinc-400">Bestes Ergebnis</p>
          {bestExercise ? (
            <p className="text-lg font-semibold">
              {bestExercise.name}: {bestExercise.value}
            </p>
          ) : (
            <p className="text-zinc-500">Noch keine Daten vorhanden.</p>
          )}
        </div>
      </section>
    </main>
  );
}