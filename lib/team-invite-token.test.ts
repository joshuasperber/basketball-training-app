import { describe, expect, it } from "vitest";
import { parseJoinInviteToken } from "./team-invite-token";

describe("parseJoinInviteToken", () => {
  it("accepts plain token", () => {
    expect(parseJoinInviteToken("bt-abc123def4567890abcd")).toBe("bt-abc123def4567890abcd");
  });

  it("extracts token from full invite URL", () => {
    expect(parseJoinInviteToken("http://localhost:3001/team?join=bt-abc123def4567890abcd")).toBe(
      "bt-abc123def4567890abcd",
    );
  });

  it("extracts token from partial path", () => {
    expect(parseJoinInviteToken("/team?join=bt-abc123def4567890abcd")).toBe("bt-abc123def4567890abcd");
  });
});
