"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

type ProfileRow = {
  username: string | null;
  full_name: string | null;
  favorite_position: string | null;
  height_cm: number | null;
  weight_kg: number | null;
};

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileRow>({
    username: "joshua",
    full_name: "Joshua Sperber",
    favorite_position: "sg",
    height_cm: null,
    weight_kg: null,
  });

  useEffect(() => {
    const loadProfile = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("username, full_name, favorite_position, height_cm, weight_kg")
        .eq("username", "joshua")
        .limit(1)
        .maybeSingle<ProfileRow>();

      if (error) {
        setMessage(`Fehler beim Laden: ${error.message}`);
      } else if (data) {
        setProfile(data);
      }

      setLoading(false);
    };

    loadProfile();
  }, []);

  const onSave = async () => {
    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: profile.full_name,
        favorite_position: profile.favorite_position,
        height_cm: profile.height_cm,
        weight_kg: profile.weight_kg,
      })
      .eq("username", "joshua");

    setSaving(false);

    if (error) {
      setMessage(`Speichern fehlgeschlagen: ${error.message}`);
      return;
    }

    setMessage("Profil gespeichert ✅");
  };

  return (
    <main className="min-h-screen bg-zinc-950 p-6 pb-24 text-white">
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-2xl font-bold">Profil</h1>
        <p className="text-zinc-400">Passe dein Profil an und speichere es in Supabase.</p>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Username</label>
            <input
              value={profile.username ?? ""}
              disabled
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">Vollständiger Name</label>
            <input
              value={profile.full_name ?? ""}
              onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">Position</label>
            <select
              value={profile.favorite_position ?? "sg"}
              onChange={(e) => setProfile((p) => ({ ...p, favorite_position: e.target.value }))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            >
              <option value="pg">PG</option>
              <option value="sg">SG</option>
              <option value="sf">SF</option>
              <option value="pf">PF</option>
              <option value="c">C</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Größe (cm)</label>
              <input
                type="number"
                value={profile.height_cm ?? ""}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    height_cm: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">Gewicht (kg)</label>
              <input
                type="number"
                value={profile.weight_kg ?? ""}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    weight_kg: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={onSave}
            disabled={saving || loading}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {saving ? "Speichern..." : "Profil speichern"}
          </button>
        </div>

        {message && (
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-200">
            {message}
          </div>
        )}
      </div>
    </main>
  );
}