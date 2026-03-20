"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function CreateExercise() {
  const [name, setName] = useState("");
  const [trackingType, setTrackingType] = useState("makes");

  const handleCreate = async () => {
    await supabase.from("exercises").insert([
      {
        name,
        category: "basketball",
        tracking_type: trackingType,
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

      <button onClick={handleCreate}>Create</button>
    </div>
  );
}