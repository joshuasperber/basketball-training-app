import { getEmptyWeekConfig, type DayKey, type WeekConfig } from "@/lib/planner";

export const INITIAL_SETUP_UPDATED_EVENT = "bt:initial-setup-updated";
const PROFILE_CACHE_KEY = "profile_cache_v4";
const PROFILE_USERNAME_KEY = "profile_username";
const PROFILE_WEEK_CONFIG_KEY = "bt.profile-week-config.v1";

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
  bodyMetrics?: {
    wingspan_cm?: number | null;
    standing_reach_cm?: number | null;
    body_fat_pct?: number | null;
  };
  aiConsentAt?: string | null;
};

export type PersistedProfileShape = NonNullable<ProfileCacheShape["profile"]>;

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

function parseWeekConfig(raw: string | null | undefined): WeekConfig | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WeekConfig;
  } catch {
    return null;
  }
}

/**
 * Older accounts can have a complete row in `profiles` while the newer
 * `user_progress.profile_cache` is still empty. Rebuild the local cache from
 * that durable profile instead of asking the player to enter the same data on
 * every new device.
 */
export function mergePersistedProfileIntoCache(
  persistedProfile: PersistedProfileShape,
  options: {
    existingCache?: ProfileCacheShape | null;
    persistedWeekConfig?: string | null;
    email?: string | null;
  } = {},
): ProfileCacheShape {
  const blank = createBlankProfileCache(options.email);
  const existing = options.existingCache ?? null;
  const persistedWeek = parseWeekConfig(options.persistedWeekConfig);
  const existingWeek = hasConfiguredWeekRhythm(existing) ? existing?.weekConfig : null;

  return {
    ...blank,
    ...existing,
    onboardingComplete: Boolean(existing?.onboardingComplete),
    profile: {
      ...blank.profile,
      ...existing?.profile,
      username: persistedProfile.username?.trim() || existing?.profile?.username?.trim() || "",
      full_name: persistedProfile.full_name?.trim() || existing?.profile?.full_name?.trim() || "",
      favorite_position:
        persistedProfile.favorite_position ?? existing?.profile?.favorite_position ?? "sg",
      height_cm: persistedProfile.height_cm ?? existing?.profile?.height_cm ?? null,
      weight_kg: persistedProfile.weight_kg ?? existing?.profile?.weight_kg ?? null,
      email: existing?.profile?.email ?? options.email ?? null,
    },
    weekConfig: existingWeek ?? persistedWeek ?? existing?.weekConfig ?? blank.weekConfig,
  };
}

export function persistHydratedProfileCache(cache: ProfileCacheShape) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cache));
  if (cache.profile?.username?.trim()) {
    window.localStorage.setItem(PROFILE_USERNAME_KEY, cache.profile.username.trim());
  }
  if (cache.weekConfig) {
    window.localStorage.setItem(PROFILE_WEEK_CONFIG_KEY, JSON.stringify(cache.weekConfig));
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

  if (profileOk && weekOk) {
    markInitialSetupComplete(cache);
    return true;
  }

  return false;
}

export function markInitialSetupComplete(
  existing?: ProfileCacheShape | null,
  options: { sync?: boolean } = {},
) {
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
  if (options.sync !== false && typeof document !== "undefined") {
    void import("@/lib/progress-sync").then(({ pushProgressToCloudWithRetry }) => {
      pushProgressToCloudWithRetry({ profileCache: JSON.stringify(next) });
    });
  }
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
