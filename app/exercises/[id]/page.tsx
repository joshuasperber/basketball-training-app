"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type Exercise } from "@/lib/training-data";
import { loadExercises } from "@/lib/training-storage";
import { ExerciseHistoryEntry, SessionDatabase } from "@/lib/session-types";

type ExerciseSet = {
  id: string;
  values: Partial<Record<string, string>>;
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

export default function ExerciseExecutionPage() {
  const params = useParams<{ id: string }>();
  const exerciseId = params.id;
  const [exercises] = useState<Exercise[]>(() => loadExercises());

  const exercise = useMemo(
    () => exercises.find((entry) => entry.id === exerciseId),
    [exerciseId, exercises],
  );

  const [sets, setSets] = useState<ExerciseSet[]>([{ id: "set-1", values: {} }]);
  const [sessionNote, setSessionNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<{ dateISO: string; value: number }[]>([]);

  const refreshHistory = useCallback(async () => {
    if (!exercise) return;
    const response = await fetch("/api/session", { cache: "no-store" });
    const db = (await response.json()) as SessionDatabase;
    const entries = (db.exerciseHistory[exercise.id] ?? [])
      .filter((entry) => Number.isFinite(entry.value))
      .map((entry) => ({ dateISO: entry.dateISO, value: entry.value }))
      .slice(0, 5);
    setHistory(entries);
  }, [exercise]);

  function updateSetValue(id: string, metric: string, value: string) {
    setSaved(false);
    setSets((previous) =>
      previous.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              values: {
                ...entry.values,
                [metric]: value,
              },
            }
          : entry,
      ),
    );
  }

  function addSet() {
    setSaved(false);
    setSets((previous) => [...previous, { id: `set-${Date.now()}`, values: {} }]);
  }

  async function handleSaveExercise() {
    if (!exercise) return;
    if (sets.some((set) => validateMetricValues(set.values))) {
      return;
    }

    const nowISO = new Date().toISOString();
    const payload: ExerciseHistoryEntry[] = [];

    sets.forEach((set) => {
      const primaryMetric = exercise.metricKeys[0];
      const rawPrimaryValue = set.values[primaryMetric];
      const value = Number(rawPrimaryValue);
      if (!Number.isFinite(value)) return;

      payload.push({
        id: `eh-${Date.now()}-${set.id}`,
        dateISO: nowISO,
        exerciseId: exercise.id,
        value,
        note: sessionNote || undefined,
        source: "exercise",
      });
    });

    await fetch("/api/session/exercise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    await refreshHistory();
    setSaved(true);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshHistory();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refreshHistory]);

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
            Ziel:{" "}
            {exercise.metricKeys
              .map((metric) => {
                const target = exercise.targetByMetric?.[metric];
                return target !== undefined ? `${metric}: ${target}` : null;
              })
              .filter((entry): entry is string => Boolean(entry))
              .join(" • ") || "-"}
          </p>
          {exercise.notes ? <p className="mt-1 text-xs text-zinc-500">Notizen: {exercise.notes}</p> : null}
        </header>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-lg font-semibold">Sets erfassen</h2>
          <div className="mt-3 space-y-2">
            {sets.map((set, index) => (
              <div key={set.id} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                <p className="text-sm font-semibold text-zinc-200">Satz {index + 1}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {exercise.metricKeys.map((metric) => (
                    <label key={`${set.id}-${metric}`} className="block text-sm text-zinc-300">
                      {metric}
                      <input
                        type="number"
                        value={set.values[metric] ?? ""}
                        onChange={(event) => updateSetValue(set.id, metric, event.target.value)}
                        placeholder={metric}
                        className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2"
                      />
                    </label>
                  ))}
                </div>
                {validateMetricValues(set.values) ? (
                  <p className="mt-2 text-xs text-rose-300">{validateMetricValues(set.values)}</p>
                ) : null}
              </div>
            ))}
          </div>

          <textarea
            value={sessionNote}
            onChange={(event) => setSessionNote(event.target.value)}
            placeholder="Notizen zur Session"
            rows={2}
            className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />

          <button
            type="button"
            onClick={addSet}
            className="mt-3 rounded-xl border border-zinc-600 px-3 py-2 text-sm font-semibold text-zinc-200"
          >
            + Satz hinzufügen
          </button>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-lg font-semibold">Letzte 5 Einträge</h2>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-400">Noch keine History vorhanden.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-zinc-300">
              {history.map((entry, index) => (
                <li key={`${entry.dateISO}-${index}`}>
                  {new Date(entry.dateISO).toLocaleDateString("de-DE")} • {entry.value}
                </li>
              ))}
            </ul>
          )}
        </section>

        <button
          type="button"
          onClick={handleSaveExercise}
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