"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Exercise = {
  id: string;
  name: string;
  tracking_type: "makes" | "reps_weight" | "time";
};

type SessionItem = {
  exercise: Exercise;
  values: Record<string, number>;
};

export default function WorkoutSession() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [items, setItems] = useState<SessionItem[]>([]);

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

  function addExercise(exercise: Exercise) {
    setItems((current) => [...current, { exercise, values: {} }]);
  }

  function updateValue(index: number, field: string, value: number) {
    setItems((current) => {
      const updated = [...current];
      updated[index] = {
        ...updated[index],
        values: {
          ...updated[index].values,
          [field]: value,
        },
      };
      return updated;
    });
  }

  async function handleSave() {
    const { data: session } = await supabase
      .from("workout_sessions")
      .insert([{ total_duration_min: 60 }])
      .select()
      .single();

    if (!session) return;

    const inserts = items.map((item) => ({
      workout_session_id: session.id,
      exercise_id: item.exercise.id,
      tracking_type: item.exercise.tracking_type,
      made: item.values.made ?? null,
      attempts: item.values.attempts ?? null,
      weight: item.values.weight ?? null,
      reps: item.values.reps ?? null,
      sets: item.values.sets ?? null,
      duration_sec: item.values.duration ?? null,
    }));

    await supabase.from("workout_session_items").insert(inserts);
    alert("Workout gespeichert!");
    setItems([]);
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Workout</h1>

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

      {items.map((item, index) => (
        <div key={`${item.exercise.id}-${index}`} className="border p-2 rounded">
          <h3>{item.exercise.name}</h3>

          {item.exercise.tracking_type === "makes" && (
            <>
              <input placeholder="Made" onChange={(e) => updateValue(index, "made", Number(e.target.value))} />
              <input
                placeholder="Attempts"
                onChange={(e) => updateValue(index, "attempts", Number(e.target.value))}
              />
            </>
          )}

          {item.exercise.tracking_type === "reps_weight" && (
            <>
              <input
                placeholder="Weight"
                onChange={(e) => updateValue(index, "weight", Number(e.target.value))}
              />
              <input placeholder="Reps" onChange={(e) => updateValue(index, "reps", Number(e.target.value))} />
              <input placeholder="Sets" onChange={(e) => updateValue(index, "sets", Number(e.target.value))} />
            </>
          )}

          {item.exercise.tracking_type === "time" && (
            <input
              placeholder="Seconds"
              onChange={(e) => updateValue(index, "duration", Number(e.target.value))}
            />
          )}
        </div>
      ))}

      <button onClick={handleSave} className="bg-green-500 px-4 py-2 rounded">
        Save Workout
      </button>
    </div>
  );
}