"use client";

import Link from "next/link";
import { WEEKLY_WORKOUT_PLAN, getTodayWorkoutPlan } from "@/lib/workout";

const weekdayOrder = [1, 2, 3, 4, 5, 6, 0] as const;

const weekdayNames: Record<(typeof weekdayOrder)[number], string> = {
  0: "Sonntag",
  1: "Montag",
  2: "Dienstag",
  3: "Mittwoch",
  4: "Donnerstag",
  5: "Freitag",
  6: "Samstag",
};

export default function WeeklyWorkoutPage() {
  const todayIndex = new Date().getDay() as (typeof weekdayOrder)[number];
  const todayWorkout = getTodayWorkoutPlan();

  return (
    <main className="min-h-screen bg-black p-6 pb-24 text-white">
      <h1 className="text-2xl font-bold">Weekly Workout Plan</h1>
      <p className="mt-2 text-zinc-400">Wochenübersicht mit heutigem Fokus</p>

      <section className="mt-6 rounded-2xl border border-green-800 bg-green-950/50 p-4">
        <p className="text-xs uppercase tracking-wide text-green-300">Heute</p>
        <h2 className="mt-2 text-xl font-semibold">{todayWorkout.title}</h2>
        <p className="mt-1 text-sm text-green-200">Sport: {todayWorkout.sport}</p>
        <p className="text-sm text-green-200">Unterkategorie: {todayWorkout.subcategory}</p>
        <Link
          href="/workouts"
          className="mt-4 inline-block rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"
        >
          Zum heutigen Workout
        </Link>
      </section>

      <div className="mt-6 space-y-3">
        {weekdayOrder.map((day) => {
          const workout = WEEKLY_WORKOUT_PLAN[day];
          const isToday = day === todayIndex;

          return (
            <article
              key={day}
              className={
                isToday
                  ? "rounded-2xl border border-green-700 bg-zinc-900 p-4"
                  : "rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
              }
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{weekdayNames[day]}</h3>
                {isToday ? (
                  <span className="rounded-full bg-green-600 px-2 py-1 text-xs font-semibold text-white">
                    Heute
                  </span>
                ) : null}
              </div>

              <p className="mt-2 text-lg font-medium">{workout.title}</p>
              <p className="text-sm text-zinc-400">Sport: {workout.sport}</p>
              <p className="text-sm text-zinc-400">Unterkategorie: {workout.subcategory}</p>

              <ul className="mt-3 list-inside list-disc text-sm text-zinc-300">
                {workout.exercises.map((exercise) => (
                  <li key={`${workout.id}-${exercise.name}`}>{exercise.name}</li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </main>
  );
}