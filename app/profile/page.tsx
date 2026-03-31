"use client";

import { supabase } from "@/lib/supabase";
import {
  buildWeeklyPlan,
  getDaysStartingToday,
  getNextDateForDay,
  type DayKey,
  type DayMode,
  type WeekConfig,
} from "@/lib/planner";
import { useCallback, useEffect, useMemo, useState } from "react";

const PROFILE_USERNAME_KEY = "profile_username";
const PROFILE_LOCAL_CACHE_KEY = "profile_cache_v4";

const DAY_LABELS: Record<DayKey, string> = {
  monday: "Montag",
  tuesday: "Dienstag",
  wednesday: "Mittwoch",
  thursday: "Donnerstag",
  friday: "Freitag",
  saturday: "Samstag",
  sunday: "Sonntag",
};

function formatDateLabel(date: Date) {
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
  });
}

const DAY_MODE_LABELS: Record<DayMode, string> = {
  unavailable: "Keine Zeit",
  rest: "Ruhetag",
  recovery: "Regeneration",
  game_day: "Spieltag",
  game_training: "Spieltraining",
  basketball_training: "Basketballtraining",
  gym: "Gym",
  custom: "Custom",
};

const PLAY_STYLE_BY_POSITION: Record<string, string[]> = {
  pg: ["Passer", "Floor General", "Pick-and-Roll Creator", "Tempo Controller"],
  sg: ["Shooter", "Slasher", "3&D", "Off-Ball Mover"],
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

type ProfileLocalCache = {
  profile: ProfileRow;
  playStyle: string;
  weekConfig: WeekConfig;
  weeklyGoalSessions: number;
};

function getDefaultPlayStyle(position: string | null) {
  const safePosition = position ?? "sg";
  return PLAY_STYLE_BY_POSITION[safePosition]?.[0] ?? "Shooter";
}

function getDefaultWeekConfig(): WeekConfig {
  return {
    monday: { mode: "gym", minutes: 60 },
    tuesday: { mode: "basketball_training", minutes: 45 },
    wednesday: { mode: "game_training", minutes: 30 },
    thursday: { mode: "recovery", minutes: 30 },
    friday: { mode: "basketball_training", minutes: 45 },
    saturday: { mode: "gym", minutes: 60 },
    sunday: { mode: "game_training", minutes: 30 },
  };
}

function loadLocalCache() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PROFILE_LOCAL_CACHE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ProfileLocalCache;
  } catch {
    return null;
  }
}

