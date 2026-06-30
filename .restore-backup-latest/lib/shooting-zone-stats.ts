/**
 * Shot zones aligned with common NBA / analytics terminology:
 * - FT% (Free Throw Percentage) — separate from field goals
 * - At Rim — layups, dunks, tips (within ~4 ft of basket)
 * - In The Paint — short mid-range in the lane (floaters, hooks)
 * - Mid-Range — long mid-range / pull-up jumpers (2PT)
 * - Corner 3 / Beyond the Arc — three-point splits (3P%)
 * @see https://www.nba.com/stats/help/glossary
 * @see https://www.cleaningtheglass.com/stats/guide/player_shooting_loc
 */
export type ShootingZoneKey =
  | "free_throw"
  | "at_rim"
  | "in_paint"
  | "mid_range"
  | "corner_three"
  | "above_break_three"
  | "other";

export type ShootingZonePctKind = "FT%" | "FG%" | "3P%";

export type ShootingZoneTotals = Record<
  ShootingZoneKey,
  {
    makes: number;
    attempts: number;
  }
>;

const ZONE_ORDER: ShootingZoneKey[] = [
  "free_throw",
  "at_rim",
  "in_paint",
  "mid_range",
  "corner_three",
  "above_break_three",
  "other",
];

export const SHOOTING_ZONE_LABELS: Record<ShootingZoneKey, string> = {
  free_throw: "FT% · Freiwurf",
  at_rim: "At Rim · am Korb",
  in_paint: "In The Paint · Farbbereich",
  mid_range: "Mid-Range · Mitteldistanz",
  corner_three: "Corner 3 · Eck-Dreier",
  above_break_three: "Beyond the Arc · Dreier",
  other: "Other · Sonstige",
};

export const SHOOTING_ZONE_HINTS: Record<ShootingZoneKey, string> = {
  free_throw: "Free Throw Percentage — nicht in FG% enthalten",
  at_rim: "Layups, Dunks, Tip-ins direkt am Korb",
  in_paint: "Floaters, Hooks, Runner in der Zone",
  mid_range: "Pull-Ups & Jumpers aus Mitteldistanz (2PT)",
  corner_three: "Dreier aus den Ecken (kürzere Distanz)",
  above_break_three: "Dreier jenseits der Dreierlinie (3P%)",
  other: "Nicht eindeutig zuordenbare Würfe",
};

export function shootingZoneLabel(zone: ShootingZoneKey) {
  return SHOOTING_ZONE_LABELS[zone];
}

export function shootingZonePctKind(zone: ShootingZoneKey): ShootingZonePctKind {
  if (zone === "free_throw") return "FT%";
  if (zone === "corner_three" || zone === "above_break_three") return "3P%";
  return "FG%";
}

function normalizeLabel(value: string) {
  return value.trim().toLowerCase();
}

function isFreeThrowLabel(normalized: string) {
  return (
    normalized.includes("freiwurf") ||
    normalized.includes("free throw") ||
    /\bft\b/.test(normalized)
  );
}

function isThreePointerLabel(normalized: string) {
  return (
    normalized.includes("3 pointer") ||
    normalized.includes("3-pointer") ||
    normalized.includes("3 pointers") ||
    normalized.includes("three pointer") ||
    normalized.includes("three-point") ||
    normalized.includes("3pt") ||
    normalized.includes("3-pt") ||
    normalized.includes("3 pt") ||
    normalized.includes("deep 3") ||
    normalized.includes("step back 3") ||
    normalized.includes("stepback 3") ||
    normalized.includes("dreier") ||
    normalized.includes("3er") ||
    normalized.includes("dreipunkt")
  );
}

function isCornerThreeLabel(normalized: string) {
  return (
    normalized.includes("corner 3") ||
    normalized.includes("corner three") ||
    normalized.includes("eck") ||
    normalized.includes("corner three")
  );
}

function isAtRimLabel(normalized: string) {
  return (
    normalized.includes("layup") ||
    normalized.includes("dunk") ||
    normalized.includes("mikan") ||
    normalized.includes("tip-in") ||
    normalized.includes("tip in") ||
    normalized.includes("at rim") ||
    normalized.includes("am korb") ||
    normalized.includes("finish") ||
    normalized.includes("drive") ||
    normalized.includes("korb")
  );
}

function isInPaintLabel(normalized: string) {
  return (
    normalized.includes("floater") ||
    normalized.includes("hook") ||
    normalized.includes("runner") ||
    normalized.includes("paint") ||
    normalized.includes("post move") ||
    normalized.includes("short mid")
  );
}

function isMidRangeLabel(normalized: string) {
  return (
    normalized.includes("mid-range") ||
    normalized.includes("mid range") ||
    normalized.includes("midrange") ||
    normalized.includes("pull-up") ||
    normalized.includes("pullup") ||
    normalized.includes("pull up") ||
    normalized.includes("catch") ||
    normalized.includes("spot") ||
    normalized.includes("jumper") ||
    normalized.includes("shoot")
  );
}

