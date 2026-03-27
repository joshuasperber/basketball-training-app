"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function CreateExercisePage() {
  const [name, setName] = useState("");
  const [type, setType] = useState("makes");
  const [category, setCategory] = useState("basketball");
  const [durationMin, setDurationMin] = useState("10");

  const handleCreate = async () => {
    if (!name) {
      alert("Bitte Namen eingeben");
      return;
    }

    const { error } = await supabase.from("exercises").insert([
      {
        name,
        category,
        tracking_type: type,
        default_duration_min: Math.max(1, Number(durationMin) || 10),
      },
    ]);

    if (error) {
      alert(error.message);
    } else {
      alert("Exercise erstellt");

      // Reset
      setName("");
      setType("makes");
      setCategory("basketball");
      setDurationMin("10");
    }
  };

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-xl font-bold">Create Exercise</h1>

      <input
        className="w-full p-2 bg-zinc-800 rounded"
        placeholder="Name (z.B. Hook Shot)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <input
        className="w-full p-2 bg-zinc-800 rounded"
        type="number"
        min={1}
        placeholder="Dauer in Minuten (z.B. 15)"
        value={durationMin}
        onChange={(e) => setDurationMin(e.target.value)}
      />

      {/* CATEGORY */}
      <select
        className="w-full p-2 bg-zinc-800 rounded"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        <option value="basketball">Basketball</option>
        <option value="gym">Gym</option>
        <option value="home">Home</option>
      </select>

      {/* TRACKING TYPE */}
      <select
        className="w-full p-2 bg-zinc-800 rounded"
        value={type}
        onChange={(e) => setType(e.target.value)}
      >
        <option value="makes">Shooting (Makes)</option>
        <option value="reps_weight">Gym (Weight/Reps)</option>
        <option value="time">Time</option>
      </select>

      <button
        onClick={handleCreate}
        className="bg-blue-500 px-4 py-2 rounded w-full"
      >
        Create Exercise
      </button>
    </div>
  );
}