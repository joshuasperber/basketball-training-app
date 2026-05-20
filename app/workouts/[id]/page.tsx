import { redirect } from "next/navigation";

export default async function WorkoutExecutionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/workouts?workoutId=${encodeURIComponent(id)}`);
}