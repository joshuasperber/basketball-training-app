"use client";

import { supabase } from "@/lib/supabase";
import {
  buildWeeklyPlan,
  getDaysStartingToday,
  getDefaultWeekConfig,
  getNextDateForDay,
  type DayKey,
  type DayMode,
  type WeekConfig,
} from "@/lib/planner";
import { getWorkoutSessions } from "@/lib/session-storage";
import { WORKOUT_OVERRIDE_PREFIX, toLocalDateKey } from "@/lib/workout";
import {
  applyWeekConfigToCalendar,
  getCompletedWorkoutDateSet,
  HIDDEN_AUTO_WORKOUTS_KEY,
  markDateAsManualOverride,
  readDailyPlanMap,
  readManualDayDisabledMap,
  readManualPlanOverrides,
  type PlannedWorkoutTag,
  writeDailyPlanMap,
  writeManualDayDisabledMap,
  writeManualPlanOverrides,
} from "@/lib/activity-calendar";
import { clearPlayerIntake } from "@/lib/coach-intake";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadExercises } from "@/lib/training-storage";
import { exerciseSubcategoriesByCategory } from "@/lib/training-data";
import { pullProgressFromCloud, pushProgressToCloud } from "@/lib/progress-sync";
import PageHeader from "@/components/PageHeader";
import WorkoutReminderSettings from "@/components/WorkoutReminderSettings";

const PROFILE_USERNAME_KEY = "profile_username";
const PROFILE_LOCAL_CACHE_KEY = "profile_cache_v4";
const PROFILE_WEEK_CONFIG_KEY = "bt.profile-week-config.v1";
const LAST_LOGIN_EMAIL_KEY = "bt.last-login-email.v1";
const CUSTOM_SUBCATEGORY_KEY = "bt.custom-subcategories.v1";
const LAST_SEEN_LEVEL_KEY = "bt.profile.last-seen-level.v1";
const PRIMARY_DAY_TABS = ["Gym", "Basketball", "HomeWorkout", "Regeneration", "Keine Zeit"] as const;
type PrimaryDayTab = (typeof PRIMARY_DAY_TABS)[number];
type BasketballTag = string;
type BasketballSessionMode = "Training" | "Spieltraining" | "Spieltag";
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
  email: string | null;
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
  /** yyyy-mm-dd Tage, die nicht per weekConfig überschrieben werden sollen. */
  manualPlanOverrides?: string[];
};

type SupabaseAuthUser = {
  id?: string;
  email?: string | null;
};

function getDefaultPlayStyle(position: string | null) {
  const safePosition = position ?? "sg";
  return PLAY_STYLE_BY_POSITION[safePosition]?.[0] ?? "Shooter";
}

const DAY_KEYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_INDEX_TO_KEY: Record<number, DayKey> = { 0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday", 5: "friday", 6: "saturday" };
const VALID_DAY_MODES = new Set<DayMode>([
  "unavailable",
  "rest",
  "recovery",
  "game_day",
  "game_training",
  "basketball_training",
  "gym",
  "custom",
]);

function isWeekConfig(value: unknown): value is WeekConfig {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<Record<DayKey, { mode?: unknown; minutes?: unknown }>>;
  return DAY_KEYS.every((day) => {
    const config = record[day];
    return Boolean(
      config &&
        typeof config.mode === "string" &&
        VALID_DAY_MODES.has(config.mode as DayMode) &&
        typeof config.minutes === "number" &&
        Number.isFinite(config.minutes),
    );
  });
}

function loadPersistedWeekConfig(): WeekConfig | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PROFILE_WEEK_CONFIG_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isWeekConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function savePersistedWeekConfig(config: WeekConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROFILE_WEEK_CONFIG_KEY, JSON.stringify(config));
}

function deriveWeekConfigFromDailyPlan(dailyPlan: Record<string, PlannedWorkoutTag[]>): WeekConfig | null {
  const entries = Object.entries(dailyPlan);
  if (entries.length === 0) return null;
  const next = DAY_KEYS.reduce((acc, day) => {
    acc[day] = { mode: "unavailable", minutes: 0 };
    return acc;
  }, {} as WeekConfig);

  entries
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([dateKey, tags]) => {
      const date = new Date(`${dateKey}T12:00:00`);
      const dayKey = DAY_INDEX_TO_KEY[date.getDay()];
      next[dayKey] = mapTagToDayConfig(tags);
    });

  return next;
}

