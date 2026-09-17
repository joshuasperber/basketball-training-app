import { describe, expect, it } from "vitest";
import {
  acceptOptionalDigitString,
  calculateShootingMissesInput,
  buildSessionLogFromSet,
  normalizeMetricKeysForCategory,
  sessionLogHasShootingData,
  shouldUseShootingInputs,
  parseNonNegativeNumber,
} from "@/lib/workout-metrics";

describe("parseNonNegativeNumber", () => {
  it("treats empty, null and invalid values as 0", () => {
    expect(parseNonNegativeNumber(null)).toBe(0);
    expect(parseNonNegativeNumber(undefined)).toBe(0);
    expect(parseNonNegativeNumber("")).toBe(0);
    expect(parseNonNegativeNumber("abc")).toBe(0);
  });

  it("parses valid numbers", () => {
    expect(parseNonNegativeNumber("0")).toBe(0);
    expect(parseNonNegativeNumber("12")).toBe(12);
  });
});

describe("acceptOptionalDigitString", () => {
  it("keeps empty input empty so 0 can be deleted", () => {
    expect(acceptOptionalDigitString("")).toBe("");
    expect(acceptOptionalDigitString("0")).toBe("0");
    expect(acceptOptionalDigitString("36")).toBe("36");
    expect(acceptOptionalDigitString("12a")).toBeNull();
  });
});

describe("calculateShootingMissesInput", () => {
  it("calculates misses from reps minus makes", () => {
    expect(calculateShootingMissesInput("20", "16")).toBe("4");
  });

  it("stays empty until both inputs are present and never becomes negative", () => {
    expect(calculateShootingMissesInput("20", "")).toBe("");
    expect(calculateShootingMissesInput("", "16")).toBe("");
    expect(calculateShootingMissesInput("10", "12")).toBe("0");
  });
});

describe("flexible exercise metrics", () => {
  it("distinguishes ordinary repetitions from make/miss shooting data", () => {
    expect(sessionLogHasShootingData({ attempts: 20, made: null, misses: null })).toBe(false);
    expect(sessionLogHasShootingData({ attempts: 20, made: 18, misses: 2 })).toBe(true);
  });

  it("keeps plain basketball reps independent from shooting inputs", () => {
    expect(normalizeMetricKeysForCategory("Basketball", ["reps", "time"])).toEqual(["reps", "time"]);
    expect(shouldUseShootingInputs(["reps", "time"])).toBe(false);
  });

  it("adds a complete shooting trio only when makes or misses are selected", () => {
    expect(normalizeMetricKeysForCategory("Basketball", ["makes", "time"])).toEqual([
      "reps",
      "makes",
      "misses",
      "time",
    ]);
  });

  it("supports target-free completion tracking", () => {
    expect(normalizeMetricKeysForCategory("Regeneration", ["completed"])).toEqual(["completed"]);
  });

  it("stores minutes as seconds while preserving reps", () => {
    const log = buildSessionLogFromSet({
      exercise: {
        id: "timed-reps",
        name: "Timed reps",
        category: "Basketball",
        subcategory: "Handles",
        metricKeys: ["reps", "time"],
        timeUnit: "minutes",
      },
      log: { reps: "60", time: "2", completed: true },
    });
    expect(log.attempts).toBe(60);
    expect(log.timeSeconds).toBe(120);
    expect(log.made).toBeNull();
    expect(log.misses).toBeNull();
  });

  it("keeps legacy time values in seconds when no unit was stored", () => {
    const log = buildSessionLogFromSet({
      exercise: {
        id: "legacy-timed-reps",
        name: "Legacy timed reps",
        category: "Basketball",
        subcategory: "Handles",
        metricKeys: ["reps", "time"],
      },
      log: { reps: "20", time: "60", completed: true },
    });
    expect(log.timeSeconds).toBe(60);
    expect(log.attempts).toBe(20);
  });
});
