import { aggregateGameShootingByZone } from "@/lib/game-shooting-splits";
import type { GameStatEntry } from "@/lib/game-stats";
import type { WorkoutSessionEntry } from "@/lib/session-storage";
import {
  aggregateShootingByZone,
  computeFieldGoalPercentage,
  computeThreePointPercentage,
  mergeShootingZoneTotals,
  shootingZoneRows,
  type ShootingZoneTotals,
} from "@/lib/shooting-zone-stats";

export type ShootingZoneStatsBundle = {
  totals: ShootingZoneTotals;
  rows: ReturnType<typeof shootingZoneRows>;
  fieldGoalPct: number | null;
  threePointPct: number | null;
};

export function buildShootingZoneStatsBundle(
  sessions: WorkoutSessionEntry[],
  games: GameStatEntry[],
): ShootingZoneStatsBundle | null {
  const basketballSessions = sessions.filter(
    (session) => session.workoutCategory === "Basketball" || !session.workoutCategory,
  );
  const workoutTotals = aggregateShootingByZone(basketballSessions, new Map());
  const gameTotals = aggregateGameShootingByZone(games);
  const totals = mergeShootingZoneTotals(workoutTotals, gameTotals);
  const rows = shootingZoneRows(totals);
  if (rows.length === 0) return null;

  return {
    totals,
    rows,
    fieldGoalPct: computeFieldGoalPercentage(totals),
    threePointPct: computeThreePointPercentage(totals),
  };
}
