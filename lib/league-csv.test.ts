import { describe, expect, it } from "vitest";
import { applyLeagueScheduleCsv, parseLeagueScheduleCsv } from "@/lib/league-csv";
import { createEmptyLeagueBundle } from "@/lib/league";

describe("league schedule CSV import", () => {
  it("parses German and ISO dates with comma or semicolon columns", () => {
    const plan = parseLeagueScheduleCsv([
      "Datum;Spielzeit;Art;Heimteam;Auswärtsteam;Spielort;Treffpunkt",
      "10.10.2026;18:00;Ligaspiel;Spektrum;Falcons;Arena;16:45",
      "2026-10-17;16:30;Testspiel;Wolves;Spektrum;;15:15",
    ].join("\n"));
    expect(plan.errors).toEqual([]);
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows[0]).toMatchObject({ date: "2026-10-10", kind: "game", venueName: "Arena" });
    expect(plan.rows[1]).toMatchObject({ kind: "game_training", meetingTime: "15:15" });
  });

  it("creates reusable opponents and skips duplicate games", () => {
    const bundle = createEmptyLeagueBundle();
    bundle.ownTeam.name = "Spektrum";
    bundle.seasons = [{ id: "season-1", name: "Liga", startDate: "2026-09-01", endDate: "2027-05-31", createdAt: "2026-01-01" }];
    const plan = parseLeagueScheduleCsv([
      "Datum;Zeit;Heimteam;Auswärtsteam",
      "10.10.2026;18:00;Spektrum;Falcons",
      "10.10.2026;18:00;Spektrum;Falcons",
      "10.10.2028;18:00;Spektrum;Too Late",
    ].join("\n"));
    let id = 0;
    const result = applyLeagueScheduleCsv(bundle, "season-1", plan, (prefix) => `${prefix}-${++id}`);
    expect(result.imported).toBe(1);
    expect(result.skippedLines).toEqual([3, 4]);
    expect(result.createdOpponentNames).toEqual(["Falcons"]);
    expect(result.bundle.opponents[0]?.seasonIds).toEqual(["season-1"]);
  });
});
