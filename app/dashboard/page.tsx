"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SportsNewsSection from "@/components/SportsNewsSection";
import {
  WorkoutProgress,
  buildWorkoutStorageKey,
  getDefaultWorkoutProgress,
  getTodayDateKey,
  getTodayWorkoutPlan,
  getWeekdayName,
  parseWorkoutProgress,
} from "@/lib/workout";

export default function DashboardPage() {
  const dateKey = useMemo(() => getTodayDateKey(), []);
  const todayWorkout = useMemo(() => getTodayWorkoutPlan(), []);
  const weekdayLabel = useMemo(() => getWeekdayName(new Date(`${dateKey}T00:00:00.000Z`)), [dateKey]);
  const fallbackProgress = useMemo(
    () => getDefaultWorkoutProgress(dateKey, todayWorkout),
    [dateKey, todayWorkout],
  );

  const [progress, setProgress] = useState<WorkoutProgress>(fallbackProgress);

  useEffect(() => {
    setProgress(
      parseWorkoutProgress(
        window.localStorage.getItem(buildWorkoutStorageKey(dateKey)),
        fallbackProgress,
      ),
    );
  }, [dateKey, fallbackProgress]);

  const isCompleted = progress.status === "completed";
  const isInProgress = progress.status === "in_progress";

  return (
    <main className="min-h-screen bg-black p-6 pb-24 text-white">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-2 text-zinc-400">Übersicht über dein Training</p>

      {!isCompleted ? (
        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Heutiges Workout • {weekdayLabel}
          </p>
          <h2 className="mt-2 text-xl font-semibold">{todayWorkout.title}</h2>
          <p className="text-sm text-zinc-400">Sport: {todayWorkout.sport}</p>
          <p className="text-sm text-zinc-400">Unterkategorie: {todayWorkout.subcategory}</p>

          <p className="mt-4 text-sm text-zinc-300">
            {isInProgress
              ? "Workout begonnen. Du kannst direkt weitermachen."
              : "Workout noch offen. Starte jetzt deine Einheit."}
          </p>

          <Link
            href="/workouts"
            className="mt-4 inline-block rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"
          >
            {isInProgress ? "Workout fortsetzen" : "Workout starten"}
          </Link>
        </section>
      ) : (
        <section className="mt-6 rounded-2xl border border-green-800 bg-green-950/50 p-4">
          <h2 className="text-lg font-semibold text-green-300">Heutiges Workout erledigt ✅</h2>
          <p className="mt-1 text-sm text-green-200">
            Stark! Das Workout für heute wird deshalb nicht mehr im Dashboard angezeigt.
          </p>
        </section>
      )}

      <SportsNewsSection />
    </main>
  );
}