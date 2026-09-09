import { describe, expect, it } from "vitest";
import { createEmptyLeagueBundle, type LeagueOpponent } from "@/lib/league";
import {
  buildTeamOpponentOptions,
  normalizeTeamOpponentName,
  updateLeagueOpponentScouting,
} from "@/lib/team-league-opponents";
import type { OpponentScoutingEntry } from "@/lib/team-types";

function opponent(overrides: Partial<LeagueOpponent> = {}): LeagueOpponent {
  return {
    id: "league-1",
    seasonIds: ["season-1"],
    name: "MK Ultras",
    strengths: "Rebounding",
    weaknesses: "Transition Defense",
    defenseNotes: "2-3-Zone",
    opponentStyles: ["big"],
    bestPlayerIds: [],
    ...overrides,
  };
}

function scouting(overrides: Partial<OpponentScoutingEntry> = {}): OpponentScoutingEntry {
  return {
    id: "scout-1",
    opponentName: "  mk   ultras ",
    styles: ["shooting"],
    notes: "Früh attackieren",
    updatedAt: "2026-09-09T10:00:00.000Z",
    ...overrides,
  };
}

describe("team and league opponent connection", () => {
  it("normalizes opponent names for a stable cross-feature match", () => {
    expect(normalizeTeamOpponentName("  MK   ULTRAS ")).toBe("mk ultras");
  });

  it("merges league and scouting data without duplicate opponents", () => {
    const options = buildTeamOpponentOptions([opponent()], [scouting()]);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      name: "MK Ultras",
      source: "league-and-scouting",
      leagueOpponentId: "league-1",
      scoutingId: "scout-1",
      notes: "Früh attackieren",
    });
    expect(options[0]?.styles).toEqual(["big", "shooting"]);
  });

  it("keeps league-only opponents available for scouting and matchup", () => {
    const options = buildTeamOpponentOptions([opponent()], []);
    expect(options[0]).toMatchObject({
      source: "league",
      name: "MK Ultras",
      strengths: "Rebounding",
      weaknesses: "Transition Defense",
      defenseNotes: "2-3-Zone",
    });
  });

  it("writes team scouting styles back to the linked league opponent", () => {
    const bundle = createEmptyLeagueBundle();
    bundle.opponents = [opponent()];
    const updated = updateLeagueOpponentScouting(bundle, "mk ultras", ["fast", "physical"], "Full-Court Press");
    expect(updated.opponents[0]).toMatchObject({
      opponentStyles: ["fast", "physical"],
      notes: "Full-Court Press",
    });
  });
});
