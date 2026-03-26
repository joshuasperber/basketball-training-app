"use client";

import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useState } from "react";

const PROFILE_USERNAME_KEY = "profile_username";
const PROFILE_LOCAL_CACHE_KEY = "profile_cache_v1";

const PLAY_STYLE_BY_POSITION: Record<string, string[]> = {
  pg: ["Passer", "Floor General", "Pick-and-Roll Creator", "Tempo Controller"],
  sg: ["Shooter", "Slasher (Drive to the Basket)", "3&D", "Off-Ball Mover"],
  sf: ["Two-Way Wing", "Point Forward", "Cutting Wing", "Spot-Up Wing"],
  pf: ["Stretch Four", "Roll Man", "Post Finisher", "Rebounder"],
  c: ["Rim Protector", "Post Scorer", "Lob Threat", "High-Post Playmaker"],
};

type ProfileRow = {
  username: string | null;
  full_name: string | null;
  favorite_position: string | null;
  height_cm: number | null;
  weight_kg: number | null;
};

type ProfileLocalCache = ProfileRow & {
  play_style: string | null;
};

function getDefaultPlayStyle(position: string | null) {
  const safePosition = position ?? "sg";
  return PLAY_STYLE_BY_POSITION[safePosition]?.[0] ?? "Shooter";
}

function saveLocalProfileCache(nextProfile: ProfileRow, nextPlayStyle: string) {
  if (typeof window === "undefined") return;
  const payload: ProfileLocalCache = {
    ...nextProfile,
    play_style: nextPlayStyle,
  };
  window.localStorage.setItem(PROFILE_LOCAL_CACHE_KEY, JSON.stringify(payload));
}

function loadLocalProfileCache() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PROFILE_LOCAL_CACHE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ProfileLocalCache;
  } catch {
    return null;
  }
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileRow>({
    username: "joshua",
    full_name: "Joshua Sperber",
    favorite_position: "pf",
    height_cm: null,
    weight_kg: null,
  });
  const [playStyle, setPlayStyle] = useState<string>("Stretch Four");

  const loadProfile = useCallback(async (usernameOverride?: string) => {
    const localCache = loadLocalProfileCache();
    if (localCache) {
      setProfile({
        username: localCache.username,
        full_name: localCache.full_name,
        favorite_position: localCache.favorite_position,
        height_cm: localCache.height_cm,
        weight_kg: localCache.weight_kg,
      });
      setPlayStyle(localCache.play_style ?? getDefaultPlayStyle(localCache.favorite_position));
    }

    const username =
      usernameOverride ??
      localCache?.username ??
      (typeof window !== "undefined" ? window.localStorage.getItem(PROFILE_USERNAME_KEY) : null) ??
      "joshua";

    const { data, error } = await supabase
      .from("profiles")
      .select("username, full_name, favorite_position, height_cm, weight_kg")
      .eq("username", username)
      .limit(1)
      .maybeSingle<ProfileRow>();

    if (error) {
      setMessage(`Fehler beim Laden: ${error.message}`);
    } else if (data) {
      setProfile(data);
      const nextPlayStyle = localCache?.play_style ?? getDefaultPlayStyle(data.favorite_position);
      setPlayStyle(nextPlayStyle);
      saveLocalProfileCache(data, nextPlayStyle);
    } else {
      setProfile((previous) => {
        const nextProfile = { ...previous, username };
        saveLocalProfileCache(nextProfile, getDefaultPlayStyle(nextProfile.favorite_position));
        return nextProfile;
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfile();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProfile]);

  const onSave = async () => {
    setSaving(true);
    setMessage(null);
    const username = (profile.username ?? "").trim().toLowerCase();
    if (!username) {
      setSaving(false);
      setMessage("Bitte einen Username eingeben.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .upsert({
        username,
        full_name: profile.full_name,
        favorite_position: profile.favorite_position,
        height_cm: profile.height_cm,
        weight_kg: profile.weight_kg,
      });

    if (error) {
      setSaving(false);
      setMessage(`Speichern fehlgeschlagen: ${error.message}`);
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(PROFILE_USERNAME_KEY, username);
    }
    saveLocalProfileCache({ ...profile, username }, playStyle);

    await loadProfile(username); // sofort neu laden => direkt reflektiert
    setSaving(false);
    setMessage("Profil gespeichert ✅");
  };

  return (
    <main className="min-h-screen bg-zinc-950 p-6 pb-24 text-white">
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-2xl font-bold">Profil</h1>
        <p className="text-zinc-400">Bearbeite dein Profil und speichere direkt in Supabase.</p>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Username</label>
            <input
              value={profile.username ?? ""}
              onChange={(e) =>
                setProfile((p) => {
                  const nextProfile = { ...p, username: e.target.value };
                  saveLocalProfileCache(nextProfile, playStyle);
                  return nextProfile;
                })
              }
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">Vollständiger Name</label>
            <input
              value={profile.full_name ?? ""}
              onChange={(e) =>
                setProfile((p) => {
                  const nextProfile = { ...p, full_name: e.target.value };
                  saveLocalProfileCache(nextProfile, playStyle);
                  return nextProfile;
                })
              }
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">Position</label>
            <select
              value={profile.favorite_position ?? "sg"}
              onChange={(e) => {
                const nextPosition = e.target.value;
                const nextPlayStyle = getDefaultPlayStyle(nextPosition);
                setProfile((p) => {
                  const nextProfile = { ...p, favorite_position: nextPosition };
                  saveLocalProfileCache(nextProfile, nextPlayStyle);
                  return nextProfile;
                });
                setPlayStyle(nextPlayStyle);
              }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            >
              <option value="pg">PG</option>
              <option value="sg">SG</option>
              <option value="sf">SF</option>
              <option value="pf">PF</option>
              <option value="c">C</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">Spieltyp</label>
            <select
              value={playStyle}
              onChange={(e) => {
                const nextStyle = e.target.value;
                setPlayStyle(nextStyle);
                saveLocalProfileCache(profile, nextStyle);
              }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            >
              {(PLAY_STYLE_BY_POSITION[profile.favorite_position ?? "sg"] ?? []).map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Größe (cm)</label>
              <input
                type="number"
                value={profile.height_cm ?? ""}
                onChange={(e) =>
                  setProfile((p) => {
                    const nextProfile = {
                      ...p,
                      height_cm: e.target.value ? Number(e.target.value) : null,
                    };
                    saveLocalProfileCache(nextProfile, playStyle);
                    return nextProfile;
                  })
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
                  setProfile((p) => {
                    const nextProfile = {
                      ...p,
                      weight_kg: e.target.value ? Number(e.target.value) : null,
                    };
                    saveLocalProfileCache(nextProfile, playStyle);
                    return nextProfile;
                  })
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