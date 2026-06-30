import { describe, expect, it } from "vitest";
import {
  deriveSmartWorkoutTitle,
  normalizeExerciseFamily,
  roundUpToFiveMinutes,
  roundWorkoutMinutes,
} from "@/lib/workout-page-utils";

describe("workout-page-utils", () => {
  it("normalizes exercise family names", () => {
    expect(normalizeExerciseFamily("Crossover - Rechts 3")).toBe("crossover");
    expect(normalizeExerciseFamily("Pull-Up - Left")).toBe("pull-up");
  });

  it("rounds workout minutes up to 5-minute blocks with buffer", () => {
    expect(roundWorkoutMinutes(12)).toBe(15);
    expect(roundUpToFiveMinutes(12)).toBe(15);
    expect(roundUpToFiveMinutes(0)).toBe(0);
  });

  it("derives smart workout titles", () => {
    expect(deriveSmartWorkoutTitle("Gym", [])).toBe("Manuelles Workout");
    expect(
      deriveSmartWorkoutTitle("Gym", [
        { name: "Bench Press", subcategory: "Oberkörper" } as never,
      ]),
    ).toBe("Bench Press");
  });
});
