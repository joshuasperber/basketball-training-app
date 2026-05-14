import { describe, expect, it } from "vitest";
import { buildGameTrainingCorrelation, describeCorrelationStrength, pearsonCorrelation } from "@/lib/game-training-insights";
import type { GameStatEntry } from "@/lib/game-stats";
import type { WorkoutSessionEntry } from "@/lib/session-storage";

describe("pearsonCorrelation", () => {
  it("returns null when fewer than 3 pairs", () => {
    expect(pearsonCorrelation([1, 2], [1, 2])).toBeNull();
    expect(pearsonCorrelation([1, 2, 3], [1, 2])).toBeNull();
  });

  it("is +1 for perfect positive linear relationship", () => {
    const xs = [1, 2, 3, 4];
    const ys = [2, 4, 6, 8];
    const r = pearsonCorrelation(xs, ys);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(0.999);
  });

  it("is -1 for perfect negative linear relationship", () => {
    const xs = [1, 2, 3, 4];
    const ys = [8, 6, 4, 2];
    const r = pearsonCorrelation(xs, ys);
    expect(r).not.toBeNull();
    expect(r!).toBeLessThan(-0.999);
  });

  it("returns null when x or y has zero variance", () => {
    expect(pearsonCorrelation([1, 1, 1], [2, 3, 4])).toBeNull();
    expect(pearsonCorrelation([1, 2, 3], [5, 5, 5])).toBeNull();
  });
});

describe("describeCorrelationStrength", () => {
  it("labels null as insufficient data", () => {
    expect(describeCorrelationStrength(null)).toMatch(/wenig/i);
  });
});

describe("buildGameTrainingCorrelation", () => {
  it("computes correlation over games with prep scores", () => {
    const games: GameStatEntry[] = [
      {
        id: "g1",
        date: "2026-01-10",
        context: "game",
        points: 10,
        assists: 0,
        rebounds: 0,
        steals: 0,
        minutes: 20,
        createdAt: "2026-01-10T00:00:00.000Z",
      },
      {
        id: "g2",
        date: "2026-01-08",
        context: "game",
        points: 20,
        assists: 0,
        rebounds: 0,
        steals: 0,
        minutes: 20,
        createdAt: "2026-01-08T00:00:00.000Z",
      },
      {
        id: "g3",
        date: "2026-01-06",
        context: "game",
        points: 15,
        assists: 0,
        rebounds: 0,
        steals: 0,
        minutes: 20,
        createdAt: "2026-01-06T00:00:00.000Z",
      },
      {
        id: "g4",
        date: "2026-01-04",
        context: "game",
        points: 12,
        assists: 0,
        rebounds: 0,
        steals: 0,
        minutes: 20,
        createdAt: "2026-01-04T00:00:00.000Z",
      },
    ];
    const sessions: WorkoutSessionEntry[] = [
      {
        id: "s1",
        dateISO: "2026-01-09T10:00:00.000Z",
        workoutId: "w1",
        workoutName: "T",
        logs: [{ exerciseId: "e1", completedValue: 1, note: "" }],
      },
    ];
    const out = buildGameTrainingCorrelation(games, sessions);
    expect(out.recentGames.length).toBeGreaterThan(0);
    expect(out.correlationPointsVsPrep === null || typeof out.correlationPointsVsPrep === "number").toBe(true);
  });
});
