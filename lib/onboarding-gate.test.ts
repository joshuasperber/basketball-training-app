import { beforeEach, describe, expect, it } from "vitest";
import {
  hasConfiguredWeekRhythm,
  hasProfileBasics,
  isInitialSetupComplete,
  mergePersistedProfileIntoCache,
  persistHydratedProfileCache,
} from "@/lib/onboarding-gate";
import { getEmptyWeekConfig } from "@/lib/planner";

function installBrowserStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      dispatchEvent: () => true,
    },
  });
}

describe("onboarding-gate", () => {
  beforeEach(() => {
    installBrowserStorage();
  });

  it("requires profile basics and week rhythm locally", () => {
    const cache = {
      profile: { username: "josh", full_name: "Josh" },
      weekConfig: getEmptyWeekConfig(),
      onboardingComplete: false,
    };
    expect(hasProfileBasics(cache)).toBe(true);
    expect(hasConfiguredWeekRhythm(cache)).toBe(false);
    expect(isInitialSetupComplete(null, JSON.stringify(cache))).toBe(false);
  });

  it("treats remote onboardingComplete as done (new device)", () => {
    const remoteCache = JSON.stringify({
      profile: { username: "josh", full_name: "Josh" },
      weekConfig: {
        monday: { mode: "training", minutes: 60 },
        tuesday: { mode: "rest", minutes: 0 },
        wednesday: { mode: "rest", minutes: 0 },
        thursday: { mode: "rest", minutes: 0 },
        friday: { mode: "rest", minutes: 0 },
        saturday: { mode: "rest", minutes: 0 },
        sunday: { mode: "rest", minutes: 0 },
      },
      onboardingComplete: true,
    });
    expect(isInitialSetupComplete(null, remoteCache)).toBe(true);
  });

  it("accepts game_day as configured week day", () => {
    const weekConfig = getEmptyWeekConfig();
    weekConfig.saturday = { mode: "game_day", minutes: 0 };
    expect(hasConfiguredWeekRhythm({ weekConfig })).toBe(true);
  });

  it("marks setup complete from local profile and week without coach intake", () => {
    const weekConfig = getEmptyWeekConfig();
    weekConfig.monday = { mode: "basketball_training", minutes: 45 };
    window.localStorage.setItem(
      "profile_cache_v4",
      JSON.stringify({
        profile: { username: "josh", full_name: "Josh" },
        weekConfig,
        onboardingComplete: false,
      }),
    );
    expect(isInitialSetupComplete(null, null)).toBe(true);
    const cached = JSON.parse(window.localStorage.getItem("profile_cache_v4") ?? "{}") as { onboardingComplete?: boolean };
    expect(cached.onboardingComplete).toBe(true);
  });

  it("hydrates legacy profile rows and keeps a remotely stored week rhythm", () => {
    const weekConfig = getEmptyWeekConfig();
    weekConfig.wednesday = { mode: "basketball_training", minutes: 90 };

    const hydrated = mergePersistedProfileIntoCache(
      {
        username: "josh",
        full_name: "Joshua Sperber",
        favorite_position: "sg",
        height_cm: 190,
        weight_kg: 84,
      },
      {
        persistedWeekConfig: JSON.stringify(weekConfig),
        email: "josh@example.com",
      },
    );

    expect(hasProfileBasics(hydrated)).toBe(true);
    expect(hasConfiguredWeekRhythm(hydrated)).toBe(true);
    expect(hydrated.profile?.email).toBe("josh@example.com");
    persistHydratedProfileCache(hydrated);
    expect(window.localStorage.getItem("profile_username")).toBe("josh");
    expect(window.localStorage.getItem("bt.profile-week-config.v1")).toBe(JSON.stringify(weekConfig));
  });

  it("does not overwrite an existing configured week with an empty legacy value", () => {
    const existingWeek = getEmptyWeekConfig();
    existingWeek.monday = { mode: "gym", minutes: 60 };

    const hydrated = mergePersistedProfileIntoCache(
      { username: "cloud", full_name: "Cloud Player" },
      {
        existingCache: {
          profile: { username: "local", full_name: "Local Player" },
          weekConfig: existingWeek,
        },
        persistedWeekConfig: JSON.stringify(getEmptyWeekConfig()),
      },
    );

    expect(hydrated.profile?.username).toBe("cloud");
    expect(hydrated.weekConfig?.monday).toEqual({ mode: "gym", minutes: 60 });
  });
});