function weekConfigMatchesDailyPlan(config: WeekConfig, dailyPlan: Record<string, PlannedWorkoutTag[]>) {
  const entries = Object.entries(dailyPlan);
  if (entries.length === 0) return true;
  return entries.every(([dateKey, tags]) => {
    const date = new Date(`${dateKey}T12:00:00`);
    const dayKey = DAY_INDEX_TO_KEY[date.getDay()];
    return config[dayKey]?.mode === mapTagToDayConfig(tags).mode;
  });
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
  const overrides = Array.from(readManualPlanOverrides());
  savePersistedWeekConfig(payload.weekConfig);
  window.localStorage.setItem(PROFILE_LOCAL_CACHE_KEY, JSON.stringify({ ...payload, manualPlanOverrides: overrides }));
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
  if (tags.includes("Spieltraining")) return { mode: "game_training", minutes: 30 };
  if (tags.includes("Spieltag")) return { mode: "game_day", minutes: 60 };
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

function getBasketballSessionModeFromTags(tags: PlannedWorkoutTag[]): BasketballSessionMode {
  if (tags.includes("Spieltag")) return "Spieltag";
  if (tags.includes("Spieltraining")) return "Spieltraining";
  return "Training";
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
  const [savedToastVisible, setSavedToastVisible] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);

  const [profile, setProfile] = useState<ProfileRow>({ username: "", full_name: "", favorite_position: "sg", height_cm: null, weight_kg: null, email: null });
  const [playStyle, setPlayStyle] = useState<string>("Shooter");
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
    Basketball: [...new Set(["Warm-Up", ...exerciseSubcategoriesByCategory.Basketball])],
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

  /**
   * Wendet eine geänderte WeekConfig sofort an: localStorage-Persistenz,
   * Kalender-Befüllung (unter Berücksichtigung manueller Overrides) und
   * Cloud-Sync. Wird aus dem Verfügbarkeits-Editor gerufen.
   */
  const updateWeekConfigAndCalendar = useCallback(
    (updater: (prev: WeekConfig) => WeekConfig) => {
      setWeekConfig((prev) => {
        const next = updater(prev);
        saveLocalCache({ profile, playStyle, weekConfig: next, weeklyGoalSessions, bodyMetrics });
        const updatedDailyPlan = applyWeekConfigToCalendar(next, 28);
        setDailyPlanMap(updatedDailyPlan);
        void pushProgressToCloud();
        return next;
      });
    },
    [bodyMetrics, playStyle, profile, weeklyGoalSessions],
  );

  const loadProfile = useCallback(async (usernameOverride?: string) => {
    await pullProgressFromCloud();
    const localCache = loadLocalCache();
    const latestDailyPlan = readDailyPlanMap();
    const storedWeekConfig = loadPersistedWeekConfig();
    const dailyPlanWeekConfig = deriveWeekConfigFromDailyPlan(latestDailyPlan);
    const cachedWeekConfig =
      localCache?.weekConfig && weekConfigMatchesDailyPlan(localCache.weekConfig, latestDailyPlan)
        ? localCache.weekConfig
        : null;
    const resolvedWeekConfig =
      storedWeekConfig ??
      cachedWeekConfig ??
      dailyPlanWeekConfig ??
      localCache?.weekConfig ??
      getDefaultWeekConfig();

    if (localCache) {
      setProfile(localCache.profile);
      setPlayStyle(localCache.playStyle);
      setWeekConfig(resolvedWeekConfig);
      setBodyMetrics(localCache.bodyMetrics ?? { wingspan_cm: null, standing_reach_cm: null, body_fat_pct: null });
      if (localCache.manualPlanOverrides?.length) {
        writeManualPlanOverrides(new Set(localCache.manualPlanOverrides));
      }
    } else {
      setWeekConfig(resolvedWeekConfig);
    }

    const authApi = (supabase as unknown as { auth?: { getUser?: () => Promise<{ data?: { user?: SupabaseAuthUser | null } }> } }).auth;
    const authData = authApi?.getUser ? await authApi.getUser() : null;
    const authUserId = authData?.data?.user?.id ?? null;
    const cachedLoginEmail = typeof window !== "undefined" ? window.localStorage.getItem(LAST_LOGIN_EMAIL_KEY) : null;
    const authEmail = authData?.data?.user?.email ?? cachedLoginEmail ?? null;
    const username = usernameOverride ?? localCache?.profile.username ?? (typeof window !== "undefined" ? window.localStorage.getItem(PROFILE_USERNAME_KEY) : null) ?? "";

    let data: ProfileRow | null = null;
    if (authUserId) {
      const byId = await supabase
        .from("profiles")
        .select("username, full_name, favorite_position, height_cm, weight_kg")
        .eq("id", authUserId)
        .limit(1)
        .maybeSingle<ProfileRow>();
      data = byId.data ?? null;
      if (!data && username) {
        const byUsername = await supabase
          .from("profiles")
          .select("username, full_name, favorite_position, height_cm, weight_kg")
          .eq("username", username)
          .limit(1)
          .maybeSingle<ProfileRow>();
        data = byUsername.data ?? null;
      }
    } else if (username) {
      const byUsername = await supabase
        .from("profiles")
        .select("username, full_name, favorite_position, height_cm, weight_kg")
        .eq("username", username)
        .limit(1)
        .maybeSingle<ProfileRow>();
      data = byUsername.data ?? null;
    }

    if (data) {
      const mergedProfile: ProfileRow = {
        username: localCache?.profile.username ?? data.username ?? username,
        full_name: localCache?.profile.full_name ?? data.full_name ?? "",
        favorite_position: localCache?.profile.favorite_position ?? data.favorite_position ?? "sg",
        height_cm: localCache?.profile.height_cm ?? data.height_cm ?? null,
        weight_kg: localCache?.profile.weight_kg ?? data.weight_kg ?? null,
        email: authEmail ?? localCache?.profile.email ?? null,
      };
      setProfile(mergedProfile);
      setPlayStyle(localCache?.playStyle ?? getDefaultPlayStyle(mergedProfile.favorite_position));
    } else {
      setProfile((current: ProfileRow) => ({ ...current, email: authEmail ?? localCache?.profile.email ?? null }));
    }

    if (typeof window !== "undefined" && authEmail) {
      window.localStorage.setItem(LAST_LOGIN_EMAIL_KEY, authEmail);
    }

    setCompletedDates(getCompletedWorkoutDateSet());
    setDailyPlanMap(latestDailyPlan);
    savePersistedWeekConfig(resolvedWeekConfig);
    void pushProgressToCloud();
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
    void pushProgressToCloud();
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
    markDateAsManualOverride(selectedDateKey);
    try {
      const rawHidden = window.localStorage.getItem(HIDDEN_AUTO_WORKOUTS_KEY);
      const hidden = rawHidden ? (JSON.parse(rawHidden) as Record<string, string[]>) : {};
      if (hidden[selectedDateKey]) {
        const nextHidden = { ...hidden };
        delete nextHidden[selectedDateKey];
        window.localStorage.setItem(HIDDEN_AUTO_WORKOUTS_KEY, JSON.stringify(nextHidden));
      }
      window.localStorage.removeItem(`${WORKOUT_OVERRIDE_PREFIX}${selectedDateKey}`);
    } catch {
      // Keep calendar edits working even if old local data is malformed.
    }
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
      void pushProgressToCloud();

      const selectedDate = new Date(`${selectedDateKey}T00:00:00`);
      const dayIndex = selectedDate.getDay();
      const dayMap: Record<number, DayKey> = { 0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday", 5: "friday", 6: "saturday" };
      const targetDay = dayMap[dayIndex];
      const config = mapTagToDayConfig(nextTags);
      const nextWeekConfig = { ...weekConfig, [targetDay]: config };
      setWeekConfig(nextWeekConfig);
      savePersistedWeekConfig(nextWeekConfig);
      saveLocalCache({ profile, playStyle, weekConfig: nextWeekConfig, weeklyGoalSessions, bodyMetrics });
      window.dispatchEvent(new Event("bt:plan-updated"));

      return next;
    });
  };

  const activePrimaryTab = getPrimaryTabByTags(selectedTags);
  const activeBasketballSubtag = getBasketballSubtagFromTags(selectedTags);
  const activeBasketballSessionMode = getBasketballSessionModeFromTags(selectedTags);
  const activeGymSubtag = getGymSubtagFromTags(selectedTags);
  const activeHomeSubtag = getHomeSubtagFromTags(selectedTags);
  const activeRecoverySubtag = getRecoverySubtagFromTags(selectedTags);

  const applyPrimaryTab = (tab: PrimaryDayTab) => {
    if (tab === "Basketball") {
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
    const modeTag: PlannedWorkoutTag =
      activeBasketballSessionMode === "Spieltag"
        ? "Spieltag"
        : activeBasketballSessionMode === "Spieltraining"
          ? "Spieltraining"
          : "Trainingstag";
    updateSelectedDatePlan([modeTag, `Basketball:${tag}` as PlannedWorkoutTag]);
  };

  const applyBasketballSessionMode = (mode: BasketballSessionMode) => {
    if (mode === "Spieltag") {
      updateSelectedDatePlan(["Spieltag", "Basketball:Warm-Up" as PlannedWorkoutTag]);
      return;
    }
    if (mode === "Spieltraining") {
      updateSelectedDatePlan(["Spieltraining", "Basketball:Warm-Up" as PlannedWorkoutTag]);
      return;
    }
    updateSelectedDatePlan(["Trainingstag", `Basketball:${activeBasketballSubtag ?? basketballTags[0]}` as PlannedWorkoutTag]);
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
    const fullName = (profile.full_name ?? "").trim();
    if (!fullName) {
      setMessage("Bitte einen vollständigen Namen eingeben.");
      return;
    }

    const authApi = (supabase as unknown as { auth?: { getUser?: () => Promise<{ data?: { user?: SupabaseAuthUser | null } }> } }).auth;
    let authUser: SupabaseAuthUser | null = null;
    if (authApi?.getUser) {
      const { data: authData } = await authApi.getUser();
      authUser = authData?.user ?? null;
      if (!authData?.user) {
        window.localStorage.setItem(PROFILE_USERNAME_KEY, username);
        saveLocalCache({ profile: { ...profile, username, full_name: fullName, email: profile.email ?? null }, playStyle, weekConfig, weeklyGoalSessions, bodyMetrics });
        void pushProgressToCloud();
        setMessage("Nur lokal gespeichert (kein Supabase-Login).");
        return;
      }
      const loginEmail = authData.user?.email ?? profile.email ?? null;
      if (typeof window !== "undefined" && loginEmail) {
        window.localStorage.setItem(LAST_LOGIN_EMAIL_KEY, loginEmail);
      }
      setProfile((current: ProfileRow) => ({ ...current, email: loginEmail }));
    }

    const payload = {
      id: authUser?.id,
      username,
      full_name: fullName,
      favorite_position: profile.favorite_position,
      height_cm: profile.height_cm,
      weight_kg: profile.weight_kg,
    };

    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) {
      const isRlsError = error.message.toLowerCase().includes("row-level security") || error.message.toLowerCase().includes("rls");
      const isDuplicateUsername =
        error.message.toLowerCase().includes("profiles_username_key") ||
        error.message.toLowerCase().includes("duplicate key value");
      if (isRlsError) {
        window.localStorage.setItem(PROFILE_USERNAME_KEY, username);
        saveLocalCache({ profile: { ...profile, username, full_name: fullName, email: profile.email ?? null }, playStyle, weekConfig, weeklyGoalSessions, bodyMetrics });
        void pushProgressToCloud();
        setMessage("Supabase-RLS aktiv: Profil lokal gespeichert.");
        return;
      }
      if (isDuplicateUsername) {
        setMessage("Username bereits vergeben. Bitte wähle einen anderen Username.");
        return;
      }
      setMessage(`Speichern fehlgeschlagen: ${error.message}`);
      return;
    }

    const nextProfile: ProfileRow = { ...profile, username, full_name: fullName, email: profile.email ?? null };
    setProfile(nextProfile);
    window.localStorage.setItem(PROFILE_USERNAME_KEY, username);
    saveLocalCache({ profile: nextProfile, playStyle, weekConfig, weeklyGoalSessions, bodyMetrics });
    void pushProgressToCloud();
    setMessage(null);
  }, [bodyMetrics, playStyle, profile, weekConfig, weeklyGoalSessions]);

  return (
    <main className="app-container animate-in">
      <PageHeader
        eyebrow="Spielerprofil"
        title="Profil & Wochenplanung"
        subtitle="Pflege deine Daten und plane die Woche – die Engine baut deinen Plan automatisch."
      />

      <section className="mt-4 app-card">
        <p className="section-eyebrow">Coach</p>
        <h2 className="section-title mt-1">Kennenlern-Chat</h2>
        <p className="mt-1 text-sm text-muted">
          Beim ersten App-Start hast du Stärken, Schwächen und Rolle im Team angegeben. Du kannst das zurücksetzen — der Dialog erscheint dann wieder (z. B. nach der Saison).
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-sm mt-3"
          onClick={() => {
            clearPlayerIntake();
            void pushProgressToCloud({ playerIntake: "" });
            setMessage("Kennenlern-Chat zurückgesetzt. Beim nächsten Laden der App wirst du erneut befragt.");
          }}
        >
          Kennenlern-Chat erneut starten
        </button>
      </section>

      <section className="mt-6 app-card">
        <p className="section-eyebrow">Stammdaten</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="input-label">Username</label>
            <input
              value={profile.username ?? ""}
              onChange={(e) => setProfile((p) => ({ ...p, username: e.target.value }))}
              className="input"
              placeholder="z.B. court_killer"
            />
          </div>
          <div>
            <label className="input-label">Vollständiger Name</label>
            <input
              value={profile.full_name ?? ""}
              onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))}
              className="input"
              placeholder="Max Mustermann"
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="input-label">E-Mail (aus Login)</label>
          <input
            value={profile.email ?? ""}
            disabled
            className="input opacity-70"
            placeholder="—"
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="input-label">Position</label>
            <select
              value={profile.favorite_position ?? "sg"}
              onChange={(e) => {
                const next = e.target.value;
                setProfile((p) => ({ ...p, favorite_position: next }));
                setPlayStyle(getDefaultPlayStyle(next));
              }}
              className="select"
            >
              <option value="pg">PG · Point Guard</option>
              <option value="sg">SG · Shooting Guard</option>
              <option value="sf">SF · Small Forward</option>
              <option value="pf">PF · Power Forward</option>
              <option value="c">C · Center</option>
            </select>
          </div>
          <div>
            <label className="input-label">Spielstil</label>
            <select value={playStyle} onChange={(e) => setPlayStyle(e.target.value)} className="select">
              {(PLAY_STYLE_BY_POSITION[profile.favorite_position ?? "sg"] ?? []).map((style) => (
                <option key={style} value={style}>{style}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="input-label">Größe (cm)</label>
            <input
              type="number"
              value={profile.height_cm ?? ""}
              onChange={(e) => setProfile((p) => ({ ...p, height_cm: e.target.value ? Number(e.target.value) : null }))}
              className="input"
              placeholder="185"
            />
          </div>
          <div>
            <label className="input-label">Gewicht (kg)</label>
            <input
              type="number"
              value={profile.weight_kg ?? ""}
              onChange={(e) => setProfile((p) => ({ ...p, weight_kg: e.target.value ? Number(e.target.value) : null }))}
              className="input"
              placeholder="78"
            />
          </div>
          <div>
            <label className="input-label">Spannweite (cm)</label>
            <input
              type="number"
              value={bodyMetrics.wingspan_cm ?? ""}
              onChange={(e) => setBodyMetrics((prev) => ({ ...prev, wingspan_cm: e.target.value ? Number(e.target.value) : null }))}
              className="input"
              placeholder="195"
            />
          </div>
          <div>
            <label className="input-label">Standing Reach (cm)</label>
            <input
              type="number"
              value={bodyMetrics.standing_reach_cm ?? ""}
              onChange={(e) => setBodyMetrics((prev) => ({ ...prev, standing_reach_cm: e.target.value ? Number(e.target.value) : null }))}
              className="input"
              placeholder="240"
            />
          </div>
          <div>
            <label className="input-label">KFA (%)</label>
            <input
              type="number"
              value={bodyMetrics.body_fat_pct ?? ""}
              onChange={(e) => setBodyMetrics((prev) => ({ ...prev, body_fat_pct: e.target.value ? Number(e.target.value) : null }))}
              className="input"
              placeholder="14"
            />
          </div>
        </div>
      </section>

      <section className="mt-4 app-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-eyebrow">Wochen-Verfügbarkeit</p>
            <h2 className="section-title mt-1">Grundrhythmus</h2>
            <p className="text-xs text-muted">
              Deine Basiswoche. Alltag-Änderungen machst du unten über Workout Activity.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAvailabilityOpen((current) => !current)}
            className="btn btn-ghost btn-sm shrink-0"
            aria-expanded={availabilityOpen}
          >
            {availabilityOpen ? "Einklappen" : "Bearbeiten"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {DAY_KEYS.map((dayKey) => {
            const dayConfig = weekConfig[dayKey] ?? { mode: "unavailable" as DayMode, minutes: 0 };
            const isAvailable = dayConfig.mode !== "unavailable" && dayConfig.mode !== "rest";
            return (
              <span key={`summary-${dayKey}`} className={`chip ${isAvailable ? "chip-active" : ""}`}>
                {DAY_LABELS[dayKey].slice(0, 2)} {isAvailable ? `${dayConfig.minutes}m` : "frei"}
              </span>
            );
          })}
        </div>
        {availabilityOpen ? (
          <>
        <div className="mt-4 space-y-2">
          {(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as DayKey[]).map((dayKey) => {
            const dayConfig = weekConfig[dayKey] ?? { mode: "unavailable" as DayMode, minutes: 0 };
            const isAvailable = dayConfig.mode !== "unavailable" && dayConfig.mode !== "rest";
            return (
              <div
                key={dayKey}
                className={`flex flex-wrap items-center gap-2 rounded-2xl border p-3 transition ${
                  isAvailable ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    updateWeekConfigAndCalendar((prev) => ({
                      ...prev,
                      [dayKey]: isAvailable
                        ? { mode: "unavailable", minutes: 0 }
                        : { mode: "basketball_training", minutes: 45 },
                    }));
                  }}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition ${
                    isAvailable
                      ? "border-emerald-400 bg-emerald-500 text-white"
                      : "border-white/20 bg-white/[0.05] text-faint"
                  }`}
                  aria-pressed={isAvailable}
                  aria-label={`${DAY_LABELS[dayKey]} ${isAvailable ? "verfügbar" : "nicht verfügbar"}`}
                >
                  {isAvailable ? "✓" : "—"}
                </button>
                <span className="w-24 text-sm font-semibold text-strong">{DAY_LABELS[dayKey]}</span>
                {isAvailable ? (
                  <>
                    <select
                      value={dayConfig.mode}
                      onChange={(event) => {
                        const nextMode = event.target.value as DayMode;
                        updateWeekConfigAndCalendar((prev) => {
                          const current = prev[dayKey] ?? { mode: "unavailable" as DayMode, minutes: 0 };
                          const defaultMinutes: Record<DayMode, number> = {
                            unavailable: 0,
                            rest: 0,
                            recovery: 25,
                            game_day: 60,
                            game_training: 45,
                            basketball_training: 45,
                            gym: 60,
                            custom: 30,
                          };
                          const nextMinutes =
                            typeof current.minutes === "number" && Number.isFinite(current.minutes) && current.minutes > 0
                              ? current.minutes
                              : defaultMinutes[nextMode];
                          return {
                            ...prev,
                            [dayKey]: {
                              mode: nextMode,
                              minutes: nextMinutes,
                            },
                          };
                        });
                      }}
                      className="select min-w-[140px] flex-1"
                    >
                      <option value="basketball_training">Basketball</option>
                      <option value="game_training">Spieltraining</option>
                      <option value="game_day">Spieltag</option>
                      <option value="gym">Gym</option>
                      <option value="custom">Home / Custom</option>
                      <option value="recovery">Regeneration</option>
                    </select>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={240}
                        step={5}
                        value={dayConfig.minutes}
                        onChange={(event) => {
                          const minutes = Number(event.target.value) || 0;
                          updateWeekConfigAndCalendar((prev) => {
                            const current = prev[dayKey] ?? { mode: "unavailable" as DayMode, minutes: 0 };
                            return {
                              ...prev,
                              [dayKey]: { ...current, minutes },
                            };
                          });
                        }}
                        className="input w-20"
                      />
                      <span className="text-xs text-faint">Min</span>
                    </div>
                  </>
                ) : (
                  <span className="text-xs text-faint">Frei / Keine Zeit</span>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-faint">
          Tipp: 3–5 Trainings/Woche sind ein guter Start. Mehr ist nur sinnvoll, wenn Regeneration und Schlaf passen.
        </p>
          </>
        ) : null}
      </section>

      <section className="mt-4 app-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="section-eyebrow">Kalender</p>
            <h2 className="section-title">Workout Activity</h2>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="btn btn-ghost btn-xs">◀</button>
            <span className="text-sm font-semibold text-strong">
              {currentMonth.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
            </span>
            <button type="button" onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="btn btn-ghost btn-xs">▶</button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[10px] uppercase tracking-wider text-faint">
          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((label) => <p key={label}>{label}</p>)}
        </div>
        <div className="mt-1.5 grid grid-cols-7 gap-1.5">
          {monthCells.map((cell, index) => {
            if (!cell) return <div key={`empty-${index}`} className="h-12 rounded-lg bg-white/[0.02]" />;
            const key = toLocalDateKey(cell);
            const isToday = key === todayKey;
            const isSelected = key === selectedDateKey;
            const trained = completedDates.has(key);
            const hasPlannedTags = (dailyPlanMap[key] ?? []).length > 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDateKey(key)}
                className={`relative rounded-lg border text-sm font-semibold transition ${
                  isSelected
                    ? `border-orange-400 bg-orange-500/20 text-white shadow-[0_0_0_2px_rgba(255,122,24,0.25)] ${isToday ? "h-16 scale-[1.08] ring-2 ring-cyan-300/70 z-10" : "h-12"}`
                    : trained
                      ? `border-emerald-500/40 bg-emerald-500/15 text-emerald-100 ${isToday ? "h-16 scale-[1.08] ring-2 ring-cyan-300/70 z-10 shadow-[0_0_20px_rgba(34,211,238,0.25)]" : "h-12"}`
                      : isToday
                        ? "h-16 scale-[1.08] z-10 border-cyan-300 bg-cyan-400/20 text-white ring-2 ring-cyan-300/70 shadow-[0_0_22px_rgba(34,211,238,0.35)]"
                        : "h-12 border-white/10 bg-white/[0.02] text-strong hover:bg-white/[0.05]"
                }`}
              >
                {isToday ? (
                  <span className="absolute left-1/2 top-1 -translate-x-1/2 rounded-full bg-cyan-300 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-slate-950">
                    Heute
                  </span>
                ) : null}
                <span className={isToday ? "mt-3 block text-lg font-black" : ""}>{cell.getDate()}</span>
                {trained ? <span className="block text-[9px] opacity-80">✓</span> : null}
                {hasPlannedTags ? (
                  <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-orange-400" />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-4 app-card--flat">
          <p className="text-xs font-semibold uppercase tracking-wider text-faint">{selectedDateKey}</p>
          {selectedDateKey < todayKey || (selectedDateKey === todayKey && isSelectedCompleted) ? (
            <div className="mt-3 space-y-2 text-sm">
              {selectedSessions.length === 0 ? (
                <p className="text-muted">Kein Training an diesem Tag.</p>
              ) : selectedSessions.map((session) => (
                <div key={session.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="font-semibold text-strong">{session.workoutName}</p>
                  <p className="text-xs text-muted">Exercises: {session.logs.length} · Dauer ca. {session.logs.length * 4} Min</p>
                  <div className="mt-2 space-y-1 text-xs text-strong">
                    {session.logs.map((log, idx) => (
                      <div key={`${session.id}-${idx}`} className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
                        <p className="font-semibold">{exerciseNameById.get(log.exerciseId) ?? log.exerciseId}</p>
                        <p className="text-muted">Kategorie: {exerciseById.get(log.exerciseId)?.category ?? "-"} · Unterkategorie: {exerciseById.get(log.exerciseId)?.subcategory ?? "-"}</p>
                        {log.made != null || log.misses != null || log.attempts != null ? (
                          <p>Makes: {log.made ?? "-"} · Misses: {log.misses ?? "-"} · Reps: {log.attempts ?? "-"}</p>
                        ) : null}
                        {log.completedValue != null ? <p>Reps/Wert: {log.completedValue}</p> : null}
                        {log.weightKg != null && log.weightKg > 0 ? <p>Gewicht: {log.weightKg} kg</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-xs text-muted">Plane heute/zukünftige Tage:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PRIMARY_DAY_TABS.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => applyPrimaryTab(tab)}
                    className={`chip ${activePrimaryTab === tab ? "chip-active" : ""}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {activePrimaryTab === "Basketball" ? (
                <>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["Training", "Spieltraining", "Spieltag"] as BasketballSessionMode[]).map((mode) => (
                      <button
                        key={`bb-mode-${mode}`}
                        type="button"
                        onClick={() => applyBasketballSessionMode(mode)}
                        className={`chip ${activeBasketballSessionMode === mode ? "chip-info" : ""}`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                  {activeBasketballSessionMode === "Training" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {basketballTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => applyBasketballSubtag(tag)}
                          className={`chip ${activeBasketballSubtag === tag ? "chip-success" : ""}`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted">Für {activeBasketballSessionMode} wird automatisch Warm-Up gesetzt.</p>
                  )}
                </>
              ) : null}
              {activePrimaryTab === "Gym" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {gymTags.map((tag) => (
                    <button key={tag} type="button" onClick={() => applyGymSubtag(tag)} className={`chip ${activeGymSubtag === tag ? "chip-warning" : ""}`}>
                      {tag}
                    </button>
                  ))}
                </div>
              ) : null}
              {activePrimaryTab === "HomeWorkout" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {homeTags.map((tag) => (
                    <button key={tag} type="button" onClick={() => applyHomeSubtag(tag)} className={`chip ${activeHomeSubtag === tag ? "chip-warning" : ""}`}>
                      {tag}
                    </button>
                  ))}
                </div>
              ) : null}
              {activePrimaryTab === "Regeneration" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {recoveryTags.map((tag) => (
                    <button key={tag} type="button" onClick={() => applyRecoverySubtag(tag)} className={`chip ${activeRecoverySubtag === tag ? "chip-success" : ""}`}>
                      {tag}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <button
        type="button"
        onClick={async () => {
          saveLocalCache({ profile, playStyle, weekConfig, weeklyGoalSessions, bodyMetrics });
          const updatedDailyPlan = applyWeekConfigToCalendar(weekConfig, 28);
          setDailyPlanMap(updatedDailyPlan);
          await persistProfileToSupabase();
          await pushProgressToCloud();
          setSavedToastVisible(true);
          window.setTimeout(() => setSavedToastVisible(false), 2200);
        }}
        className="btn btn-primary btn-block mt-4"
      >
        Profil aktualisieren
      </button>

      <WorkoutReminderSettings weekConfig={weekConfig} />

      <section className="mt-4 app-card">
        <p className="section-eyebrow">Vorschau</p>
        <h2 className="section-title mt-1">Weekly-Plan</h2>
        <p className="text-xs text-muted">Aus deiner aktuellen Konfiguration berechnet.</p>
        <ul className="mt-3 divide-y divide-white/5 text-sm">
          {orderedDays.map((day) => {
            const entry = planPreview.find((planEntry) => planEntry.day === day);
            if (!entry) return null;
            return (
              <li key={entry.day} className="flex items-center justify-between gap-3 py-2">
                <span className="font-semibold text-strong">
                  {DAY_LABELS[entry.day]}{" "}
                  <span className="text-xs text-faint">
                    ({getNextDateForDay(entry.day).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })})
                  </span>
                </span>
                <span className="text-right text-xs text-muted">
                  <span className="font-medium text-strong">{entry.sessionType}</span>
                  {" · "}{entry.intensity} · {entry.minutes} Min
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {message ? (
        <div className="mt-4 app-card--accent-cyan">
          <p className="text-sm text-strong">{message}</p>
        </div>
      ) : null}
      {savedToastVisible ? (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full border border-emerald-400 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-100 backdrop-blur">
          Profil gespeichert ✅
        </div>
      ) : null}
    </main>
  );
}