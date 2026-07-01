import { describe, expect, it } from "vitest";
import { hasConfiguredWeekRhythm, hasProfileBasics, isInitialSetupComplete } from "@/lib/onboarding-gate";
import { getEmptyWeekConfig } from "@/lib/planner";

describe("onboarding-gate", () => {
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
});
