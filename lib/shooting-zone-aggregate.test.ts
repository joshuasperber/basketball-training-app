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
        context: "game",
        opponentLabel: "Test",
        minutes: null,
        points: 10,
        assists: null,
        rebounds: null,
        steals: null,
        shootingSplits: [{ zone: "corner_three", makes: 2, attempts: 5 }],
        createdAt: "2026-06-01T12:00:00.000Z",
      },
    ];
    const sessions: WorkoutSessionEntry[] = [];
    const bundle = buildShootingZoneStatsBundle(sessions, games);
    expect(bundle?.totals.corner_three.attempts).toBe(5);
    expect(bundle?.totals.corner_three.makes).toBe(2);
  });
});
