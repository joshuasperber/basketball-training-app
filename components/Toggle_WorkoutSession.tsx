"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Exercise = {
  id: string;
  name: string;
  tracking_type: "makes" | "reps_weight" | "time";
};

export default function WorkoutSessionPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);

  const [made, setMade] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(0);
  const [sets, setSets] = useState(0);
  const [time, setTime] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from<Exercise>("exercises")
      .select("id, name, tracking_type")
      .then(({ data }) => {
        if (!cancelled) {
          setExercises(data ?? []);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    if (!selectedExercise) return;

    const { data: session } = await supabase
      .from("workout_sessions")
      .insert([{ total_duration_min: 30 }])
      .select()
      .single();

    if (!session) return;

    await supabase.from("workout_session_items").insert([
      {
        workout_session_id: session.id,
        exercise_id: selectedExercise.id,
        tracking_type: selectedExercise.tracking_type,
        made: selectedExercise.tracking_type === "makes" ? made : null,
        attempts: selectedExercise.tracking_type === "makes" ? attempts : null,
        weight: selectedExercise.tracking_type === "reps_weight" ? weight : null,
        reps: selectedExercise.tracking_type === "reps_weight" ? reps : null,
        sets: selectedExercise.tracking_type === "reps_weight" ? sets : null,
        duration_sec: selectedExercise.tracking_type === "time" ? time : null,
      },
    ]);

    alert("Saved!");
  }

  return (
    <div className="p-4">
      <h1>Workout Session</h1>

      <select
        onChange={(e) => setSelectedExercise(exercises.find((ex) => ex.id === e.target.value) ?? null)}
      >
        <option>Select Exercise</option>
        {exercises.map((ex) => (
          <option key={ex.id} value={ex.id}>
            {ex.name}
          </option>
        ))}
      </select>

      {selectedExercise && (
        <div className="mt-4">
          {selectedExercise.tracking_type === "makes" && (
            <>
              <input type="number" placeholder="Made" onChange={(e) => setMade(Number(e.target.value))} />
              <input
                type="number"
                placeholder="Attempts"
                onChange={(e) => setAttempts(Number(e.target.value))}
              />
            </>
          )}

          {selectedExercise.tracking_type === "reps_weight" && (
            <>
              <input type="number" placeholder="Weight" onChange={(e) => setWeight(Number(e.target.value))} />
              <input type="number" placeholder="Reps" onChange={(e) => setReps(Number(e.target.value))} />
              <input type="number" placeholder="Sets" onChange={(e) => setSets(Number(e.target.value))} />
            </>
          )}

          {selectedExercise.tracking_type === "time" && (
            <input type="number" placeholder="Seconds" onChange={(e) => setTime(Number(e.target.value))} />
          )}
        </div>
      )}

      <button onClick={handleSave} className="mt-4">
        Save Workout
      </button>
    </div>
  );
}