export function shootingZoneFromLabel(label: string): ShootingZoneKey {
  const normalized = normalizeLabel(label);
  if (!normalized) return "other";
  if (isFreeThrowLabel(normalized)) return "free_throw";
  if (isCornerThreeLabel(normalized)) return "corner_three";
  if (isThreePointerLabel(normalized)) return "above_break_three";
  if (isAtRimLabel(normalized)) return "at_rim";
  if (isInPaintLabel(normalized)) return "in_paint";
  if (isMidRangeLabel(normalized)) return "mid_range";
  return "other";
}

export function classifyBasketballShotZone(input: {
  exerciseName?: string | null;
  exerciseSubcategory?: string | null;
  sessionSubcategory?: string | null;
}): ShootingZoneKey {
  const name = normalizeLabel(input.exerciseName ?? "");
  const subcategory = normalizeLabel(input.exerciseSubcategory ?? "");
  const sessionSubcategory = normalizeLabel(input.sessionSubcategory ?? "");
  const combined = `${name} ${subcategory} ${sessionSubcategory}`.trim();

  if (isFreeThrowLabel(name) || isFreeThrowLabel(combined)) return "free_throw";
  if (isCornerThreeLabel(name) || isCornerThreeLabel(combined)) return "corner_three";
  if (isThreePointerLabel(name) || isThreePointerLabel(combined)) return "above_break_three";

  if (subcategory === "finishing" || sessionSubcategory === "finishing") {
    return isInPaintLabel(combined) ? "in_paint" : "at_rim";
  }
  if (subcategory === "shooting" || sessionSubcategory === "shooting") {
    return "mid_range";
  }

  return shootingZoneFromLabel(combined);
}

export function emptyShootingZoneTotals(): ShootingZoneTotals {
  return {
    free_throw: { makes: 0, attempts: 0 },
    at_rim: { makes: 0, attempts: 0 },
    in_paint: { makes: 0, attempts: 0 },
    mid_range: { makes: 0, attempts: 0 },
    corner_three: { makes: 0, attempts: 0 },
    above_break_three: { makes: 0, attempts: 0 },
    other: { makes: 0, attempts: 0 },
  };
}

export function mergeShootingZoneTotals(left: ShootingZoneTotals, right: ShootingZoneTotals): ShootingZoneTotals {
  const totals = emptyShootingZoneTotals();
  for (const zone of ZONE_ORDER) {
    totals[zone].makes = left[zone].makes + right[zone].makes;
    totals[zone].attempts = left[zone].attempts + right[zone].attempts;
  }
  return totals;
}

type SessionLog = {
  made?: number | null;
  attempts?: number | null;
  exerciseId?: string;
};

type SessionEntry = {
  workoutSubcategory?: string | null;
  logs: SessionLog[];
};

type ExerciseMeta = {
  subcategory?: string;
  name?: string;
};

export function aggregateShootingByZone(
  sessions: SessionEntry[],
  exerciseById: Map<string, ExerciseMeta>,
): ShootingZoneTotals {
  const totals = emptyShootingZoneTotals();

  for (const session of sessions) {
    for (const log of session.logs) {
      const attempts = log.attempts ?? 0;
      const makes = log.made ?? 0;
      if (attempts <= 0 && makes <= 0) continue;
      const exercise = log.exerciseId ? exerciseById.get(log.exerciseId) : undefined;
      const zone = classifyBasketballShotZone({
        exerciseName: exercise?.name,
        exerciseSubcategory: exercise?.subcategory,
        sessionSubcategory: session.workoutSubcategory,
      });
      totals[zone].attempts += Math.max(attempts, makes > 0 ? makes : 0);
      totals[zone].makes += Math.max(0, makes);
    }
  }

  return totals;
}

export function computeFieldGoalPercentage(totals: ShootingZoneTotals) {
  const fieldGoalZones: ShootingZoneKey[] = [
    "at_rim",
    "in_paint",
    "mid_range",
    "corner_three",
    "above_break_three",
    "other",
  ];
  const makes = fieldGoalZones.reduce((sum, zone) => sum + totals[zone].makes, 0);
  const attempts = fieldGoalZones.reduce((sum, zone) => sum + totals[zone].attempts, 0);
  if (attempts <= 0) return null;
  return Math.round((makes / attempts) * 100);
}

export function computeThreePointPercentage(totals: ShootingZoneTotals) {
  const makes = totals.corner_three.makes + totals.above_break_three.makes;
  const attempts = totals.corner_three.attempts + totals.above_break_three.attempts;
  if (attempts <= 0) return null;
  return Math.round((makes / attempts) * 100);
}

export function shootingZoneRows(totals: ShootingZoneTotals) {
  return ZONE_ORDER.map((zone) => {
    const row = totals[zone];
    const pct = row.attempts > 0 ? Math.round((row.makes / row.attempts) * 100) : null;
    return {
      zone,
      label: shootingZoneLabel(zone),
      hint: SHOOTING_ZONE_HINTS[zone],
      pctKind: shootingZonePctKind(zone),
      ...row,
      pct,
    };
  }).filter((row) => row.attempts > 0);
}
