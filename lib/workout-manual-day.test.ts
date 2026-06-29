import { describe, expect, it } from "vitest";
import { buildManualWorkoutPlanFromEntry } from "@/lib/workout-manual-day";
import type { ManualDayWorkout } from "@/lib/workout-page-utils";

describe("workout-manual-day", () => {
  it("builds a rest-day plan without exercises", () => {
    const entry: ManualDayWorkout = {
      id: "manual-day-1",
      title: "Ruhetag",
      sport: "Rest",
      subcategory: "Rest",
      notes: "",
      exerciseIds: [],
    };
    expect(buildManualWorkoutPlanFromEntry(entry, [])).toEqual({
      id: "manual-day-1",
      title: "Ruhetag",
      sport: "Rest",
      subcategory: "Rest",
      durationMin: undefined,
      exercises: [],
    });
  });

  it("maps exercise ids into a workout plan", () => {
    const entry: ManualDayWorkout = {
      id: "manual-day-2",
      title: "Push",
      sport: "Gym",
      subcategory: "Oberkörper",
      notes: "",
      exerciseIds: ["ex-1"],
    };
    const plan = buildManualWorkoutPlanFromEntry(entry, [
      {
        id: "ex-1",
        name: "Bench Press",
        category: "Gym",
        subcategory: "Oberkörper",
        durationMin: 10,
        setCount: 2,
        trackingType: "weight",
        targetValue: 8,
      } as never,
    ]);
    expect(plan?.exercises).toHaveLength(1);
    expect(plan?.exercises[0].name).toBe("Bench Press");
    expect(plan?.exercises[0].sets).toHaveLength(2);
  });
});
