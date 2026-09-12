import { describe, expect, it } from "vitest";
import { isValidEmailAddress } from "@/lib/auth-validation";

describe("auth validation", () => {
  it("accepts normal addresses and rejects malformed input", () => {
    expect(isValidEmailAddress(" user@example.com ")).toBe(true);
    expect(isValidEmailAddress("user@example")).toBe(false);
    expect(isValidEmailAddress("user @example.com")).toBe(false);
    expect(isValidEmailAddress("@example.com")).toBe(false);
  });
});
