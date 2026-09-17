import { beforeEach, describe, expect, it } from "vitest";
import {
  GAME_STATS_KEY,
  deleteGameStatForLeagueGame,
  filterGameStats,
  loadGameStats,
  upsertGameStat,
} from "@/lib/game-stats";

function installBrowserStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage, dispatchEvent: () => true },
  });
}

function game(overrides: Partial<Parameters<typeof upsertGameStat>[0]> = {}) {
  return {
    date: "2026-09-16",
    context: "game" as const,
    opponentLabel: "Gegner",
    minutes: 24,
    points: 12,
    assists: 3,
    rebounds: 4,
    steals: 1,
    ...overrides,
  };
}

describe("game stats persistence", () => {
  beforeEach(() => installBrowserStorage());

  it("keeps multiple games with the same date and context", () => {
    const first = upsertGameStat(game({ opponentLabel: "Team A" }));
    const second = upsertGameStat(game({ opponentLabel: "Team B" }));

    expect(second.id).not.toBe(first.id);
    expect(loadGameStats()).toHaveLength(2);
    expect(loadGameStats().map((entry) => entry.opponentLabel)).toEqual(["Team B", "Team A"]);
  });

  it("updates only the entry addressed by id", () => {
    const first = upsertGameStat(game({ opponentLabel: "Team A" }));
    const second = upsertGameStat(game({ opponentLabel: "Team B" }));
    upsertGameStat(game({ id: first.id, opponentLabel: "Team A aktualisiert", points: 18 }));

    const stored = loadGameStats();
    expect(stored).toHaveLength(2);
    expect(stored.find((entry) => entry.id === first.id)?.points).toBe(18);
    expect(stored.find((entry) => entry.id === second.id)?.opponentLabel).toBe("Team B");
  });

  it("uses the stable league game id for updates", () => {
    const first = upsertGameStat(game({ leagueGameId: "league-game-1", points: 8 }));
    const updated = upsertGameStat(game({ leagueGameId: "league-game-1", points: 14 }));

    expect(updated.id).toBe(first.id);
    expect(loadGameStats()).toHaveLength(1);
    expect(loadGameStats()[0]?.points).toBe(14);
  });

  it("removes only one legacy match when several games share a date", () => {
    upsertGameStat(game({ opponentLabel: "Team A" }));
    upsertGameStat(game({ opponentLabel: "Team B" }));

    expect(deleteGameStatForLeagueGame("missing-league-id", "2026-09-16", "game")).toBe(true);
    expect(loadGameStats()).toHaveLength(1);
  });

  it("filters Spieltage and Test-/Trainingsspiele independently", () => {
    const entries = [
      upsertGameStat(game({ opponentLabel: "Liga" })),
      upsertGameStat(game({ context: "game_training", opponentLabel: "Test" })),
    ];

    expect(filterGameStats(entries, { context: "game" }).map((entry) => entry.opponentLabel)).toEqual(["Liga"]);
    expect(filterGameStats(entries, { context: "game_training" }).map((entry) => entry.opponentLabel)).toEqual(["Test"]);
    expect(window.localStorage.getItem(GAME_STATS_KEY)).toBeTruthy();
  });
});
