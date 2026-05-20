"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { defaultExercises, type Exercise } from "@/lib/training-data";
import { loadExercises } from "@/lib/training-storage";
import { appendExerciseHistory, appendWorkoutSession, getExerciseHistory } from "@/lib/session-storage";
import { pullProgressFromCloud, pushProgressToCloud } from "@/lib/progress-sync";
import { appendWorkoutXpEntry } from "@/lib/level-system";

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
  const reps = getNumeric(values, "reps");
  const makes = getNumeric(values, "makes");
  const misses = getNumeric(values, "misses");
  const base = reps;

  if (base !== null) {
    if (makes !== null && makes > base) return "Makes darf nicht größer als Reps sein.";
    if (misses !== null && misses > base) return "Misses darf nicht größer als Reps sein.";
    if (makes !== null && misses !== null && makes + misses > base) {
      return "Makes + Misses darf nicht größer als Reps sein.";
    }
  }

  return null;
}

function getCompletedValue(values: Partial<Record<string, string>>) {
  const reps = getNumeric(values, "reps") ?? getNumeric(values, "tries");
  if (reps !== null) return reps;

  const makes = getNumeric(values, "makes");
  const misses = getNumeric(values, "misses");
  if (makes !== null && misses !== null) return makes + misses;
  if (makes !== null) return makes;

  return (
    getNumeric(values, "time") ??
    getNumeric(values, "points") ??
    getNumeric(values, "distance") ??
    getNumeric(values, "weight") ??
    null
  );
}

function roundUpToFiveMinutes(minutes: number) {
  if (minutes <= 0) return 0;
  return Math.ceil(minutes / 5) * 5;
}

function getExerciseDurationForSetCount(exercise: Exercise, setCount: number) {
  const baseSetCount = Math.max(1, exercise.setCount ?? 1);
  const perSetMinutes = Math.max(0, exercise.durationMin) / baseSetCount;
  return roundUpToFiveMinutes(perSetMinutes * Math.max(1, setCount));
}

