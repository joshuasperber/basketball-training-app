import { isPlayerIntakeDoneLocallyOrRemote } from "@/lib/coach-intake";
import { getEmptyWeekConfig, type DayKey, type WeekConfig } from "@/lib/planner";

export const INITIAL_SETUP_UPDATED_EVENT = "bt:initial-setup-updated";
const PROFILE_CACHE_KEY = "profile_cache_v4";

export type ProfileCacheShape = {
  profile?: {
    username?: string | null;
    full_name?: string | null;
    favorite_position?: string | null;
    height_cm?: number | null;
    weight_kg?: number | null;
    email?: string | null;
  };
  playStyle?: string;
  weekConfig?: WeekConfig;
  weeklyGoalSessions?: number;
  onboardingComplete?: boolean;
};

function readProfileCache(): ProfileCacheShape | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProfileCacheShape;
  } catch {
    return null;
  }
}

export function hasProfileBasics(cache = readProfileCache()) {
  const username = cache?.profile?.username?.trim() ?? "";
  const fullName = cache?.profile?.full_name?.trim() ?? "";
  return Boolean(username && fullName);
}

export function hasConfiguredWeekRhythm(cache = readProfileCache()) {
  const weekConfig = cache?.weekConfig ?? getEmptyWeekConfig();
  return Object.values(weekConfig).some((day) => {
    const mode = day?.mode ?? "unavailable";
    if (mode === "unavailable" || mode === "rest") return false;
    if (mode === "game_day") return true;
    return (day?.minutes ?? 0) > 0;
  });
}

function readOnboardingCompleteFromProfileCache(raw: string | null | undefined) {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as ProfileCacheShape;
    return Boolean(parsed.onboardingComplete);
  } catch {
    return false;
  }
}

export function isInitialSetupComplete(remotePlayerIntake?: string | null, remoteProfileCache?: string | null) {
  if (readOnboardingCompleteFromProfileCache(remoteProfileCache)) return true;

  const cache = readProfileCache();
  if (cache?.onboardingComplete) return true;

  const profileOk = hasProfileBasics(cache);
  const weekOk = hasConfiguredWeekRhythm(cache);
  const coachOk = isPlayerIntakeDoneLocallyOrRemote(remotePlayerIntake ?? null);

  if (profileOk && weekOk && coachOk) {
    markInitialSetupComplete(cache);
    return true;
  }

  return false;
}

export function markInitialSetupComplete(existing?: ProfileCacheShape | null) {
  if (typeof window === "undefined") return;
  const cache = existing ?? readProfileCache() ?? {};
  const next = {
    ...cache,
    onboardingComplete: true,
    weekConfig: cache.weekConfig ?? getEmptyWeekConfig(),
    profile: cache.profile ?? {
      username: "",
      full_name: "",
      favorite_position: "sg",
      height_cm: null,
      weight_kg: null,
      email: null,
    },
    playStyle: cache.playStyle ?? "Shooter",
    weeklyGoalSessions: cache.weeklyGoalSessions ?? 4,
  };
  window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(INITIAL_SETUP_UPDATED_EVENT));
}

export function createBlankProfileCache(email?: string | null): ProfileCacheShape {
  return {
    onboardingComplete: false,
    profile: {
      username: "",
      full_name: "",
      favorite_position: "sg",
      height_cm: null,
      weight_kg: null,
      email: email ?? null,
    },
    playStyle: "Shooter",
    weekConfig: getEmptyWeekConfig(),
    weeklyGoalSessions: 4,
  };
}

export const DAY_LABELS: Record<DayKey, string> = {
  monday: "Montag",
  tuesday: "Dienstag",
  wednesday: "Mittwoch",
  thursday: "Donnerstag",
  friday: "Freitag",
  saturday: "Samstag",
  sunday: "Sonntag",
};

export const SETUP_DAY_KEYS: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