function saveLocalCache(payload: ProfileLocalCache) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROFILE_LOCAL_CACHE_KEY, JSON.stringify(payload));
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileRow>({
    username: "joshua",
    full_name: "Joshua Sperber",
    favorite_position: "pf",
    height_cm: 198,
    weight_kg: 98,
  });
  const [playStyle, setPlayStyle] = useState<string>("Stretch Four");
  const [weekConfig, setWeekConfig] = useState<WeekConfig>(getDefaultWeekConfig());
  const [weeklyGoalSessions, setWeeklyGoalSessions] = useState<number>(4);

  const persistCurrentCache = useCallback(() => {
    saveLocalCache({ profile, playStyle, weekConfig, weeklyGoalSessions });
  }, [playStyle, profile, weekConfig, weeklyGoalSessions]);

  const loadProfile = useCallback(async (usernameOverride?: string) => {
    const localCache = loadLocalCache();

    if (localCache) {
      setProfile(localCache.profile);
      setPlayStyle(localCache.playStyle);
      setWeekConfig(localCache.weekConfig);
      setWeeklyGoalSessions(localCache.weeklyGoalSessions);
    }

    const username =
      usernameOverride ??
      localCache?.profile.username ??
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
      const mergedProfile: ProfileRow = {
        username: data.username ?? localCache?.profile.username ?? username,
        full_name: data.full_name ?? localCache?.profile.full_name ?? "",
        favorite_position: data.favorite_position ?? localCache?.profile.favorite_position ?? "sg",
        height_cm: data.height_cm ?? localCache?.profile.height_cm ?? null,
        weight_kg: data.weight_kg ?? localCache?.profile.weight_kg ?? null,
      };

      setProfile(mergedProfile);
      setPlayStyle(localCache?.playStyle ?? getDefaultPlayStyle(mergedProfile.favorite_position));

      if (localCache) {
        saveLocalCache({
          ...localCache,
          profile: mergedProfile,
        });
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfile();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProfile]);

  useEffect(() => {
    if (loading) return;
    persistCurrentCache();
  }, [loading, persistCurrentCache]);

  const planPreview = useMemo(() => {
    return buildWeeklyPlan({
      position: profile.favorite_position ?? "sg",
      playStyle,
      weekConfig,
      weeklyGoalSessions,
    });
  }, [playStyle, profile.favorite_position, weekConfig, weeklyGoalSessions]);
  const orderedDays = useMemo(() => getDaysStartingToday(), []);

  const updateDayConfig = (day: DayKey, patch: Partial<WeekConfig[DayKey]>) => {
    setWeekConfig((current) => ({
      ...current,
      [day]: {
        ...current[day],
        ...patch,
      },
    }));
  };

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

    saveLocalCache({
      profile: { ...profile, username },
      playStyle,
      weekConfig,
      weeklyGoalSessions,
    });

    await loadProfile(username);
    setSaving(false);
    setMessage("Profil gespeichert ✅");
  };

  return (
    <main className="min-h-screen bg-zinc-950 p-6 pb-24 text-white">
      <div className="mx-auto max-w-4xl space-y-4">
        <h1 className="text-2xl font-bold">Profil & Wochenplanung</h1>
        <p className="text-zinc-400">Wähle pro Tag die Trainingsart (Kalender-Ansicht) und beeinflusse damit den Weekly-Plan.</p>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Username</label>
              <input
                value={profile.username ?? ""}
                onChange={(e) => setProfile((p) => ({ ...p, username: e.target.value }))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
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
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Position</label>
              <select
                value={profile.favorite_position ?? "sg"}
                onChange={(e) => {
                  const nextPosition = e.target.value;
                  setProfile((p) => ({ ...p, favorite_position: nextPosition }));
                  setPlayStyle(getDefaultPlayStyle(nextPosition));
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
                onChange={(e) => setPlayStyle(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              >
                {(PLAY_STYLE_BY_POSITION[profile.favorite_position ?? "sg"] ?? []).map((style) => (
                  <option key={style} value={style}>
                    {style}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
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

          <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
            <h2 className="text-sm font-semibold">Kalender: Trainingsart pro Tag</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {orderedDays.map((day) => (
                <article key={day} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <p className="text-sm font-semibold">
                    {DAY_LABELS[day]} ({formatDateLabel(getNextDateForDay(day))})
                  </p>

                  <label className="mt-2 block text-xs text-zinc-400">Trainingsart</label>
                  <select
                    value={weekConfig[day].mode}
                    onChange={(e) => updateDayConfig(day, { mode: e.target.value as DayMode })}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm"
                  >
                    {(Object.keys(DAY_MODE_LABELS) as DayMode[]).map((mode) => (
                      <option key={mode} value={mode}>
                        {DAY_MODE_LABELS[mode]}
                      </option>
                    ))}
                  </select>

                  <label className="mt-2 block text-xs text-zinc-400">Minuten</label>
                  <input
                    type="number"
                    min={0}
                    max={180}
                    value={weekConfig[day].minutes}
                    onChange={(e) => updateDayConfig(day, { minutes: Number(e.target.value) || 0 })}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm"
                  />
                </article>
              ))}
            </div>
          </section>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">Wochenziel (Sessions)</label>
            <input
              type="number"
              min={1}
              max={14}
              value={weeklyGoalSessions}
              onChange={(e) => setWeeklyGoalSessions(Number(e.target.value) || 1)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
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

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-lg font-semibold">Weekly-Plan (aus deiner Konfiguration)</h2>
          <ul className="mt-2 space-y-1 text-sm text-zinc-300">
            {orderedDays.map((day) => {
              const entry = planPreview.find((planEntry) => planEntry.day === day);
              if (!entry) return null;
              return (
              <li key={entry.day}>
                <span className="font-semibold">
                  {DAY_LABELS[entry.day]} ({formatDateLabel(getNextDateForDay(entry.day))})
                </span>
                : {entry.sessionType} • {entry.intensity} • {entry.minutes} Min
                {entry.reason ? ` (${entry.reason})` : ""}
              </li>
              );
            })}
          </ul>
        </section>

        {message ? (
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-200">{message}</div>
        ) : null}
      </div>
    </main>
  );
}