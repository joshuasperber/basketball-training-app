import { describe, expect, it } from "vitest";
import {
  canonicalizeWarmupWorkout,
  getWarmupWorkouts,
  isWarmupWorkout,
} from "@/lib/warmup-workouts";
import type { Workout } from "@/lib/training-data";

function workout(name: string, subcategory: string, category: Workout["category"] = "Basketball"): Workout {
  return { id: name, name, category, subcategory, level: 1, exerciseIds: [] };
}

describe("warmup workouts", () => {
  it("recognizes common Warm-Up spellings in name or subcategory", () => {
    expect(isWarmupWorkout(workout("Game Warmup", "Handles"))).toBe(true);
    expect(isWarmupWorkout(workout("Pregame", "Warm-Up"))).toBe(true);
    expect(isWarmupWorkout(workout("Warm up Routine", "Shooting"))).toBe(true);
  });

  it("only returns basketball warm-ups", () => {
    const result = getWarmupWorkouts([
      workout("Basketball Warmup", "Handles"),
      workout("Gym Warmup", "Warm-Up", "Gym"),
      workout("Shooting", "Shooting"),
    ]);
    expect(result.map((entry) => entry.name)).toEqual(["Basketball Warmup"]);
  });

  it("shows inferred warm-ups in the canonical Warm-Up subcategory", () => {
    expect(canonicalizeWarmupWorkout(workout("Game Warmup", "Handles")).subcategory).toBe("Warm-Up");
  });
});
