import { beforeEach, describe, expect, it } from "vitest";
import { hasConfiguredWeekRhythm, hasProfileBasics, isInitialSetupComplete } from "@/lib/onboarding-gate";
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
});
