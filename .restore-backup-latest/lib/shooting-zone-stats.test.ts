import { describe, expect, it } from "vitest";
import {
  aggregateShootingByZone,
  classifyBasketballShotZone,
  computeFieldGoalPercentage,
  computeThreePointPercentage,
  shootingZoneFromLabel,
  shootingZoneLabel,
  shootingZonePctKind,
  shootingZoneRows,
} from "@/lib/shooting-zone-stats";

describe("shooting-zone-stats", () => {
  it("uses NBA-style zone labels", () => {
    expect(shootingZoneLabel("at_rim")).toContain("At Rim");
    expect(shootingZoneLabel("above_break_three")).toContain("Beyond the Arc");
    expect(shootingZonePctKind("free_throw")).toBe("FT%");
    expect(shootingZonePctKind("mid_range")).toBe("FG%");
    expect(shootingZonePctKind("corner_three")).toBe("3P%");
  });

  it("maps exercise labels to standard zones", () => {
    expect(shootingZoneFromLabel("Free Throws Cluster")).toBe("free_throw");
    expect(shootingZoneFromLabel("Corner 3 Catch & Shoot")).toBe("corner_three");
    expect(shootingZoneFromLabel("Above Break 3PT")).toBe("above_break_three");
    expect(shootingZoneFromLabel("Mikan Finishes")).toBe("at_rim");
    expect(shootingZoneFromLabel("Floater Series")).toBe("in_paint");
    expect(shootingZoneFromLabel("Off-Dribble Pullup")).toBe("mid_range");
  });

  it("classifies finishing as at rim or in the paint", () => {
    expect(
      classifyBasketballShotZone({
        exerciseName: "Reverse Layups",
        exerciseSubcategory: "Finishing",
      }),
    ).toBe("at_rim");
    expect(
      classifyBasketballShotZone({
        exerciseName: "Floater Series",
        exerciseSubcategory: "Finishing",
      }),
    ).toBe("in_paint");
  });

  it("aggregates FG% and 3P% rollups", () => {
    const exerciseById = new Map([
      ["ex-ft", { subcategory: "Shooting", name: "Free Throws Cluster" }],
      ["ex-rim", { subcategory: "Finishing", name: "Mikan Finishes" }],
      ["ex-corner", { subcategory: "Shooting", name: "Corner 3 Drill" }],
      ["ex-ab", { subcategory: "Shooting", name: "Above Break 3PT" }],
      ["ex-mid", { subcategory: "Shooting", name: "Pull-Up Mid-Range" }],
    ]);
    const totals = aggregateShootingByZone(
      [
        {
          workoutSubcategory: "Shooting",
          logs: [
            { exerciseId: "ex-ft", made: 8, attempts: 10 },
            { exerciseId: "ex-rim", made: 12, attempts: 15 },
            { exerciseId: "ex-corner", made: 4, attempts: 10 },
            { exerciseId: "ex-ab", made: 3, attempts: 8 },
            { exerciseId: "ex-mid", made: 6, attempts: 12 },
          ],
        },
      ],
      exerciseById,
    );

    expect(computeThreePointPercentage(totals)).toBe(39);
    expect(computeFieldGoalPercentage(totals)).toBe(56);

    const rows = shootingZoneRows(totals);
    expect(rows.find((row) => row.zone === "free_throw")).toMatchObject({ pctKind: "FT%", pct: 80 });
    expect(rows.find((row) => row.zone === "at_rim")).toMatchObject({ pctKind: "FG%" });
    expect(rows.find((row) => row.zone === "corner_three")).toMatchObject({ pctKind: "3P%" });
  });
});
