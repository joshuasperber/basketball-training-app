import { describe, expect, it } from "vitest";
import { aggregateGameShootingByZone, normalizeGameShootingSplits } from "@/lib/game-shooting-splits";
import { mergeShootingZoneTotals, shootingZoneRows } from "@/lib/shooting-zone-stats";

describe("game-shooting-splits", () => {
  it("normalizes and filters invalid rows", () => {
    expect(
      normalizeGameShootingSplits([
        { zone: "at_rim", makes: 4, attempts: 6 },
        { zone: "other", makes: 1, attempts: 1 },
        { zone: "at_rim", makes: 0, attempts: 0 },
      ]),
    ).toEqual([{ zone: "at_rim", makes: 4, attempts: 6 }]);
  });

  it("merges game splits into zone totals", () => {
    const gameTotals = aggregateGameShootingByZone([
      {
        shootingSplits: [
          { zone: "corner_three", makes: 2, attempts: 5 },
          { zone: "above_break_three", makes: 1, attempts: 4 },
        ],
      },
    ]);
    const merged = mergeShootingZoneTotals(
      {
        free_throw: { makes: 0, attempts: 0 },
        at_rim: { makes: 3, attempts: 4 },
        in_paint: { makes: 0, attempts: 0 },
        mid_range: { makes: 0, attempts: 0 },
        corner_three: { makes: 0, attempts: 0 },
        above_break_three: { makes: 0, attempts: 0 },
        other: { makes: 0, attempts: 0 },
      },
      gameTotals,
    );
    const rows = shootingZoneRows(merged);
    expect(rows.find((row) => row.zone === "at_rim")).toMatchObject({ makes: 3, attempts: 4 });
    expect(rows.find((row) => row.zone === "corner_three")).toMatchObject({ makes: 2, attempts: 5 });
  });
});
