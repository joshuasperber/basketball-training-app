import { describe, expect, it } from "vitest";
import {
  getDefaultWorkoutProgress,
  getWorkoutExerciseStatus,
  isWorkoutProgressFullyCompleted,
  type WorkoutPlan,
} from "@/lib/workout";

const workout: WorkoutPlan = {
  id: "status-test",
  title: "Status Test",
  sport: "Basketball",
  subcategory: "Shooting",
  exercises: [
    { name: "Erste Übung", sets: [{ targetKg: 0, targetReps: 10 }] },
    { name: "Letzte Übung", sets: [{ targetKg: 0, targetReps: 10 }] },
  ],
};

describe("workout completion status", () => {
  it("treats entered values as in progress until the set was explicitly completed", () => {
    const progress = getDefaultWorkoutProgress("2026-09-08", workout);
    progress.logs["0-0"] = { weight: "", reps: "10" };

    expect(getWorkoutExerciseStatus(workout, progress, 0)).toBe("in_progress");
    expect(isWorkoutProgressFullyCompleted(workout, progress)).toBe(false);
  });

  it("does not complete the workout just because the last exercise was completed", () => {
    const progress = getDefaultWorkoutProgress("2026-09-08", workout);
    progress.logs["1-0"] = {
      weight: "",
      reps: "10",
      completedAtIso: "2026-09-08T12:00:00.000Z",
    };

    expect(getWorkoutExerciseStatus(workout, progress, 0)).toBe("not_started");
    expect(getWorkoutExerciseStatus(workout, progress, 1)).toBe("completed");
    expect(isWorkoutProgressFullyCompleted(workout, progress)).toBe(false);
  });

  it("completes only after every exercise has a completed set", () => {
    const progress = getDefaultWorkoutProgress("2026-09-08", workout);
    progress.logs["0-0"] = { weight: "", reps: "10", completed: true };
    progress.logs["1-0"] = {
      weight: "",
      reps: "10",
      completedAtIso: "2026-09-08T12:05:00.000Z",
    };

    expect(isWorkoutProgressFullyCompleted(workout, progress)).toBe(true);
  });
});
