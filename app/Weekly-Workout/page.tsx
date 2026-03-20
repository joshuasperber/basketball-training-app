import { getTodayKey, getTodayWorkout, weeklyPlan } from "@/lib/weeklyPlan";

const dayLabels: Record<string, string> = {
  monday: "Montag",
  tuesday: "Dienstag",
  wednesday: "Mittwoch",
  thursday: "Donnerstag",
  friday: "Freitag",
  saturday: "Samstag",
  sunday: "Sonntag",
};

export default function WeeklyWorkoutPage() {
  const todayKey = getTodayKey();
  const todayWorkout = getTodayWorkout();

  return (
    <main className="min-h-screen bg-zinc-950 p-6 pb-24 text-white">
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-2xl font-bold">Weekly Workout Plan</h1>
        <p className="text-zinc-400">
          Dein Wochenplan mit Fokus, Dauer und Exercises.
        </p>

        <div className="rounded-2xl border border-indigo-500/40 bg-indigo-500/10 p-4">
          <p className="text-xs uppercase tracking-wider text-indigo-300">Heute · {dayLabels[todayKey]}</p>
          <h2 className="mt-1 text-xl font-semibold">{todayWorkout.title}</h2>
          <p className="text-sm text-zinc-300">
            {todayWorkout.category.toUpperCase()} · {todayWorkout.focus} · {todayWorkout.durationMin} min
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-200">
            {todayWorkout.exercises.map((exercise) => (
              <li key={exercise}>{exercise}</li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          {Object.entries(weeklyPlan).map(([day, workout]) => {
            const isToday = day === todayKey;

            return (
              <div
                key={day}
                className={`rounded-2xl border p-4 ${
                  isToday
                    ? "border-indigo-500 bg-indigo-500/10"
                    : "border-zinc-800 bg-zinc-900"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{dayLabels[day]}</p>
                  <p className="text-xs text-zinc-400">{workout.category.toUpperCase()}</p>
                </div>
                <p className="mt-1 text-sm text-zinc-200">{workout.title}</p>
                <p className="text-xs text-zinc-400">
                  {workout.focus} · {workout.durationMin} min
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}