import { describe, expect, it } from "vitest";
import { createEmptyLeagueBundle } from "@/lib/league";
import { describeScheduleChange } from "@/lib/server/web-push";

describe("schedule push changes", () => {
  it("announces a newly added game", () => {
    const before = createEmptyLeagueBundle();
    const after = { ...before, schedule: [{ id: "g1", seasonId: "s1", date: "2026-10-10", startTime: "18:00", kind: "game" as const, homeTeamId: before.ownTeam.id, awayTeamId: "rivals" }] };
    expect(describeScheduleChange(before, after)?.title).toBe("Neues Spiel im Team");
  });

  it("announces when a scheduled game becomes final", () => {
    const before = createEmptyLeagueBundle();
    before.schedule = [{ id: "g1", seasonId: "s1", date: "2026-10-10", kind: "game", homeTeamId: before.ownTeam.id, awayTeamId: "rivals" }];
    const after = { ...before, schedule: [{ ...before.schedule[0], homeScore: 80, awayScore: 70 }] };
    expect(describeScheduleChange(before, after)?.body).toContain("final");
  });
});
