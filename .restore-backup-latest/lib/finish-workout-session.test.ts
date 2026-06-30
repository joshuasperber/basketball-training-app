import { describe, expect, it } from "vitest";
import { setLogHasStarted } from "@/lib/finish-workout-session";

describe("setLogHasStarted", () => {
  it("returns false for empty logs", () => {
    expect(setLogHasStarted(undefined)).toBe(false);
    expect(setLogHasStarted({ reps: "", makes: "" })).toBe(false);
  });

  it("returns true when reps or makes are entered", () => {
    expect(setLogHasStarted({ reps: "10" })).toBe(true);
    expect(setLogHasStarted({ makes: "8" })).toBe(true);
  });
});
