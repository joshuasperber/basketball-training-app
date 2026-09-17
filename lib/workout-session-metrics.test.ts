import { describe, expect, it } from "vitest";
import { sessionHasCompletedWork } from "@/lib/workout-session-metrics";

describe("sessionHasCompletedWork", () => {
  it("counts completed standalone exercises as training work", () => {
    expect(
      sessionHasCompletedWork({
        id: "single-pound-dribbles",
        dateISO: "2026-09-16T12:00:00.000Z",
        workoutId: "single-exercise-session",
        workoutName: "Einzel-Exercise: Pound Dribbles",
        allowMultiple: true,
        logs: [{
          exerciseId: "bb-handles-1",
          completedValue: 20,
          attempts: 20,
          made: 18,
          misses: 2,
          completed: true,
          note: "",
        }],
      }),
    ).toBe(true);
  });

  it("counts time-, distance- and points-only logs without a legacy completed flag", () => {
    const base = {
      id: "metric-only",
      dateISO: "2026-09-16T12:00:00.000Z",
      workoutId: "metric-workout",
      workoutName: "Metric workout",
    };

    for (const metricLog of [
      { timeSeconds: 120 },
      { distanceMeters: 800 },
      { points: 12 },
    ]) {
      expect(
        sessionHasCompletedWork({
          ...base,
          logs: [{ exerciseId: "exercise", completedValue: null, note: "", ...metricLog }],
        }),
      ).toBe(true);
    }
  });
});
