import { describe, expect, it } from "vitest";
import { createEmptyLeagueBundle } from "@/lib/league";
import { mergeTeamLeagueBundles } from "@/lib/team-league-auto-merge";

describe("team league automatic merge", () => {
  it("keeps a remotely added opponent and a locally added game", () => {
    const base = createEmptyLeagueBundle();
    const remote = {
      ...base,
      opponents: [{
        id: "opponent-1",
        seasonIds: [],
        name: "Falcons",
        strengths: "Shooting",
        weaknesses: "",
        defenseNotes: "",
        opponentStyles: [],
        bestPlayerIds: [],
      }],
    };
    const local = {
      ...base,
      schedule: [{
        id: "game-1",
        seasonId: "season-1",
        date: "2026-09-20",
        kind: "game" as const,
      }],
    };

    const merged = mergeTeamLeagueBundles(base, remote, local);
    expect(merged.opponents.map((entry) => entry.id)).toEqual(["opponent-1"]);
    expect(merged.schedule.map((entry) => entry.id)).toEqual(["game-1"]);
  });
});
