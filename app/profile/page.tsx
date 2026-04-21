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
import { getWorkoutSessions } from "@/lib/session-storage";
import { toLocalDateKey } from "@/lib/workout";
import {
  getCompletedWorkoutDateSet,
  readDailyPlanMap,
  readManualDayDisabledMap,
  type PlannedWorkoutTag,
  writeDailyPlanMap,
  writeManualDayDisabledMap,
} from "@/lib/activity-calendar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadExercises } from "@/lib/training-storage";
import { exerciseSubcategoriesByCategory } from "@/lib/training-data";

const PROFILE_USERNAME_KEY = "profile_username";
const PROFILE_LOCAL_CACHE_KEY = "profile_cache_v4";
const CUSTOM_SUBCATEGORY_KEY = "bt.custom-subcategories.v1";
const LAST_SEEN_LEVEL_KEY = "bt.profile.last-seen-level.v1";
const PRIMARY_DAY_TABS = ["Gym", "Basketball", "HomeWorkout", "Regeneration", "Keine Zeit"] as const;
type PrimaryDayTab = (typeof PRIMARY_DAY_TABS)[number];
type BasketballTag = string;
type GymTag = string;
type HomeTag = string;
type RecoveryTag = string;

const DAY_LABELS: Record<DayKey, string> = {
  monday: "Montag",
  tuesday: "Dienstag",
  wednesday: "Mittwoch",
  thursday: "Donnerstag",
  friday: "Freitag",
  saturday: "Samstag",
  sunday: "Sonntag",
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
  bodyMetrics?: {
    wingspan_cm: number | null;
    standing_reach_cm: number | null;
    body_fat_pct: number | null;
  };
};

function getDefaultPlayStyle(position: string | null) {
  const safePosition = position ?? "sg";
  return PLAY_STYLE_BY_POSITION[safePosition]?.[0] ?? "Shooter";
}

