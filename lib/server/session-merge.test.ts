import { describe, expect, it } from "vitest";
import { mergeSessionDatabases } from "@/lib/server/session-merge";
import type { SessionDatabase, WorkoutSessionEntry } from "@/lib/session-types";

function session(id: string, workoutId: string, value: number, allowMultiple = false): WorkoutSessionEntry {
  return {
    id,
    dateISO: "2026-09-16T12:00:00.000Z",
    workoutId,
    workoutName: workoutId,
    allowMultiple,
    logs: [{ exerciseId: id, completedValue: value, completed: true, note: "" }],
  };
}

const empty: SessionDatabase = { workoutSessions: [], exerciseHistory: {} };

describe("mergeSessionDatabases", () => {
  it("keeps several standalone exercises on the same day", () => {
    const result = mergeSessionDatabases(
      { ...empty, workoutSessions: [session("one", "single-exercise-session", 10)] },
      { ...empty, workoutSessions: [session("two", "single-exercise-session", 20)] },
    );
    expect(result.workoutSessions.map((entry) => entry.id).sort()).toEqual(["one", "two"]);
  });

  it("replaces an updated session by id", () => {
    const result = mergeSessionDatabases(
      { ...empty, workoutSessions: [session("same", "workout", 10)] },
      { ...empty, workoutSessions: [session("same", "workout", 18)] },
    );
    expect(result.workoutSessions).toHaveLength(1);
    expect(result.workoutSessions[0]?.logs[0]?.completedValue).toBe(18);
  });

  it("replaces the previous non-repeatable workout from the same day", () => {
    const result = mergeSessionDatabases(
      { ...empty, workoutSessions: [session("old", "workout", 10)] },
      { ...empty, workoutSessions: [session("new", "workout", 12)] },
    );
    expect(result.workoutSessions.map((entry) => entry.id)).toEqual(["new"]);
  });
});
