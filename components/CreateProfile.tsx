"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function CreateProfile() {
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("pf");
  const [height, setHeight] = useState(196);
  const [weight, setWeight] = useState(100);

  const handleCreate = async () => {
    const { error } = await supabase.from("profiles").insert([
      {
        username,
        full_name: fullName,
        favorite_position: position,
        height_cm: height,
        weight_kg: weight,
      },
    ]);

    if (error) {
      alert(error.message);
    } else {
      alert("Profil erstellt");
    }
  };

  return (
    <div className="p-4 space-y-2">
      <input placeholder="Username" onChange={(e) => setUsername(e.target.value)} />
      <input placeholder="Full Name" onChange={(e) => setFullName(e.target.value)} />

      <input
        type="number"
        placeholder="Height (cm)"
        onChange={(e) => setHeight(Number(e.target.value))}
      />

      <input
        type="number"
        placeholder="Weight (kg)"
        onChange={(e) => setWeight(Number(e.target.value))}
      />

      <select onChange={(e) => setPosition(e.target.value)}>
        <option value="pg">PG</option>
        <option value="sg">SG</option>
        <option value="sf">SF</option>
        <option value="pf">PF</option>
        <option value="c">C</option>
      </select>

      <button onClick={handleCreate}>Create</button>
    </div>
  );
}