import { describe, expect, it } from "vitest";
import { mergeProgressSnapshots } from "@/lib/progress-auto-merge";
import type { RemoteProgressPayload } from "@/lib/progress-sync";

function progress(overrides: Partial<RemoteProgressPayload> = {}): RemoteProgressPayload {
  return {
    sessions: { workoutSessions: [], exerciseHistory: {} },
    dailyPlanMap: {},
    manualDayWorkoutsMap: {},
    manualDayDisabledMap: {},
    manualPlanOverrides: null,
    weeklyRegenSlotMap: {},
    profileCache: null,
    profileUsername: null,
    profileWeekConfig: null,
    playerIntake: null,
    xpHistory: null,
    xpProgression: null,
    hiddenAutoWorkoutsMap: {},
    performanceTips: null,
    gameStats: null,
    leagueData: null,
    trainingGoals: null,
    customSubcategories: null,
    workoutHistory: null,
    reminderPrefs: null,
    readinessHistory: null,
    coachWeeklyNote: null,
    trainingExercises: null,
    trainingWorkouts: null,
    workoutOverrides: {},
    remoteExists: true,
    remoteUpdatedAt: "2026-09-17T12:00:00.000Z",
    ...overrides,
  };
}

describe("automatic progress merge", () => {
  it("keeps game entries created on two devices", () => {
    const base = progress({ gameStats: JSON.stringify([{ id: "g1", points: 10 }]) });
    const remote = progress({ gameStats: JSON.stringify([
      { id: "g1", points: 10 },
      { id: "g2", points: 14 },
    ]) });
    const local = progress({ gameStats: JSON.stringify([{ id: "g1", points: 18 }]) });

    const merged = mergeProgressSnapshots(base, remote, local);
    expect(JSON.parse(merged.gameStats ?? "[]")).toEqual([
      { id: "g1", points: 18 },
      { id: "g2", points: 14 },
    ]);
  });

  it("combines independent profile and calendar changes", () => {
    const base = progress({
      profileCache: JSON.stringify({ profile: { full_name: "Alex", favorite_position: "PG" } }),
      dailyPlanMap: { "2026-09-17": ["Gym"] },
    });
    const remote = progress({
      profileCache: JSON.stringify({ profile: { full_name: "Alex", favorite_position: "SG" } }),
      dailyPlanMap: { "2026-09-17": ["Gym"], "2026-09-18": ["Regeneration"] },
    });
    const local = progress({
      profileCache: JSON.stringify({ profile: { full_name: "Sam", favorite_position: "PG" } }),
      dailyPlanMap: { "2026-09-17": ["Basketball:Shooting"] },
    });

    const merged = mergeProgressSnapshots(base, remote, local);
    expect(JSON.parse(merged.profileCache ?? "{}")).toEqual({
      profile: { full_name: "Sam", favorite_position: "SG" },
    });
    expect(merged.dailyPlanMap).toEqual({
      "2026-09-17": ["Basketball:Shooting"],
      "2026-09-18": ["Regeneration"],
    });
  });
});
