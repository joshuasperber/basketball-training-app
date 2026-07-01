import { describe, expect, it } from "vitest";
import { buildShootingZoneStatsBundle } from "@/lib/shooting-zone-aggregate";
import type { GameStatEntry } from "@/lib/game-stats";
import type { WorkoutSessionEntry } from "@/lib/session-storage";

describe("buildShootingZoneStatsBundle", () => {
  it("merges game shooting splits into zone totals", () => {
    const games: GameStatEntry[] = [
      {
        id: "g1",
        date: "2026-06-01",
        opponent: "Test",
        points: 10,
        shootingSplits: [{ zone: "corner_three", makes: 2, attempts: 5 }],
      },
    ];
    const sessions: WorkoutSessionEntry[] = [];
    const bundle = buildShootingZoneStatsBundle(sessions, games);
    expect(bundle?.totals.corner_three.attempts).toBe(5);
    expect(bundle?.totals.corner_three.makes).toBe(2);
  });
});
