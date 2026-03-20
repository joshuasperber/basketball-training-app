import TrainingDistributionPie from "@/components/TrainingDistributionPie";
import { supabase } from "@/lib/supabase";

type WorkoutSessionItemRow = {
  duration_sec: number | null;
  exercise_id: string;
};

type ExerciseRow = {
  id: string;
  category: string | null;
};

export default async function StatsPage() {
  const [{ data: sessionItems, error: sessionItemsError }, { data: exercises, error: exercisesError }] =
    await Promise.all([
      supabase.from("workout_session_items").select("exercise_id, duration_sec"),
      supabase.from("exercises").select("id, category"),
    ]);

  const error = sessionItemsError || exercisesError;

  const safeSessionItems = (sessionItems ?? []) as WorkoutSessionItemRow[];
  const safeExercises = (exercises ?? []) as ExerciseRow[];

  const exerciseCategoryMap = new Map(
    safeExercises.map((exercise) => [exercise.id, exercise.category ?? "Sonstige"])
  ); 

  const grouped = safeSessionItems.reduce<Record<string, number>>((acc, item) => {
    const category = exerciseCategoryMap.get(item.exercise_id) ?? "Sonstige";
    const duration = (item.duration_sec ?? 0) / 60;

    acc[category] = (acc[category] ?? 0) + duration;
    return acc;
  }, {});

  const chartData = Object.entries(grouped).map(([name, value]) => ({
    name,
    value,
  }));

  return (
    <main className="min-h-screen bg-black text-white p-6 pb-24">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold">Statistiken</h1>
        <p className="mt-2 text-zinc-400">
          Erste echte Trainingsauswertung aus Supabase.
        </p>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-300">
            Fehler beim Laden: {error.message}
          </div>
        ) : (
          <div className="mt-6">
            <TrainingDistributionPie data={chartData} />
          </div>
        )}
      </div>
    </main>
  );
}