export default function ExerciseExecutionPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const exerciseId = params.id;
  const [exercises, setExercises] = useState<Exercise[]>(defaultExercises);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setExercises(loadExercises());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const exercise = useMemo(
    () => exercises.find((entry) => entry.id === exerciseId),
    [exerciseId, exercises],
  );

  const [sets, setSets] = useState<ExerciseSet[]>(() => {
    const setCount = Math.max(1, exercise?.setCount ?? 1);
    return Array.from({ length: setCount }, (_, index) => ({ id: `set-${index + 1}`, values: {} }));
  });
  const [sessionNote, setSessionNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<{ dateISO: string; value: number }[]>([]);

  const refreshHistory = useCallback(async () => {
    if (!exercise) return;
    const entries = getExerciseHistory(exercise.id)
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
    let hasAnyCompleted = false;
    let bestValue = 0;
    const sessionLogs: Array<{
      exerciseId: string;
      completedValue: number | null;
      note: string;
      completed?: boolean;
      made?: number | null;
      attempts?: number | null;
      misses?: number | null;
      weightKg?: number | null;
    }> = [];

    sets.forEach((set) => {
      const value = getCompletedValue(set.values);
      const hasAnyMetric = Object.values(set.values).some((entry) => entry != null && entry.trim() !== "");
      const isCompleted = hasAnyMetric;
      if (value === null) return;
      if (!isCompleted) return;
      hasAnyCompleted = true;
      const numericValue = value ?? 1;
      bestValue = Math.max(bestValue, numericValue);
      appendExerciseHistory({
        id: `eh-${Date.now()}-${set.id}`,
        dateISO: nowISO,
        exerciseId: exercise.id,
        value: numericValue,
        note: sessionNote || undefined,
        source: "exercise",
      });
      sessionLogs.push({
        exerciseId: exercise.id,
        completedValue: numericValue,
        note: sessionNote || "",
        completed: true,
        made: getNumeric(set.values, "makes"),
        attempts: getNumeric(set.values, "reps") ?? getNumeric(set.values, "tries"),
        misses: getNumeric(set.values, "misses"),
        weightKg: getNumeric(set.values, "weight"),
      });

    });
    if (hasAnyCompleted) {
      appendWorkoutSession({
        id: `single-${Date.now()}-${exercise.id}`,
        dateISO: nowISO,
        workoutId: "single-exercise-session",
        workoutName: `Einzel-Exercise: ${exercise.name}`,
        workoutCategory: exercise.category,
        workoutSubcategory: exercise.subcategory,
        durationSeconds: Math.max(60, getExerciseDurationForSetCount(exercise, sets.length) * 60),
        logs: sessionLogs.length > 0 ? sessionLogs : [{
          exerciseId: exercise.id,
          completedValue: bestValue || 1,
          note: sessionNote || "",
          completed: true,
        }],
      });

      appendWorkoutXpEntry({
        id: `xp-single-${Date.now()}-${exercise.id}`,
        date: nowISO,
        workoutId: "single-exercise-session",
        workoutTitle: exercise.name,
        exerciseXp: 18,
        workoutXp: 0,
        totalXp: 18,
        achievedSets: 1,
        totalSets: 1,
        qualityScore: 1,
      });
    }

    await refreshHistory();
    setSaved(true);
    void pushProgressToCloud();
    router.push("/training?completed=exercise");
  }

  useEffect(() => {
    void pullProgressFromCloud();
    const timer = window.setTimeout(() => {
      void refreshHistory();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refreshHistory]);

  if (!exercise) {
    return (
      <main className="app-container">
        <div className="app-card">
          <p className="text-lg font-bold">Exercise nicht gefunden.</p>
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
          <p className="page-eyebrow">Exercise</p>
          <h1 className="page-title">{exercise.name}</h1>
          <p className="mt-2 text-sm text-muted">
            {exercise.category} · {exercise.subcategory}
          </p>
          <p className="mt-1 text-sm text-muted">
            Ziel:{" "}
            {exercise.metricKeys
              .map((metric) => {
                const target = exercise.targetByMetric?.[metric];
                return target !== undefined ? `${metric}: ${target}` : null;
              })
              .filter((entry): entry is string => Boolean(entry))
              .join(" · ") || "-"}
          </p>
          {exercise.notes ? <p className="mt-1 text-xs text-faint">Notizen: {exercise.notes}</p> : null}
        </header>

        <section className="app-card">
          <p className="section-eyebrow">Sätze</p>
          <h2 className="section-title mt-1">Sets erfassen</h2>
          <div className="mt-3 space-y-2">
            {sets.map((set, index) => (
              <div key={set.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-sm font-semibold text-strong">Satz {index + 1}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {exercise.metricKeys.map((metric) => (
                    <div key={`${set.id}-${metric}`}>
                      <label className="input-label">{metric}</label>
                      <input
                        type="number"
                        value={set.values[metric] ?? ""}
                        onChange={(event) => updateSetValue(set.id, metric, event.target.value)}
                        placeholder={metric}
                        className="input"
                      />
                    </div>
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
            className="textarea mt-3"
          />

          <button type="button" onClick={addSet} className="btn btn-ghost btn-sm mt-3">
            + Satz hinzufügen
          </button>
        </section>

        <section className="app-card">
          <p className="section-eyebrow">Verlauf</p>
          <h2 className="section-title mt-1">Letzte 5 Einträge</h2>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Noch keine History vorhanden.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-strong">
              {history.map((entry, index) => (
                <li key={`${entry.dateISO}-${index}`} className="text-muted">
                  {new Date(entry.dateISO).toLocaleDateString("de-DE")} · <span className="text-strong">{entry.value}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <button type="button" onClick={handleSaveExercise} className="btn btn-primary btn-block">
          Exercise speichern
        </button>

        {saved ? (
          <p className="app-card--accent-emerald text-sm">
            Exercise-Session gespeichert (lokal im State).
          </p>
        ) : null}

        <Link href="/training" className="btn btn-ghost btn-sm self-start">
          ← Zurück zu Training
        </Link>
      </div>
    </main>
  );
}
