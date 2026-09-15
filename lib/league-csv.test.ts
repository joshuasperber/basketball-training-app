import { describe, expect, it } from "vitest";
import { applyLeagueScheduleCsv, buildLeagueScheduleCsv, parseLeagueScheduleCsv } from "@/lib/league-csv";
import { createEmptyLeagueBundle, type LeagueScheduleEntry } from "@/lib/league";

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

describe("league schedule CSV export", () => {
  const entries: LeagueScheduleEntry[] = [
    {
      id: "game-2",
      seasonId: "season-1",
      date: "2026-10-17",
      startTime: "16:30",
      kind: "game_training",
      homeTeamId: "opponent-1",
      awayTeamId: "league-own-team",
      homeScore: 70,
      awayScore: 81,
    },
    {
      id: "game-1",
      seasonId: "season-1",
      date: "2026-10-10",
      startTime: "18:00",
      kind: "game",
      homeTeamId: "league-own-team",
      awayTeamId: "opponent-1",
      venueName: "Arena; Halle 2",
      meetingTime: "16:45",
      travelMinutes: 35,
    },
  ];
  const resolveTeamName = (id: string | undefined) =>
    id === "league-own-team" ? "Spektrum" : id === "opponent-1" ? "Falcons" : "";

  it("writes games sorted by kickoff and quotes separator characters", () => {
    const csv = buildLeagueScheduleCsv(entries, resolveTeamName);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Datum;Spielzeit;Art;Heimteam;Auswärtsteam;Spielort;Adresse;Treffpunkt;Anfahrtszeit;Ergebnis");
    expect(lines[1]).toBe('10.10.2026;18:00;Ligaspiel;Spektrum;Falcons;"Arena; Halle 2";;16:45;35;');
    expect(lines[2]).toBe("17.10.2026;16:30;Testspiel;Falcons;Spektrum;;;;;70:81");
  });

  it("stays importable by the CSV parser", () => {
    const plan = parseLeagueScheduleCsv(buildLeagueScheduleCsv(entries, resolveTeamName));
    expect(plan.errors).toEqual([]);
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows[0]).toMatchObject({
      date: "2026-10-10",
      kind: "game",
      homeTeam: "Spektrum",
      awayTeam: "Falcons",
      venueName: "Arena; Halle 2",
      travelMinutes: 35,
    });
    expect(plan.rows[1]).toMatchObject({ date: "2026-10-17", kind: "game_training" });
  });
});
