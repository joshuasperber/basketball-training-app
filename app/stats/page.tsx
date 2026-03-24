"use client";

import { useMemo } from "react";
import { CompletedWorkoutHistoryEntry, WORKOUT_HISTORY_KEY } from "@/lib/workout";

type CategorySlice = {
  label: string;
  value: number;
  color: string;
};

const PIE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6"];

function loadHistory(): CompletedWorkoutHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(WORKOUT_HISTORY_KEY);

  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as CompletedWorkoutHistoryEntry[];
  } catch {
    return [];
  }
}

function pieGradient(slices: CategorySlice[]) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (total <= 0) {
    return "conic-gradient(#27272a 0deg 360deg)";
  }

  let start = 0;
  const segments = slices.map((slice) => {
    const degrees = (slice.value / total) * 360;
    const end = start + degrees;
    const segment = `${slice.color} ${start}deg ${end}deg`;
    start = end;
    return segment;
  });

  return `conic-gradient(${segments.join(", ")})`;
}

function buildSlices(entries: CompletedWorkoutHistoryEntry[], by: "sport" | "subcategory") {
  const map = new Map<string, number>();

  entries.forEach((entry) => {
    const key = by === "sport" ? entry.sport : entry.subcategory;
    map.set(key, (map.get(key) ?? 0) + 1);
  });

  return Array.from(map.entries())
    .map(([label, value], index) => ({
      label,
      value,
      color: PIE_COLORS[index % PIE_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value);
}

function PieCard({ title, slices }: { title: string; slices: CategorySlice[] }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 flex items-center gap-4">
        <div
          className="h-28 w-28 rounded-full border border-zinc-700"
          style={{ background: pieGradient(slices) }}
        />

        <ul className="space-y-2 text-sm text-zinc-300">
          {slices.length === 0 ? (
            <li className="text-zinc-500">Noch keine Daten vorhanden.</li>
          ) : (
            slices.map((slice) => (
              <li key={slice.label} className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: slice.color }} />
                <span>
                  {slice.label}: <strong>{slice.value}</strong>
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}

export default function StatsPage() {
  const history = useMemo(() => loadHistory(), []);

  const weeklyCompleted = useMemo(() => {
    const today = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(today.getDate() - 6);

    return history.filter((entry) => {
      const date = new Date(entry.date);
      return date >= weekAgo && date <= today;
    }).length;
  }, [history]);

  const totalSets = history.reduce((sum, entry) => sum + entry.totalSets, 0);
  const totalReps = history.reduce((sum, entry) => sum + entry.totalReps, 0);
  const totalVolume = history.reduce((sum, entry) => sum + entry.totalVolumeKg, 0);

  const sportSlices = useMemo(() => buildSlices(history, "sport"), [history]);
  const categorySlices = useMemo(() => buildSlices(history, "subcategory"), [history]);

  return (
    <main className="min-h-screen bg-black p-6 pb-24 text-white">
      <h1 className="text-2xl font-bold">Statistiken</h1>
      <p className="mt-2 text-zinc-400">Langfristige Auswertung deiner abgeschlossenen Workouts</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Abgeschlossene Workouts</p>
          <p className="mt-2 text-3xl font-bold">{history.length}</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Weekly (7 Tage)</p>
          <p className="mt-2 text-3xl font-bold">{weeklyCompleted}</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Sätze gesamt</p>
          <p className="mt-2 text-3xl font-bold">{totalSets}</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Reps gesamt</p>
          <p className="mt-2 text-3xl font-bold">{totalReps}</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:col-span-2">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Volumen gesamt (kg)</p>
          <p className="mt-2 text-3xl font-bold">{totalVolume}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <PieCard title="Gym vs Basketball" slices={sportSlices} />
        <PieCard title="Unterkategorien (Handles, Shooting, ... )" slices={categorySlices} />
      </div>
    </main>
  );
}