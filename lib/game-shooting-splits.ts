import {
  SHOOTING_ZONE_LABELS,
  type ShootingZoneKey,
  type ShootingZoneTotals,
  emptyShootingZoneTotals,
  mergeShootingZoneTotals,
} from "@/lib/shooting-zone-stats";

export type GameShootingSplit = {
  zone: ShootingZoneKey;
  makes: number;
  attempts: number;
};

const GAME_TRACK_ZONE_ORDER: ShootingZoneKey[] = [
  "free_throw",
  "at_rim",
  "in_paint",
  "mid_range",
  "corner_three",
  "above_break_three",
];

export const GAME_TRACK_SHOOTING_ZONE_OPTIONS = GAME_TRACK_ZONE_ORDER.map((zone) => ({
  zone,
  label: SHOOTING_ZONE_LABELS[zone],
}));

export function normalizeGameShootingSplits(splits: GameShootingSplit[]): GameShootingSplit[] {
  return splits
    .map((split) => ({
      zone: split.zone,
      makes: Math.max(0, Math.round(split.makes)),
      attempts: Math.max(0, Math.round(split.attempts)),
    }))
    .filter((split) => split.attempts > 0 || split.makes > 0)
    .filter((split) => GAME_TRACK_ZONE_ORDER.includes(split.zone));
}

export function aggregateGameShootingByZone(
  gameStats: Array<{ shootingSplits?: GameShootingSplit[] }>,
): ShootingZoneTotals {
  const totals = emptyShootingZoneTotals();
  for (const entry of gameStats) {
    for (const split of entry.shootingSplits ?? []) {
      if (!GAME_TRACK_ZONE_ORDER.includes(split.zone)) continue;
      totals[split.zone].makes += Math.max(0, split.makes);
      totals[split.zone].attempts += Math.max(Math.max(0, split.attempts), split.makes > 0 ? split.makes : 0);
    }
  }
  return totals;
}

export { mergeShootingZoneTotals };
