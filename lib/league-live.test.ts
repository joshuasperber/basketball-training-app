import { describe, expect, it } from "vitest";
import type { LeagueScheduleEntry } from "@/lib/league";
import {
  formatLiveClock,
  getLiveClockSeconds,
  getQuarterTeamFouls,
  recordLeagueLiveEvent,
  setLeagueLiveQuarter,
  toggleLeagueLiveClock,
  undoLastLeagueLiveEvent,
} from "@/lib/league-live";

function game(): LeagueScheduleEntry {
  return {
    id: "game-1",
    seasonId: "season-1",
    date: "2026-10-10",
    kind: "game",
    status: "scheduled",
    homeTeamId: "home",
    awayTeamId: "away",
    homeScore: null,
    awayScore: null,
    playerStats: [],
  };
}

describe("league live game", () => {
  it("runs and pauses the FIBA game clock", () => {
    const started = toggleLeagueLiveClock(game(), 1_000);
    expect(getLiveClockSeconds(started.liveState!, 6_500)).toBe(595);
    const paused = toggleLeagueLiveClock(started, 6_500);
    expect(paused.liveState).toMatchObject({ clockSeconds: 595, runningSince: undefined });
    expect(formatLiveClock(595)).toBe("09:55");
  });

  it("records points, threes and player fouls and can undo them", () => {
    let current = recordLeagueLiveEvent(game(), { type: "score", teamId: "home", playerId: "p1", value: 3 }, new Date("2026-01-01"), () => "event-1");
    current = recordLeagueLiveEvent(current, { type: "foul", teamId: "home", playerId: "p1", value: 1 }, new Date("2026-01-01"), () => "event-2");
    expect(current.homeScore).toBe(3);
    expect(current.playerStats?.[0]).toMatchObject({ points: 3, threePointersMade: 1, fouls: 1 });
    expect(getQuarterTeamFouls(current, "home")).toBe(1);
    const undone = undoLastLeagueLiveEvent(current);
    expect(undone.playerStats?.[0]?.fouls).toBe(0);
    expect(getQuarterTeamFouls(undone, "home")).toBe(0);
  });

  it("resets the clock when changing quarter", () => {
    const next = setLeagueLiveQuarter(game(), 5);
    expect(next.liveState).toMatchObject({ quarter: 5, clockSeconds: 600, runningSince: undefined });
  });
});
