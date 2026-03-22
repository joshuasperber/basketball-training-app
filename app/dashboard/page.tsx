import Link from "next/link";
import { defaultExercises, defaultWorkouts } from "@/lib/training-data";

export default function DashboardPage() {
  const featuredWorkout = defaultWorkouts[0];
  const featuredExercise = defaultExercises[0];

  return (
    <main className="min-h-screen bg-black p-6 pb-24 text-white">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-2 text-zinc-400">Übersicht über dein Training</p>

      <section className="mt-6 grid gap-3">
        <Link
          href="/Weekly-Workout"
          className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 font-semibold"
        >
          Weekly Plan öffnen
        </Link>

        {featuredWorkout ? (
          <Link
            href={`/workouts/${featuredWorkout.id}`}
            className="rounded-xl border border-indigo-500 bg-indigo-900/30 px-4 py-3 font-semibold text-indigo-200"
          >
            Direkt starten: {featuredWorkout.name}
          </Link>
        ) : null}

        {featuredExercise ? (
          <Link
            href={`/exercises/${featuredExercise.id}`}
            className="rounded-xl border border-emerald-500 bg-emerald-900/30 px-4 py-3 font-semibold text-emerald-200"
          >
            Direkt starten: {featuredExercise.name}
          </Link>
        ) : null}
      </section>
    </main>
  );
}