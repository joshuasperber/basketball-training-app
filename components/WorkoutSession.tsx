"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function WorkoutSession() {
  const [exercises, setExercises] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    fetchExercises();
  }, []);

  const fetchExercises = async () => {
    const { data } = await supabase.from("exercises").select("*");
    setExercises(data || []);
  };

  const addExercise = (exercise: any) => {
    setItems([...items, { exercise, values: {} }]);
  };

  const updateValue = (index: number, field: string, value: any) => {
    const updated = [...items];
    updated[index].values[field] = value;
    setItems(updated);
  };

  const handleSave = async () => {
    // 1. Session erstellen
    const { data: session } = await supabase
      .from("workout_sessions")
      .insert([{ total_duration_min: 60 }])
      .select()
      .single();

    // 2. Alle Exercises speichern
    const inserts = items.map((item: any) => ({
      workout_session_id: session.id,
      exercise_id: item.exercise.id,
      tracking_type: item.exercise.tracking_type,

      made: item.values.made || null,
      attempts: item.values.attempts || null,

      weight: item.values.weight || null,
      reps: item.values.reps || null,
      sets: item.values.sets || null,

      duration_sec: item.values.duration || null,
    }));

    await supabase.from("workout_session_items").insert(inserts);

    alert("Workout gespeichert!");
    setItems([]);
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Workout</h1>

      {/* ADD EXERCISE */}
      <select
        onChange={(e) => {
          const ex = exercises.find((x) => x.id === e.target.value);
          if (ex) addExercise(ex);
        }}
      >
        <option>Add Exercise</option>
        {exercises.map((ex) => (
          <option key={ex.id} value={ex.id}>
            {ex.name}
          </option>
        ))}
      </select>

      {/* LIST */}
      {items.map((item, index) => (
        <div key={index} className="border p-2 rounded">
          <h3>{item.exercise.name}</h3>

          {item.exercise.tracking_type === "makes" && (
            <>
              <input
                placeholder="Made"
                onChange={(e) =>
                  updateValue(index, "made", Number(e.target.value))
                }
              />
              <input
                placeholder="Attempts"
                onChange={(e) =>
                  updateValue(index, "attempts", Number(e.target.value))
                }
              />
            </>
          )}

          {item.exercise.tracking_type === "reps_weight" && (
            <>
              <input
                placeholder="Weight"
                onChange={(e) =>
                  updateValue(index, "weight", Number(e.target.value))
                }
              />
              <input
                placeholder="Reps"
                onChange={(e) =>
                  updateValue(index, "reps", Number(e.target.value))
                }
              />
              <input
                placeholder="Sets"
                onChange={(e) =>
                  updateValue(index, "sets", Number(e.target.value))
                }
              />
            </>
          )}

          {item.exercise.tracking_type === "time" && (
            <input
              placeholder="Seconds"
              onChange={(e) =>
                updateValue(index, "duration", Number(e.target.value))
              }
            />
          )}
        </div>
      ))}

      <button
        onClick={handleSave}
        className="bg-green-500 px-4 py-2 rounded"
      >
        Save Workout
      </button>
    </div>
  );
}