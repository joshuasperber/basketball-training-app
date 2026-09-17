import { describe, expect, it } from "vitest";
import { mergeProgressForFirstSync } from "@/lib/first-sync-progress-merge";
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
    ...overrides,
  };
}

describe("mergeProgressForFirstSync", () => {
  it("fills only missing cloud text and keeps every existing cloud value", () => {
    const cloud = progress({
      profileCache: "",
      leagueData: null,
      gameStats: "cloud-game-stats",
      trainingGoals: "{}",
      remoteExists: true,
      remoteUpdatedAt: "2026-09-16T10:00:00.000Z",
    });
    const local = progress({
      profileCache: "local-profile",
      leagueData: "local-league",
      gameStats: "local-game-stats",
      trainingGoals: "local-goals",
      remoteExists: false,
      remoteUpdatedAt: "local-metadata-must-not-win",
    });

    const result = mergeProgressForFirstSync(cloud, local);

    expect(result.addedLocalData).toBe(true);
    expect(result.progress.profileCache).toBe("local-profile");
    expect(result.progress.leagueData).toBe("local-league");
    expect(result.progress.gameStats).toBe("cloud-game-stats");
    expect(result.progress.trainingGoals).toBe("{}");
    expect(result.progress.remoteExists).toBe(true);
    expect(result.progress.remoteUpdatedAt).toBe("2026-09-16T10:00:00.000Z");
  });

  it("unions maps by key while cloud values win collisions", () => {
    const cloud = progress({
      dailyPlanMap: {
        "2026-09-16": ["Gym"],
      },
      manualDayDisabledMap: { "2026-09-17": false },
      workoutOverrides: { "2026-09-18": "cloud-workout" },
    });
    const local = progress({
      dailyPlanMap: {
        "2026-09-15": ["Trainingstag"],
        "2026-09-16": ["Home-Workout"],
      },
      manualDayDisabledMap: { "2026-09-17": true, "2026-09-19": true },
      workoutOverrides: {
        "2026-09-18": "local-workout",
        "2026-09-20": "local-only-workout",
      },
    });

    const result = mergeProgressForFirstSync(cloud, local);

    expect(result.addedLocalData).toBe(true);
    expect(result.progress.dailyPlanMap["2026-09-15"]).toEqual(["Trainingstag"]);
    expect(result.progress.dailyPlanMap["2026-09-16"]).toEqual(["Gym"]);
    expect(result.progress.manualDayDisabledMap).toEqual({
      "2026-09-17": false,
      "2026-09-19": true,
    });
    expect(result.progress.workoutOverrides).toEqual({
      "2026-09-18": "cloud-workout",
      "2026-09-20": "local-only-workout",
    });
  });

  it("unions workout sessions and exercise history by id with cloud collisions winning", () => {
    const cloud = progress({
      sessions: {
        workoutSessions: [
          {
            id: "shared-session",
            dateISO: "2026-09-16T18:00:00.000Z",
            workoutId: "cloud-workout",
            workoutName: "Cloud session",
            logs: [],
          },
        ],
        exerciseHistory: {
          pound: [
            {
              id: "shared-entry",
              dateISO: "2026-09-16T18:00:00.000Z",
              exerciseId: "pound",
              value: 18,
              source: "exercise",
            },
          ],
        },
      },
    });
    const local = progress({
      sessions: {
        workoutSessions: [
          {
            id: "local-session",
            dateISO: "2026-09-15T18:00:00.000Z",
            workoutId: "local-workout",
            workoutName: "Local session",
            logs: [],
          },
          {
            id: "shared-session",
            dateISO: "2026-09-16T18:00:00.000Z",
            workoutId: "local-version",
            workoutName: "Must not win",
            logs: [],
          },
        ],
        exerciseHistory: {
          pound: [
            {
              id: "local-entry",
              dateISO: "2026-09-15T18:00:00.000Z",
              exerciseId: "pound",
              value: 20,
              source: "exercise",
            },
            {
              id: "shared-entry",
              dateISO: "2026-09-16T18:00:00.000Z",
              exerciseId: "pound",
              value: 999,
              source: "exercise",
            },
          ],
          stretch: [
            {
              id: "stretch-entry",
              dateISO: "2026-09-14T18:00:00.000Z",
              exerciseId: "stretch",
              value: 1,
              source: "exercise",
            },
          ],
        },
      },
    });

    const result = mergeProgressForFirstSync(cloud, local);

    expect(result.addedLocalData).toBe(true);
    expect(result.progress.sessions.workoutSessions.map((session) => session.id)).toEqual([
      "shared-session",
      "local-session",
    ]);
    expect(result.progress.sessions.workoutSessions[0]?.workoutName).toBe("Cloud session");
    expect(result.progress.sessions.exerciseHistory.pound?.map((entry) => entry.id)).toEqual([
      "shared-entry",
      "local-entry",
    ]);
    expect(result.progress.sessions.exerciseHistory.pound?.[0]?.value).toBe(18);
    expect(result.progress.sessions.exerciseHistory.stretch?.[0]?.id).toBe("stretch-entry");
  });

  it("does not mutate either input and reports no upload when cloud already contains all data", () => {
    const cloud = progress({
      leagueData: "cloud-league",
      dailyPlanMap: {
        "2026-09-16": ["Gym"],
      },
    });
    const local = progress({
      leagueData: "local-league",
      dailyPlanMap: {
        "2026-09-16": ["Home-Workout"],
      },
    });
    const cloudBefore = structuredClone(cloud);
    const localBefore = structuredClone(local);

    const result = mergeProgressForFirstSync(cloud, local);

    expect(result.addedLocalData).toBe(false);
    expect(result.progress.leagueData).toBe("cloud-league");
    expect(result.progress.dailyPlanMap["2026-09-16"]).toEqual(["Gym"]);
    expect(cloud).toEqual(cloudBefore);
    expect(local).toEqual(localBefore);
  });

  it("can migrate missing text and sessions without reviving stale local map keys", () => {
    const cloud = progress({
      leagueData: null,
      dailyPlanMap: { "2026-09-16": ["Gym"] },
    });
    const local = progress({
      leagueData: "local-league",
      dailyPlanMap: {
        "2026-09-15": ["Trainingstag"],
        "2026-09-16": ["Home-Workout"],
      },
    });

    const result = mergeProgressForFirstSync(cloud, local, { includeLocalMapEntries: false });

    expect(result.addedLocalData).toBe(true);
    expect(result.progress.leagueData).toBe("local-league");
    expect(result.progress.dailyPlanMap).toEqual({ "2026-09-16": ["Gym"] });
  });
});
