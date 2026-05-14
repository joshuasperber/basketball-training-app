import { describe, expect, it } from "vitest";
import {
  buildWorkoutCatalogForCoach,
  countSubcategories14d,
  sessionsCompletedInLastDays,
  type CoachSession14dItem,
} from "@/lib/coach-training-context";
import type { WorkoutSessionEntry } from "@/lib/session-storage";

describe("sessionsCompletedInLastDays", () => {
  it("filters by cutoff", () => {
    const now = new Date();
    const old = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const sessions: WorkoutSessionEntry[] = [
      {
        id: "a",
        dateISO: old,
        workoutId: "w1",
        workoutName: "Old",
        logs: [{ exerciseId: "e", completedValue: 1, note: "" }],
      },
      {
        id: "b",
        dateISO: recent,
        workoutId: "w2",
        workoutName: "New",
        logs: [{ exerciseId: "e", completedValue: 1, note: "" }],
      },
    ];
    const out = sessionsCompletedInLastDays(sessions, 14);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("b");
  });
});

describe("countSubcategories14d", () => {
  it("aggregates keys", () => {
    const rows: CoachSession14dItem[] = [
      {
        date: "2026-05-01",
        workoutId: "w1",
        workoutName: "A",
        category: "Gym",
        subcategory: "Core",
        setCount: 3,
        avgRpe: 7,
      },
      {
        date: "2026-05-02",
        workoutId: "w2",
        workoutName: "B",
        category: "Gym",
        subcategory: "Core",
        setCount: 4,
        avgRpe: 8,
      },
      {
        date: "2026-05-03",
        workoutId: "w3",
        workoutName: "C",
        category: "Basketball",
        subcategory: "Shooting",
        setCount: 6,
        avgRpe: null,
      },
    ];
    const counts = countSubcategories14d(rows);
    expect(counts["Gym:Core"]).toBe(2);
    expect(counts["Basketball:Shooting"]).toBe(1);
  });
});

describe("buildWorkoutCatalogForCoach", () => {
  it("respects limit", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: `w-${i}`,
      name: `W${i}`,
      category: "Gym" as const,
      subcategory: "Core",
      level: 1,
      exerciseIds: [] as string[],
    }));
    expect(buildWorkoutCatalogForCoach(rows as import("@/lib/training-data").Workout[], 3)).toHaveLength(3);
  });
});
