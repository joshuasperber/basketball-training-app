"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function CreateExercise() {
  const [name, setName] = useState("");
  const [trackingType, setTrackingType] = useState("makes");
  const [durationMin, setDurationMin] = useState("10");

  const handleCreate = async () => {
    await supabase.from("exercises").insert([
      {
        name,
        category: "basketball",
        tracking_type: trackingType,
        default_duration_min: Math.max(1, Number(durationMin) || 10),
      },
    ]);

    alert("Exercise erstellt");
  };

  return (
    <div className="p-4">
      <h2>Create Exercise</h2>

      <input
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <select
        value={trackingType}
        onChange={(e) => setTrackingType(e.target.value)}
      >
        <option value="makes">Shooting (Makes)</option>
        <option value="reps_weight">Gym</option>
        <option value="time">Time</option>
      </select>

      <input
        type="number"
        min={1}
        placeholder="Dauer in Minuten"
        value={durationMin}
        onChange={(e) => setDurationMin(e.target.value)}
      />

      <button onClick={handleCreate}>Create</button>
    </div>
  );
}