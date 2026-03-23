"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getTodayWeekdayKey,
  getWorkoutById,
  weeklyWorkoutPlan,
} from "@/lib/training-data";
import { SessionDatabase, WorkoutSessionEntry } from "@/lib/session-types";

export default function DashboardPage() {
  const [workoutSessions, setWorkoutSessions] = useState<WorkoutSessionEntry[]>([]);

  const todayWorkout = useMemo(() => {
    const dayKey = getTodayWeekdayKey();
    const planEntry = weeklyWorkoutPlan.find((entry) => entry.day === dayKey);
    if (!planEntry) return null;
    return getWorkoutById(planEntry.workoutId) ?? null;
  }, []);

  const recentSessions = workoutSessions.slice(0, 5);

  useEffect(() => {
    async function loadSessions() {
      const response = await fetch("/api/sessions", { cache: "no-store" });
      const db = (await response.json()) as SessionDatabase;
      setWorkoutSessions(db.workoutSessions ?? []);
    }

    void loadSessions();
  }, []);

  return (
    <main className="min-h-screen bg-black p-6 pb-24 text-white">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-2 text-zinc-400">Übersicht über dein Training</p>

      <section className="mt-6 grid gap-3">
        {todayWorkout ? (
          <Link
            href={`/workouts/${todayWorkout.id}`}
            className="rounded-xl border border-indigo-400 bg-indigo-900/50 px-4 py-4 font-semibold text-lg text-indigo-100"
          >
            Heute dran: {todayWorkout.name}
          </Link>
        ) : null}

        <Link
          href="/Weekly-Workout"
          className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 font-semibold"
        >
          Weekly Plan öffnen
        </Link>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-lg font-semibold">Letzte Workouts</h2>
        {recentSessions.length === 0 ? (
          <p className="mt-2 text-zinc-400">Noch keine Workout-Session gespeichert.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {recentSessions.map((session) => (
              <li key={session.id} className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2">
                <Link href={`/workouts/${session.workoutId}`} className="font-semibold text-indigo-300">
                  {session.workoutName}
                </Link>
                <p className="text-xs text-zinc-400">
                  {new Date(session.dateISO).toLocaleDateString("de-DE")} • {session.logs.length} Exercises
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}