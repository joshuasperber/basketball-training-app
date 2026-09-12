import { describe, expect, it } from "vitest";
import { isUuid, postgrestPath } from "@/lib/server/postgrest-query";

describe("postgrest query safety", () => {
  it("accepts UUIDs and rejects fragments or query syntax", () => {
    expect(isUuid("a3bb189e-8bf9-4fdb-a755-7b721c18e45c")).toBe(true);
    expect(isUuid("a3bb189e-8bf9-4fdb-a755-7b721c18e45c#&user_id=eq.victim")).toBe(false);
    expect(isUuid("eq.anything")).toBe(false);
  });

  it("encodes every PostgREST query value", () => {
    expect(
      postgrestPath("team_members", {
        team_id: "eq.a3bb189e-8bf9-4fdb-a755-7b721c18e45c#fragment",
        select: "*,teams(id,name)",
      }),
    ).toBe(
      "team_members?team_id=eq.a3bb189e-8bf9-4fdb-a755-7b721c18e45c%23fragment&select=*%2Cteams%28id%2Cname%29",
    );
  });
});
