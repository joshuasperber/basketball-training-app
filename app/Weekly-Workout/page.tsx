import Link from "next/link";
import { defaultExercises, defaultWorkouts } from "@/lib/training-data";

export default function WeeklyWorkoutPage() {
  const weekWorkouts = defaultWorkouts.slice(0, 3);
  const weekExercises = defaultExercises.slice(0, 3);

  return (
    <main className="min-h-screen bg-black p-6 pb-24 text-white">
      <h1 className="text-2xl font-bold">Weekly Workout</h1>
      <p className="mt-2 text-zinc-400">Schneller Start für diese Woche</p>

      <section className="mt-6 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-lg font-semibold">Workouts</h2>
        {weekWorkouts.map((workout) => (
          <Link
            key={workout.id}
            href={`/workouts/${workout.id}`}
            className="block rounded-xl border border-indigo-500/70 bg-indigo-900/20 px-4 py-3"
          >
            {workout.name} <span className="text-zinc-400">• Level {workout.level}</span>
          </Link>
        ))}
      </section>

      <section className="mt-4 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-lg font-semibold">Exercises</h2>
        {weekExercises.map((exercise) => (
          <Link
            key={exercise.id}
            href={`/exercises/${exercise.id}`}
            className="block rounded-xl border border-emerald-500/70 bg-emerald-900/20 px-4 py-3"
          >
            {exercise.name} <span className="text-zinc-400">• {exercise.trackingType}</span>
          </Link>
        ))}
      </section>
    </main>
  );
}