import { beforeEach, describe, expect, it } from "vitest";
import { applyRemoteProgressToLocal, buildLocalProgressSnapshot } from "@/lib/progress-sync";
import { getEmptyWeekConfig } from "@/lib/planner";
import { REMINDER_PREFS_KEY } from "@/lib/workout-reminders";

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

describe("progress-sync snapshot", () => {
  beforeEach(() => {
    installBrowserStorage();
  });

  it("reads reminder prefs from the canonical key with legacy fallback", () => {
    window.localStorage.setItem(REMINDER_PREFS_KEY, JSON.stringify({ enabled: true, time: "18:30" }));
    const snapshot = buildLocalProgressSnapshot();
    expect(snapshot.reminderPrefs).toContain("18:30");
  });

  it("falls back to legacy reminder key when canonical key is missing", () => {
    window.localStorage.removeItem(REMINDER_PREFS_KEY);
    window.localStorage.setItem("bt.workout-reminders.v1", JSON.stringify({ enabled: false, time: "07:00" }));
    const snapshot = buildLocalProgressSnapshot();
    expect(snapshot.reminderPrefs).toContain("07:00");
  });

  it("keeps local profile data when cloud profile cache is empty", () => {
    const weekConfig = getEmptyWeekConfig();
    weekConfig.monday = { mode: "basketball_training", minutes: 45 };
    window.localStorage.setItem(
      "profile_cache_v4",
      JSON.stringify({
        profile: { username: "local-user", full_name: "Local User" },
        weekConfig,
        onboardingComplete: false,
      }),
    );

    applyRemoteProgressToLocal({
      sessions: { workoutSessions: [], exerciseHistory: {} },
      dailyPlanMap: {},
      manualDayWorkoutsMap: {},
      manualDayDisabledMap: {},
      manualPlanOverrides: null,
      weeklyRegenSlotMap: {},
      hiddenAutoWorkoutsMap: {},
      profileCache: JSON.stringify({
        profile: { username: "", full_name: "" },
        weekConfig: getEmptyWeekConfig(),
        onboardingComplete: false,
      }),
      profileUsername: null,
      profileWeekConfig: null,
      playerIntake: null,
      xpHistory: null,
      xpProgression: null,
      performanceTips: null,
      gameStats: null,
      leagueData: null,
      trainingGoals: null,
      customSubcategories: null,
      workoutHistory: null,
      reminderPrefs: null,
      coachWeeklyNote: null,
      trainingExercises: null,
      trainingWorkouts: null,
      workoutOverrides: {},
      remoteExists: true,
      remoteUpdatedAt: new Date().toISOString(),
    });

    const cached = JSON.parse(window.localStorage.getItem("profile_cache_v4") ?? "{}") as {
      profile?: { username?: string; full_name?: string };
    };
    expect(cached.profile?.username).toBe("local-user");
    expect(cached.profile?.full_name).toBe("Local User");
  });
});
