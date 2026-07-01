import { describe, expect, it } from "vitest";
import { applyShareLevelToMemberView } from "./team-member-view";
import type { TeamMemberView } from "@/lib/team-types";

const sampleView: TeamMemberView = {
  id: "m1",
  userId: "user-a",
  role: "player",
  displayName: "Alex",
  position: "PG",
  playStyle: "shooter",
  shareLevel: "summary",
  form: { score: 72, tone: "green", trend: "up", reasons: ["3 Workouts diese Woche", "Gute RPE-Balance"] },
  recentGames: 2,
  recentWorkouts: 4,
};

describe("applyShareLevelToMemberView", () => {
  it("returns full view for the member themselves", () => {
    const result = applyShareLevelToMemberView(sampleView, "user-a", "summary", "user-a");
    expect(result).toEqual(sampleView);
  });

  it("returns full view when share level is full", () => {
    const result = applyShareLevelToMemberView(
      { ...sampleView, shareLevel: "full" },
      "user-a",
      "full",
      "user-b",
    );
    expect(result.playStyle).toBe("shooter");
    expect(result.form.reasons).toHaveLength(2);
  });

  it("redacts details for summary viewers", () => {
    const result = applyShareLevelToMemberView(sampleView, "user-a", "summary", "user-b");
    expect(result.playStyle).toBeNull();
    expect(result.form.score).toBe(72);
    expect(result.recentGames).toBe(0);
    expect(result.shootingZoneTotals).toBeNull();
    expect(result.gameTrainingInsight).toBeNull();
    expect(result.form.reasons[0]).toContain("Volles Teilen");
  });
});
