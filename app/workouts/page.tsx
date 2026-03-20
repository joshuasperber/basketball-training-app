import WorkoutPlanner from "@/components/WorkoutPlanner";

export default function WorkoutsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 p-6 pb-24 text-white">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold">Workouts</h1>
        <p className="mt-2 text-zinc-400">
          Plane deine Woche, starte komplette Workouts oder einzelne Exercises.
        </p>

        <div className="mt-6">
          <WorkoutPlanner />
        </div>
      </div>
    </main>
  );
}