"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function WorkoutSessionPage() {
  const [exercises, setExercises] = useState<any[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<any>(null);

  // Inputs
  const [made, setMade] = useState(0);
  const [attempts, setAttempts] = useState(0);

  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(0);
  const [sets, setSets] = useState(0);

  const [time, setTime] = useState(0);

  useEffect(() => {
    fetchExercises();
  }, []);

  const fetchExercises = async () => {
    const { data } = await supabase.from("exercises").select("*");
    setExercises(data || []);
  };

  const handleSave = async () => {
    // 1. Session erstellen
    const { data: session } = await supabase
      .from("workout_sessions")
      .insert([{ total_duration_min: 30 }])
      .select()
      .single();

    // 2. Item speichern
    await supabase.from("workout_session_items").insert([
      {
        workout_session_id: session.id,
        exercise_id: selectedExercise.id,
        tracking_type: selectedExercise.tracking_type,

        made:
          selectedExercise.tracking_type === "makes" ? made : null,
        attempts:
          selectedExercise.tracking_type === "makes" ? attempts : null,

        weight:
          selectedExercise.tracking_type === "reps_weight"
            ? weight
            : null,
        reps:
          selectedExercise.tracking_type === "reps_weight"
            ? reps
            : null,
        sets:
          selectedExercise.tracking_type === "reps_weight"
            ? sets
            : null,

        duration_sec:
          selectedExercise.tracking_type === "time" ? time : null,
      },
    ]);

    alert("Saved!");
  };

  return (
    <div className="p-4">
      <h1>Workout Session</h1>

      {/* SELECT EXERCISE */}
      <select
        onChange={(e) =>
          setSelectedExercise(
            exercises.find((ex) => ex.id === e.target.value)
          )
        }
      >
        <option>Select Exercise</option>
        {exercises.map((ex) => (
          <option key={ex.id} value={ex.id}>
            {ex.name}
          </option>
        ))}
      </select>

      {/* TOGGLE UI */}
      {selectedExercise && (
        <div className="mt-4">
          {selectedExercise.tracking_type === "makes" && (
            <>
              <input
                type="number"
                placeholder="Made"
                onChange={(e) => setMade(Number(e.target.value))}
              />
              <input
                type="number"
                placeholder="Attempts"
                onChange={(e) => setAttempts(Number(e.target.value))}
              />
            </>
          )}

          {selectedExercise.tracking_type === "reps_weight" && (
            <>
              <input
                type="number"
                placeholder="Weight"
                onChange={(e) => setWeight(Number(e.target.value))}
              />
              <input
                type="number"
                placeholder="Reps"
                onChange={(e) => setReps(Number(e.target.value))}
              />
              <input
                type="number"
                placeholder="Sets"
                onChange={(e) => setSets(Number(e.target.value))}
              />
            </>
          )}

          {selectedExercise.tracking_type === "time" && (
            <input
              type="number"
              placeholder="Seconds"
              onChange={(e) => setTime(Number(e.target.value))}
            />
          )}
        </div>
      )}

      <button onClick={handleSave} className="mt-4">
        Save Workout
      </button>
    </div>
  );
}