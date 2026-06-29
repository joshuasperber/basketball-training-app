import { describe, expect, it } from "vitest";
import { normalizeGameStatBatch } from "@/lib/game-stat-batch";

describe("normalizeGameStatBatch", () => {
  it("computes per-game averages from totals", () => {
    const result = normalizeGameStatBatch({
      minutes: 80,
      points: 36,
      assists: 10,
      rebounds: 20,
      steals: 4,
      intensity: 7,
      gamesPlayed: 4,
      statsAreTotals: true,
    });
    expect(result.gamesPlayed).toBe(4);
    expect(result.points).toBe(9);
    expect(result.minutes).toBe(20);
  });
});
