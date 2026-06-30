import { describe, expect, it } from "vitest";
import { parseWorkoutSessionsFromProgress } from "./parse-user-progress";

describe("parseWorkoutSessionsFromProgress", () => {
  it("parses jsonb sessions and merges workout_history", () => {
    const sessions = parseWorkoutSessionsFromProgress(
      { workoutSessions: [{ id: "a", dateISO: "2026-05-10T12:00:00.000Z", workoutId: "w1", workoutName: "Run", logs: [] }] },
      JSON.stringify([{ id: "b", date: "2026-05-12", workoutId: "w2", title: "Shooting", sport: "Basketball", subcategory: "Shooting" }]),
    );
    expect(sessions).toHaveLength(2);
  });

  it("parses sessions provided as JSON string", () => {
    const sessions = parseWorkoutSessionsFromProgress(
      JSON.stringify({ workoutSessions: [{ id: "a", dateISO: "2026-05-10T12:00:00.000Z", workoutId: "w1", workoutName: "Run", logs: [] }] }),
      null,
    );
    expect(sessions).toHaveLength(1);
  });
});
