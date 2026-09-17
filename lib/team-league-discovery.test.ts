import { describe, expect, it } from "vitest";
import {
  chooseTeamLeagueDiscoveryCandidate,
  type TeamLeagueDiscoveryCandidate,
} from "@/lib/team-league-discovery";

function candidate(
  id: string,
  bundle: unknown | null,
  updatedAt: string | null,
): TeamLeagueDiscoveryCandidate {
  return {
    team: { id, name: `Team ${id}` },
    bundle,
    updatedAt,
    version: 1,
    history: [],
    canEdit: true,
  };
}

describe("team league discovery", () => {
  it("chooses the most recently updated shared league across memberships", () => {
    const older = candidate("older", { leagues: [{ id: "1" }] }, "2026-01-01T00:00:00.000Z");
    const newer = candidate("newer", { leagues: [{ id: "2" }] }, "2026-09-01T00:00:00.000Z");

    expect(chooseTeamLeagueDiscoveryCandidate([older, newer])).toBe(newer);
  });

  it("connects one empty membership but does not guess among several empty teams", () => {
    const only = candidate("only", null, null);
    expect(chooseTeamLeagueDiscoveryCandidate([only])).toBe(only);
    expect(chooseTeamLeagueDiscoveryCandidate([only, candidate("other", null, null)])).toBeNull();
  });
});
