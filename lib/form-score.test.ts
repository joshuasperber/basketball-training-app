import { describe, expect, it } from "vitest";
import { computeFormScore } from "@/lib/form-score";
import type { GameStatEntry } from "@/lib/game-stats";
import type { WorkoutSessionEntry } from "@/lib/session-storage";

describe("computeFormScore", () => {
  it("returns higher score with solid games and moderate load", () => {
    const today = new Date().toISOString();
    const sessions: WorkoutSessionEntry[] = [
      {
        id: "s1",
        workoutId: "w1",
        workoutName: "Shooting",
        dateISO: today,
        logs: [{ exerciseId: "e1", completedValue: 10, note: "", rpe: 6 }],
      },
    ];
    const games: GameStatEntry[] = [
      {
        id: "g1",
        date: today.slice(0, 10),
        context: "game",
        minutes: 28,
        points: 14,
        assists: 3,
        rebounds: 5,
        steals: 1,
        createdAt: today,
      },
    ];
    const result = computeFormScore({ sessions, games, windowDays: 14 });
    expect(result.score).toBeGreaterThanOrEqual(45);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
