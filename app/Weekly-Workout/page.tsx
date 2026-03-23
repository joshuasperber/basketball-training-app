import Link from "next/link";
import {
  defaultExercises,
  getTodayWeekdayKey,
  getWorkoutById,
  weeklyWorkoutPlan,
} from "@/lib/training-data";

export default function WeeklyWorkoutPage() {
  const todayKey = getTodayWeekdayKey();
  const weekExercises = defaultExercises.slice(0, 3);

  return (
    <main className="min-h-screen bg-black p-6 pb-24 text-white">
      <h1 className="text-2xl font-bold">Weekly Workout</h1>
      <p className="mt-2 text-zinc-400">Schneller Start für diese Woche</p>

      <section className="mt-6 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-lg font-semibold">Workouts pro Tag</h2>
        {weeklyWorkoutPlan.map((entry) => {
          const workout = getWorkoutById(entry.workoutId);
          if (!workout) return null;

          const isToday = entry.day === todayKey;

          return (
            <Link
              key={entry.day}
              href={`/workouts/${workout.id}`}
              className={`block rounded-xl px-4 py-3 ${
                isToday
                  ? "border border-indigo-400 bg-indigo-900/40"
                  : "border border-indigo-500/70 bg-indigo-900/20"
              }`}
            >
              <p className="font-semibold">
                {entry.label} {isToday ? "• Heute" : ""}
              </p>
              <p>
                {workout.name} <span className="text-zinc-400">• Level {workout.level}</span>
              </p>
            </Link>
          );
        })}
      </section>
    </main>
  );
}