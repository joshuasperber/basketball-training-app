"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("pf");
  const [height, setHeight] = useState(180);
  const [weight, setWeight] = useState(80);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const { data } = await supabase.from("profiles").select("*").limit(1);

    if (data && data.length > 0) {
      const p = data[0];
      setProfile(p);

      setUsername(p.username || "");
      setFullName(p.full_name || "");
      setPosition(p.favorite_position || "pf");
      setHeight(p.height_cm || 180);
      setWeight(p.weight_kg || 80);
    }
  };

  const handleSave = async () => {
    if (profile) {
      // UPDATE
      await supabase
        .from("profiles")
        .update({
          username,
          full_name: fullName,
          favorite_position: position,
          height_cm: height,
          weight_kg: weight,
        })
        .eq("id", profile.id);

      alert("Profil aktualisiert");
    } else {
      // CREATE
      await supabase.from("profiles").insert([
        {
          username,
          full_name: fullName,
          favorite_position: position,
          height_cm: height,
          weight_kg: weight,
        },
      ]);

      alert("Profil erstellt");
      loadProfile();
    }
  };

  return (
    <main className="p-4 space-y-3">
      <h1 className="text-xl font-bold">Profile</h1>

      <input
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />

      <input
        placeholder="Full Name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
      />

      <input
        type="number"
        placeholder="Height"
        value={height}
        onChange={(e) => setHeight(Number(e.target.value))}
      />

      <input
        type="number"
        placeholder="Weight"
        value={weight}
        onChange={(e) => setWeight(Number(e.target.value))}
      />

      <select
        value={position}
        onChange={(e) => setPosition(e.target.value)}
      >
        <option value="pg">PG</option>
        <option value="sg">SG</option>
        <option value="sf">SF</option>
        <option value="pf">PF</option>
        <option value="c">C</option>
      </select>

      <button
        onClick={handleSave}
        className="bg-blue-500 px-4 py-2 rounded"
      >
        {profile ? "Update Profile" : "Create Profile"}
      </button>
    </main>
  );
}