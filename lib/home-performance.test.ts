import { describe, expect, it } from "vitest";
import type { Exercise } from "@/lib/training-data";
import type { WorkoutSessionEntry } from "@/lib/session-storage";
import { buildHomeExerciseGoalStats, isHomePerformanceExercise } from "@/lib/home-performance";

function exercise(input: Partial<Exercise> & Pick<Exercise, "id" | "name" | "subcategory">): Exercise {
  return {
    durationMin: 10,
    category: "Home",
    metricKeys: ["reps"],
    trackingType: "reps",
    ...input,
  };
}

describe("home performance stats", () => {
  it("excludes only Recovery and Mobility while retaining custom subcategories", () => {
    expect(isHomePerformanceExercise(exercise({ id: "recovery", name: "Recovery", subcategory: "Recovery" }))).toBe(false);
    expect(isHomePerformanceExercise(exercise({ id: "mobility", name: "Mobility", subcategory: "mobility" }))).toBe(false);
    expect(isHomePerformanceExercise(exercise({ id: "strength", name: "Strength", subcategory: "Strength" }))).toBe(true);
  });

  it("builds targets, latest values and best values per exercise", () => {
    const homeExercise = exercise({
      id: "mountain-climbers",
      name: "Mountain Climbers",
      subcategory: "Conditioning",
      metricKeys: ["reps", "time"],
      targetByMetric: { reps: 40, time: 30 },
    });
    const sessions: WorkoutSessionEntry[] = [
      {
        id: "new",
        dateISO: "2026-09-18T10:00:00.000Z",
        workoutId: "home-2",
        workoutName: "Home 2",
        logs: [{ exerciseId: homeExercise.id, completedValue: 45, attempts: 45, timeSeconds: 28, note: "" }],
      },
      {
        id: "old",
        dateISO: "2026-09-17T10:00:00.000Z",
        workoutId: "home-1",
        workoutName: "Home 1",
        logs: [{ exerciseId: homeExercise.id, completedValue: 50, attempts: 50, timeSeconds: 25, note: "" }],
      },
    ];

    expect(buildHomeExerciseGoalStats([homeExercise], sessions)).toEqual([
      {
        exerciseId: homeExercise.id,
        exerciseName: homeExercise.name,
        subcategory: "Conditioning",
        sessionCount: 2,
        latestDateISO: "2026-09-18T10:00:00.000Z",
        metrics: [
          { metric: "reps", target: 40, latest: 45, best: 50 },
          { metric: "time", target: 30, latest: 28, best: 28 },
        ],
      },
    ]);
  });
});
