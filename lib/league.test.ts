import { describe, expect, it } from "vitest";
import {
  LEAGUE_OWN_TEAM_ID,
  buildLeagueStandings,
  buildPlayerSeasonSummaries,
  createEmptyLeagueBundle,
  getStandingZone,
  groupLeagueScheduleByDay,
  normalizeLeagueBundle,
  normalizeLeagueStartTime,
  opponentsForSeason,
  scheduleForSeason,
  type LeagueBundle,
  type LeagueOpponent,
} from "@/lib/league";

function opponent(id: string, name: string, seasonIds = ["season-1"]): LeagueOpponent {
  return { id, seasonIds, name, strengths: "", weaknesses: "", defenseNotes: "", opponentStyles: [], bestPlayerIds: [] };
}

describe("league season management", () => {
  it("starts with a stable own team", () => {
    const bundle = createEmptyLeagueBundle();
    expect(bundle.ownTeam.id).toBe(LEAGUE_OWN_TEAM_ID);
    expect(bundle.players).toEqual([]);
  });

  it("migrates legacy opponents and games without losing their season", () => {
    const migrated = normalizeLeagueBundle({
      activeSeasonId: "season-old",
      seasons: [{ id: "season-old", name: "Alt", createdAt: "2025-01-01" }],
      opponents: [{ id: "opp-old", seasonId: "season-old", name: "Legacy Team", strengths: "Size", weaknesses: "Tempo", defenseNotes: "Zone", opponentStyles: [] }],
      schedule: [{ id: "game-old", seasonId: "season-old", opponentId: "opp-old", homeAway: "away", date: "2026-01-10", kind: "game" }],
    });
    expect(opponentsForSeason(migrated, "season-old")).toHaveLength(1);
    expect(migrated.schedule[0]).toMatchObject({ homeTeamId: "opp-old", awayTeamId: LEAGUE_OWN_TEAM_ID });
  });

  it("normalizes times and orders the schedule by date and tip-off", () => {
    const bundle: LeagueBundle = {
      ...createEmptyLeagueBundle(),
      schedule: [
        { id: "late", seasonId: "season-1", date: "2026-10-10", startTime: "20:00", kind: "game" },
        { id: "open", seasonId: "season-1", date: "2026-10-10", kind: "game" },
        { id: "early", seasonId: "season-1", date: "2026-10-10", startTime: "16:30", kind: "game" },
        { id: "first", seasonId: "season-1", date: "2026-10-09", startTime: "19:00", kind: "game" },
      ],
    };
    const schedule = scheduleForSeason(bundle, "season-1");
    expect(schedule.map((entry) => entry.id)).toEqual(["first", "early", "late", "open"]);
    expect(groupLeagueScheduleByDay(schedule).map((group) => [group.date, group.games.length])).toEqual([
      ["2026-10-09", 1],
      ["2026-10-10", 3],
    ]);
    expect(normalizeLeagueStartTime("25:10")).toBeUndefined();
    expect(normalizeLeagueStartTime("08:05")).toBe("08:05");
  });

  it("reuses the same opponent across multiple seasons", () => {
    const bundle = createEmptyLeagueBundle();
    bundle.opponents = [opponent("opp-1", "Falcons", ["season-1", "season-2"])];
    expect(opponentsForSeason(bundle, "season-1")[0]?.id).toBe("opp-1");
    expect(opponentsForSeason(bundle, "season-2")[0]?.id).toBe("opp-1");
  });

  it("builds and orders the table from completed official games only", () => {
    const bundle: LeagueBundle = {
      ...createEmptyLeagueBundle(),
      activeSeasonId: "season-1",
      seasons: [{ id: "season-1", name: "Liga", createdAt: "2026-01-01" }],
      opponents: [opponent("opp-a", "A-Team"), opponent("opp-b", "B-Team")],
      schedule: [
        { id: "g1", seasonId: "season-1", date: "2026-01-01", kind: "game", homeTeamId: LEAGUE_OWN_TEAM_ID, awayTeamId: "opp-a", homeScore: 88, awayScore: 76 },
        { id: "g2", seasonId: "season-1", date: "2026-01-02", kind: "game", homeTeamId: "opp-b", awayTeamId: LEAGUE_OWN_TEAM_ID, homeScore: 80, awayScore: 81 },
        { id: "g3", seasonId: "season-1", date: "2026-01-03", kind: "game_training", homeTeamId: "opp-a", awayTeamId: "opp-b", homeScore: 200, awayScore: 1 },
        { id: "g4", seasonId: "season-1", date: "2026-01-04", kind: "game", homeTeamId: "opp-a", awayTeamId: "opp-b", homeScore: null, awayScore: null },
      ],
    };
    const standings = buildLeagueStandings(bundle, "season-1");
    expect(standings[0]).toMatchObject({ teamId: LEAGUE_OWN_TEAM_ID, played: 2, wins: 2, tablePoints: 4, difference: 13 });
    expect(standings.find((row) => row.teamId === "opp-a")).toMatchObject({ played: 1, losses: 1, tablePoints: 1 });
    expect(standings.find((row) => row.teamId === "opp-b")).toMatchObject({ played: 1, losses: 1, tablePoints: 1 });
  });

  it("marks playoff, safe and relegation positions", () => {
    expect(getStandingZone(1)).toBe("playoffs");
    expect(getStandingZone(8)).toBe("playoffs");
    expect(getStandingZone(9)).toBe("stay");
    expect(getStandingZone(10)).toBe("stay");
    expect(getStandingZone(11)).toBe("relegation");
    expect(getStandingZone(12)).toBe("relegation");
    expect(getStandingZone(13)).toBe("outside");
  });

  it("aggregates per-player season totals and MVP awards", () => {
    const bundle: LeagueBundle = {
      ...createEmptyLeagueBundle(),
      activeSeasonId: "season-1",
      seasons: [{ id: "season-1", name: "Liga", createdAt: "2026-01-01" }],
      players: [{ id: "p1", teamId: LEAGUE_OWN_TEAM_ID, name: "Alex" }],
      schedule: [{
        id: "g1",
        seasonId: "season-1",
        date: "2026-01-01",
        kind: "game",
        homeTeamId: LEAGUE_OWN_TEAM_ID,
        awayTeamId: "opp-a",
        bestPlayerId: "p1",
        playerStats: [{ ...emptyLine("p1"), points: 21, minutes: 30, assists: 6 }],
      }],
    };
    expect(buildPlayerSeasonSummaries(bundle, "season-1").get("p1")).toMatchObject({ appearances: 1, points: 21, minutes: 30, assists: 6, mvpAwards: 1 });
  });
});

function emptyLine(playerId: string) {
  return { playerId, minutes: null, points: null, assists: null, rebounds: null, steals: null, blocks: null, turnovers: null, fouls: null, threePointersMade: null };
}