function getDefaultWeekConfig(): WeekConfig {
  return {
    monday: { mode: "gym", minutes: 60 },
    tuesday: { mode: "basketball_training", minutes: 45 },
    wednesday: { mode: "game_training", minutes: 45 },
    thursday: { mode: "recovery", minutes: 30 },
    friday: { mode: "basketball_training", minutes: 45 },
    saturday: { mode: "gym", minutes: 60 },
    sunday: { mode: "game_day", minutes: 20 },
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

function getMonthMatrix(reference: Date) {
  const monthStart = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const monthEnd = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
  const startOffset = (monthStart.getDay() + 6) % 7;
  const daysInMonth = monthEnd.getDate();
  const cells: Array<Date | null> = Array.from({ length: 42 }, () => null);
  for (let i = 0; i < daysInMonth; i += 1) {
    cells[startOffset + i] = new Date(reference.getFullYear(), reference.getMonth(), i + 1);
  }
  return cells;
}

function mapTagToDayConfig(tags: PlannedWorkoutTag[]): { mode: DayMode; minutes: number } {
  if (tags.includes("Spieltraining")) return { mode: "game_training", minutes: 45 };
  if (tags.includes("Spieltag")) return { mode: "game_day", minutes: 20 };
  if (tags.includes("Gym")) return { mode: "gym", minutes: 60 };
  if (tags.includes("Home-Workout")) return { mode: "custom", minutes: 30 };
  if (tags.includes("Regeneration")) return { mode: "recovery", minutes: 25 };
  if (tags.includes("Trainingstag")) return { mode: "basketball_training", minutes: 45 };
  return { mode: "unavailable", minutes: 0 };
}

function getPrimaryTabByTags(tags: PlannedWorkoutTag[]): PrimaryDayTab | null {
  if (tags.includes("Spieltag") || tags.includes("Trainingstag") || tags.includes("Spieltraining")) return "Basketball";
  if (tags.includes("Gym")) return "Gym";
  if (tags.includes("Home-Workout")) return "HomeWorkout";
  if (tags.includes("Regeneration")) return "Regeneration";
  if (tags.length === 0) return "Keine Zeit";
  return null;
}

function getGymSubtagFromTags(tags: PlannedWorkoutTag[]): GymTag | null {
  const gymSubtag = tags.find((tag) => tag.startsWith("Gym:"));
  if (!gymSubtag) return null;
  return gymSubtag.replace("Gym:", "") as GymTag;
}
function getBasketballSubtagFromTags(tags: PlannedWorkoutTag[]): BasketballTag | null {
  const basketballSubtag = tags.find((tag) => tag.startsWith("Basketball:"));
  if (!basketballSubtag) return null;
  return basketballSubtag.replace("Basketball:", "") as BasketballTag;
}

function getHomeSubtagFromTags(tags: PlannedWorkoutTag[]): HomeTag | null {
  const homeSubtag = tags.find((tag) => tag.startsWith("Home:"));
  if (!homeSubtag) return null;
  return homeSubtag.replace("Home:", "") as HomeTag;
}

function getRecoverySubtagFromTags(tags: PlannedWorkoutTag[]): RecoveryTag | null {
  const recoverySubtag = tags.find((tag) => tag.startsWith("Recovery:"));
  if (!recoverySubtag) return null;
  const value = recoverySubtag.replace("Recovery:", "");
  return value || null;
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileRow>({ username: "joshua", full_name: "Joshua Sperber", favorite_position: "pf", height_cm: 198, weight_kg: 98 });
  const [playStyle, setPlayStyle] = useState<string>("Stretch Four");
  const [weekConfig, setWeekConfig] = useState<WeekConfig>(getDefaultWeekConfig());
  const [weeklyGoalSessions] = useState<number>(4);
  const [bodyMetrics, setBodyMetrics] = useState({
    wingspan_cm: null as number | null,
    standing_reach_cm: null as number | null,
    body_fat_pct: null as number | null,
  });

  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(() => toLocalDateKey(new Date()));
  const [completedDates, setCompletedDates] = useState<Set<string>>(new Set());
  const [dailyPlanMap, setDailyPlanMap] = useState<Record<string, PlannedWorkoutTag[]>>({});
  const [customSubcategories, setCustomSubcategories] = useState(() => ({
    Basketball: [...exerciseSubcategoriesByCategory.Basketball],
    Gym: [...exerciseSubcategoriesByCategory.Gym],
    Home: [...exerciseSubcategoriesByCategory.Home],
    Regeneration: [...exerciseSubcategoriesByCategory.Regeneration],
  }));

  const basketballTags = customSubcategories.Basketball;
  const gymTags = customSubcategories.Gym;
  const homeTags = customSubcategories.Home;
  const recoveryTags = customSubcategories.Regeneration;

  const persistCurrentCache = useCallback(() => {
    saveLocalCache({ profile, playStyle, weekConfig, weeklyGoalSessions, bodyMetrics });
  }, [bodyMetrics, playStyle, profile, weekConfig, weeklyGoalSessions]);

  const loadProfile = useCallback(async (usernameOverride?: string) => {
    const localCache = loadLocalCache();
    if (localCache) {
      setProfile(localCache.profile);
      setPlayStyle(localCache.playStyle);
      setWeekConfig(localCache.weekConfig);
      setBodyMetrics(localCache.bodyMetrics ?? { wingspan_cm: null, standing_reach_cm: null, body_fat_pct: null });
    }

    const username = usernameOverride ?? localCache?.profile.username ?? (typeof window !== "undefined" ? window.localStorage.getItem(PROFILE_USERNAME_KEY) : null) ?? "joshua";

    const { data } = await supabase
      .from("profiles")
      .select("username, full_name, favorite_position, height_cm, weight_kg")
      .eq("username", username)
      .limit(1)
      .maybeSingle<ProfileRow>();

    if (data) {
      const mergedProfile: ProfileRow = {
        username: data.username ?? localCache?.profile.username ?? username,
        full_name: data.full_name ?? localCache?.profile.full_name ?? "",
        favorite_position: data.favorite_position ?? localCache?.profile.favorite_position ?? "sg",
        height_cm: data.height_cm ?? localCache?.profile.height_cm ?? null,
        weight_kg: data.weight_kg ?? localCache?.profile.weight_kg ?? null,
      };
      setProfile(mergedProfile);
      setPlayStyle(localCache?.playStyle ?? getDefaultPlayStyle(mergedProfile.favorite_position));
    }

    setCompletedDates(getCompletedWorkoutDateSet());
    setDailyPlanMap(readDailyPlanMap());
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

  useEffect(() => {
    const loadCustom = () => {
      const raw = window.localStorage.getItem(CUSTOM_SUBCATEGORY_KEY);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Partial<Record<"Basketball" | "Gym" | "Home" | "Regeneration", string[]>>;
        setCustomSubcategories({
          Basketball: [...new Set([...(parsed.Basketball ?? []), ...exerciseSubcategoriesByCategory.Basketball])],
          Gym: [...new Set([...(parsed.Gym ?? []), ...exerciseSubcategoriesByCategory.Gym])],
          Home: [...new Set([...(parsed.Home ?? []), ...exerciseSubcategoriesByCategory.Home])],
          Regeneration: [...new Set([...(parsed.Regeneration ?? []), ...exerciseSubcategoriesByCategory.Regeneration])],
        });
      } catch {
        // noop
      }
    };

    loadCustom();
    window.addEventListener("storage", loadCustom);
    return () => window.removeEventListener("storage", loadCustom);
  }, []);

  useEffect(() => {
    const rawProgression = window.localStorage.getItem("bt.progression.v1");
    if (!rawProgression) return;
    try {
      const progression = JSON.parse(rawProgression) as { level?: number };
      const currentLevel = Math.max(1, progression.level ?? 1);
      const previousSeen = Number(window.localStorage.getItem(LAST_SEEN_LEVEL_KEY) ?? "1");
      if (currentLevel > previousSeen) {
        window.alert(`🎉 Globales Level-Up! Du bist jetzt Level ${currentLevel}.`);
      }
      window.localStorage.setItem(LAST_SEEN_LEVEL_KEY, String(currentLevel));
    } catch {
      // noop
    }
  }, [completedDates]);

  useEffect(() => {
    const refresh = () => {
      setCompletedDates(getCompletedWorkoutDateSet());
      setDailyPlanMap(readDailyPlanMap());
    };
    const interval = window.setInterval(refresh, 4000);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const orderedDays = useMemo(() => getDaysStartingToday(), []);
  const planPreview = useMemo(() => buildWeeklyPlan({ position: profile.favorite_position ?? "sg", playStyle, weekConfig, weeklyGoalSessions }), [playStyle, profile.favorite_position, weekConfig, weeklyGoalSessions]);
  const monthCells = useMemo(() => getMonthMatrix(currentMonth), [currentMonth]);
  const todayKey = toLocalDateKey(new Date());
  const selectedTags = dailyPlanMap[selectedDateKey] ?? [];
  const selectedSessions = getWorkoutSessions().filter(
    (entry) => toLocalDateKey(new Date(entry.dateISO)) === selectedDateKey,
  );
  const exerciseById = useMemo(
    () => new Map(loadExercises().map((exercise) => [exercise.id, exercise])),
    [],
  );
  const exerciseNameById = useMemo(() => new Map(Array.from(exerciseById.values()).map((exercise) => [exercise.id, exercise.name])), [exerciseById]);
  const isSelectedCompleted = completedDates.has(selectedDateKey);

  const updateSelectedDatePlan = (nextTags: PlannedWorkoutTag[]) => {
    if (selectedDateKey < todayKey) return;
    setDailyPlanMap((current) => {
      const next = { ...current, [selectedDateKey]: nextTags };
      if (nextTags.length === 0) delete next[selectedDateKey];
      writeDailyPlanMap(next);
      if (nextTags.length > 0) {
        const disabledMap = readManualDayDisabledMap();
        if (disabledMap[selectedDateKey]) {
          const nextDisabledMap = { ...disabledMap };
          delete nextDisabledMap[selectedDateKey];
          writeManualDayDisabledMap(nextDisabledMap);
        }
      }

      const selectedDate = new Date(`${selectedDateKey}T00:00:00`);
      const dayIndex = selectedDate.getDay();
      const dayMap: Record<number, DayKey> = { 0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday", 5: "friday", 6: "saturday" };
      const targetDay = dayMap[dayIndex];
      const config = mapTagToDayConfig(nextTags);
      setWeekConfig((prev) => ({ ...prev, [targetDay]: config }));

      return next;
    });
  };

  const activePrimaryTab = getPrimaryTabByTags(selectedTags);
  const activeBasketballSubtag = getBasketballSubtagFromTags(selectedTags);
  const activeGymSubtag = getGymSubtagFromTags(selectedTags);
  const activeHomeSubtag = getHomeSubtagFromTags(selectedTags);
  const activeRecoverySubtag = getRecoverySubtagFromTags(selectedTags);

  const applyPrimaryTab = (tab: PrimaryDayTab) => {
    if (tab === "Basketball") {
      updateSelectedDatePlan(["Trainingstag"]);
      updateSelectedDatePlan(["Trainingstag", `Basketball:${basketballTags[0]}` as PlannedWorkoutTag]);
      return;
    }
    if (tab === "Gym") {
      updateSelectedDatePlan(["Gym", `Gym:${gymTags[0]}` as PlannedWorkoutTag]);
      return;
    }
    if (tab === "HomeWorkout") {
      updateSelectedDatePlan(["Home-Workout", `Home:${homeTags[0]}` as PlannedWorkoutTag]);
      return;
    }
    if (tab === "Regeneration") {
      updateSelectedDatePlan(["Regeneration", `Recovery:${recoveryTags[0]}` as PlannedWorkoutTag]);
      return;
    }
    updateSelectedDatePlan([]);
  };

  const applyBasketballSubtag = (tag: BasketballTag) => {
    updateSelectedDatePlan(["Trainingstag", `Basketball:${tag}` as PlannedWorkoutTag]);
  };

  const applyGymSubtag = (tag: GymTag) => {
    updateSelectedDatePlan(["Gym", `Gym:${tag}` as PlannedWorkoutTag]);
  };

  const applyHomeSubtag = (tag: HomeTag) => {
    updateSelectedDatePlan(["Home-Workout", `Home:${tag}` as PlannedWorkoutTag]);
  };

  const applyRecoverySubtag = (tag: RecoveryTag) => {
    updateSelectedDatePlan(["Regeneration", `Recovery:${tag}` as PlannedWorkoutTag]);
  };
const refreshProfileAndWeekly = () => {
    const latestDailyPlan = readDailyPlanMap();
    setDailyPlanMap(latestDailyPlan);
    setCompletedDates(getCompletedWorkoutDateSet());
    const nextWeekConfig = { ...weekConfig };
    Object.keys(latestDailyPlan).forEach((dateKey) => {
      const tags = latestDailyPlan[dateKey] ?? [];
      const date = new Date(`${dateKey}T00:00:00`);
      const dayMap: Record<number, DayKey> = { 0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday", 5: "friday", 6: "saturday" };
      const dayKey = dayMap[date.getDay()];
      nextWeekConfig[dayKey] = mapTagToDayConfig(tags);
    });
    setWeekConfig(nextWeekConfig);
    setMessage("Profil & Weekly Plan wurden aktualisiert.");
  };
  const persistProfileToSupabase = useCallback(async () => {
    const username = (profile.username ?? "").trim().toLowerCase();
    if (!username) {
      setMessage("Bitte einen Username eingeben.");
      return;
    }

    const authApi = (supabase as unknown as { auth?: { getUser?: () => Promise<{ data?: { user?: unknown } }> } }).auth;
    if (authApi?.getUser) {
      const { data: authData } = await authApi.getUser();
      if (!authData?.user) {
        window.localStorage.setItem(PROFILE_USERNAME_KEY, username);
        saveLocalCache({ profile: { ...profile, username }, playStyle, weekConfig, weeklyGoalSessions, bodyMetrics });
        setMessage("Nur lokal gespeichert (kein Supabase-Login).");
        return;
      }
    }

    const { error } = await supabase.from("profiles").upsert({
      username,
      full_name: profile.full_name,
      favorite_position: profile.favorite_position,
      height_cm: profile.height_cm,
      weight_kg: profile.weight_kg,
    });
    if (error) {
      const isRlsError = error.message.toLowerCase().includes("row-level security") || error.message.toLowerCase().includes("rls");
      if (isRlsError) {
        window.localStorage.setItem(PROFILE_USERNAME_KEY, username);
        saveLocalCache({ profile: { ...profile, username }, playStyle, weekConfig, weeklyGoalSessions, bodyMetrics });
        setMessage("Supabase-RLS aktiv: Profil lokal gespeichert.");
        return;
      }
      setMessage(`Speichern fehlgeschlagen: ${error.message}`);
      return;
    }

    window.localStorage.setItem(PROFILE_USERNAME_KEY, username);
    saveLocalCache({ profile: { ...profile, username }, playStyle, weekConfig, weeklyGoalSessions, bodyMetrics });
    setMessage(null);
  }, [bodyMetrics, playStyle, profile, weekConfig, weeklyGoalSessions]);

  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => {
      void persistProfileToSupabase();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [loading, persistProfileToSupabase]);

  return (
    <main className="min-h-screen bg-zinc-950 p-6 pb-24 text-white">
      <div className="mx-auto max-w-5xl space-y-4">
        <h1 className="text-2xl font-bold">Profil & Wochenplanung</h1>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={profile.username ?? ""} onChange={(e) => setProfile((p) => ({ ...p, username: e.target.value }))} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" placeholder="Username" />
            <input value={profile.full_name ?? ""} onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" placeholder="Vollständiger Name" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <select value={profile.favorite_position ?? "sg"} onChange={(e) => { const next = e.target.value; setProfile((p) => ({ ...p, favorite_position: next })); setPlayStyle(getDefaultPlayStyle(next)); }} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
              <option value="pg">PG</option><option value="sg">SG</option><option value="sf">SF</option><option value="pf">PF</option><option value="c">C</option>
            </select>
            <select value={playStyle} onChange={(e) => setPlayStyle(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
              {(PLAY_STYLE_BY_POSITION[profile.favorite_position ?? "sg"] ?? []).map((style) => (<option key={style} value={style}>{style}</option>))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input
              type="number"
              placeholder="Größe (cm)"
              value={profile.height_cm ?? ""}
              onChange={(e) => setProfile((p) => ({ ...p, height_cm: e.target.value ? Number(e.target.value) : null }))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
            <input
              type="number"
              placeholder="Gewicht (kg)"
              value={profile.weight_kg ?? ""}
              onChange={(e) => setProfile((p) => ({ ...p, weight_kg: e.target.value ? Number(e.target.value) : null }))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
            <input
              type="number"
              placeholder="Spannweite (cm)"
              value={bodyMetrics.wingspan_cm ?? ""}
              onChange={(e) => setBodyMetrics((prev) => ({ ...prev, wingspan_cm: e.target.value ? Number(e.target.value) : null }))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
            <input
              type="number"
              placeholder="Standing Reach (cm)"
              value={bodyMetrics.standing_reach_cm ?? ""}
              onChange={(e) => setBodyMetrics((prev) => ({ ...prev, standing_reach_cm: e.target.value ? Number(e.target.value) : null }))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
            <input
              type="number"
              placeholder="KFA (%)"
              value={bodyMetrics.body_fat_pct ?? ""}
              onChange={(e) => setBodyMetrics((prev) => ({ ...prev, body_fat_pct: e.target.value ? Number(e.target.value) : null }))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
          </div>

          <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Workout Activity</h2>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="rounded border border-zinc-600 px-2 py-1">◀</button>
                <span className="px-2 py-1">{currentMonth.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</span>
                <button type="button" onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="rounded border border-zinc-600 px-2 py-1">▶</button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-2 text-center text-xs text-zinc-500">
              {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((label) => <p key={label}>{label}</p>)}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-2">
              {monthCells.map((cell, index) => {
                if (!cell) return <div key={`empty-${index}`} className="h-12 rounded-lg bg-zinc-900/50" />;
                const key = toLocalDateKey(cell);
                const isToday = key === todayKey;
                const isSelected = key === selectedDateKey;
                const trained = completedDates.has(key);
                const hasPlannedTags = (dailyPlanMap[key] ?? []).length > 0;
                const base = key > todayKey ? "bg-white text-black" : trained ? "bg-emerald-500/30 text-emerald-100" : "bg-zinc-700/40 text-zinc-200";
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDateKey(key)}
                    className={`relative h-12 rounded-lg border ${isSelected ? "border-fuchsia-400 ring-2 ring-fuchsia-500/60" : isToday ? "border-cyan-400" : "border-zinc-700"} ${base}`}
                  >
                    <span className="text-sm font-semibold">{cell.getDate()}</span>
                    {trained ? <span className="block text-[10px]">✓</span> : null}
                    {hasPlannedTags ? (
                      <span className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-fuchsia-400" />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900 p-3">
              <p className="text-sm font-semibold">{selectedDateKey}</p>
              {selectedDateKey < todayKey || (selectedDateKey === todayKey && isSelectedCompleted) ? (
                <div className="mt-2 space-y-2 text-sm">
                  {selectedSessions.length === 0 ? <p className="text-zinc-500">Kein Training an diesem Tag.</p> : selectedSessions.map((session) => (
                    <div key={session.id} className="rounded border border-zinc-700 bg-zinc-950 p-2">
                      <p className="font-medium">{session.workoutName}</p>
                      <p className="text-xs text-zinc-400">Exercises: {session.logs.length} • Dauer ca. {session.logs.length * 4} Min</p>
                      <div className="mt-2 space-y-1 text-xs text-zinc-300">
                        {session.logs.map((log, idx) => (
                          <div key={`${session.id}-${idx}`} className="rounded border border-zinc-800 bg-zinc-900 p-2">
                            <p className="font-medium">{exerciseNameById.get(log.exerciseId) ?? log.exerciseId}</p>
                            <p className="text-zinc-400">Kategorie: {exerciseById.get(log.exerciseId)?.category ?? "-"}</p>
                            <p className="text-zinc-400">Unterkategorie: {exerciseById.get(log.exerciseId)?.subcategory ?? "-"}</p>
                            {log.made != null || log.misses != null || log.attempts != null ? (
                              <p>Makes: {log.made ?? "-"} • Misses: {log.misses ?? "-"} • Tries: {log.attempts ?? "-"}</p>
                            ) : null}
                            {log.completedValue != null ? (
                              <p>Reps/Wert: {log.completedValue}</p>
                            ) : null}
                            {log.weightKg != null && log.weightKg > 0 ? (
                              <p>Gewicht: {log.weightKg} kg</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-xs text-zinc-400">Plane heute/zukünftige Tage:</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PRIMARY_DAY_TABS.map((tab) => (
                      <button key={tab} type="button" onClick={() => applyPrimaryTab(tab)} className={`rounded-full border px-3 py-1 text-xs ${activePrimaryTab === tab ? "border-cyan-400 bg-cyan-500/20 text-cyan-100" : "border-zinc-600 text-zinc-300"}`}>
                        {tab}
                      </button>
                    ))}
                  </div>
                  {activePrimaryTab === "Basketball" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {basketballTags.map((tag) => (
                        <button key={tag} type="button" onClick={() => applyBasketballSubtag(tag)} className={`rounded-full border px-3 py-1 text-xs ${activeBasketballSubtag === tag ? "border-emerald-400 bg-emerald-500/20 text-emerald-100" : "border-zinc-600 text-zinc-300"}`}>
                          {tag}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {activePrimaryTab === "Gym" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {gymTags.map((tag) => (
                        <button key={tag} type="button" onClick={() => applyGymSubtag(tag)} className={`rounded-full border px-3 py-1 text-xs ${activeGymSubtag === tag ? "border-amber-400 bg-amber-500/20 text-amber-100" : "border-zinc-600 text-zinc-300"}`}>
                          {tag}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {activePrimaryTab === "HomeWorkout" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {homeTags.map((tag) => (
                        <button key={tag} type="button" onClick={() => applyHomeSubtag(tag)} className={`rounded-full border px-3 py-1 text-xs ${activeHomeSubtag === tag ? "border-amber-400 bg-amber-500/20 text-amber-100" : "border-zinc-600 text-zinc-300"}`}>
                          {tag}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {activePrimaryTab === "Regeneration" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {recoveryTags.map((tag) => (
                        <button key={tag} type="button" onClick={() => applyRecoverySubtag(tag)} className={`rounded-full border px-3 py-1 text-xs ${activeRecoverySubtag === tag ? "border-emerald-400 bg-emerald-500/20 text-emerald-100" : "border-zinc-600 text-zinc-300"}`}>
                          {tag}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        </div>
        <button
              type="button"
              onClick={refreshProfileAndWeekly}
              className="mt-3 w-full rounded-lg border border-cyan-500 bg-cyan-950/30 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-900/40"
            >
              Profil aktualisieren
            </button>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-lg font-semibold">Weekly-Plan (aus deiner Konfiguration)</h2>
          <ul className="mt-2 space-y-1 text-sm text-zinc-300">
            {orderedDays.map((day) => {
              const entry = planPreview.find((planEntry) => planEntry.day === day);
              if (!entry) return null;
              return (
                <li key={entry.day}>
                  <span className="font-semibold">{DAY_LABELS[entry.day]} ({getNextDateForDay(entry.day).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })})</span>
                  : {entry.sessionType} • {entry.intensity} • {entry.minutes} Min
                </li>
              );
            })}
          </ul>
        </section>

        {message ? <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-200">{message}</div> : null}
      </div>
    </main>
  );
}