import { describe, expect, it } from "vitest";
import {
  acceptOptionalDigitString,
  calculateShootingMissesInput,
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
