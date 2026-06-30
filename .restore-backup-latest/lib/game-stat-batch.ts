import type { GameStatEntry } from "@/lib/game-stats";

export type GameStatBatchInput = {
  minutes: number | null;
  points: number | null;
  assists: number | null;
  rebounds: number | null;
  steals: number | null;
  intensity: number | null;
  gamesPlayed: number;
  /** true = eingegebene Werte sind Summen über alle Spiele */
  statsAreTotals: boolean;
};

export function normalizeGameStatBatch(input: GameStatBatchInput): Pick<
  GameStatEntry,
  "minutes" | "points" | "assists" | "rebounds" | "steals" | "intensity" | "gamesPlayed" | "statsAreTotals"
> {
  const games = Math.max(1, Math.round(input.gamesPlayed) || 1);
  const divisor = input.statsAreTotals ? games : 1;

  const scale = (value: number | null) => {
    if (value == null) return null;
    const scaled = value / divisor;
    return Number.isFinite(scaled) ? Math.round(scaled * 10) / 10 : null;
  };

  return {
    gamesPlayed: games,
    statsAreTotals: input.statsAreTotals,
    minutes: scale(input.minutes),
    points: scale(input.points),
    assists: scale(input.assists),
    rebounds: scale(input.rebounds),
    steals: scale(input.steals),
    intensity: input.intensity,
  };
}
