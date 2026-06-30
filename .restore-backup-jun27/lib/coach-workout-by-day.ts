import type { CoachWorkoutCatalogItem } from "@/lib/coach-training-context";
import type { DayKey, DayMode, WeekConfig } from "@/lib/planner";

const DAY_KEYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export function workoutCategoryAllowedForMode(mode: DayMode, category: string): boolean {
  switch (mode) {
    case "gym":
      return category === "Gym";
    case "basketball_training":
      return category === "Basketball";
    case "game_day":
    case "game_training":
      return category === "Basketball";
    case "recovery":
      return category === "Regeneration" || category === "Home";
    case "custom":
      return category === "Basketball" || category === "Gym" || category === "Home" || category === "Regeneration";
    case "rest":
    case "unavailable":
      return false;
    default:
      return false;
  }
}

/** Validiert KI-Zuweisungen: nur Katalog-IDs, passend zur jeweiligen Tages-Mode. */
export function sanitizeCoachWorkoutByDay(
  raw: unknown,
  week: WeekConfig,
  catalog: CoachWorkoutCatalogItem[] | undefined,
): Partial<Record<DayKey, string>> | undefined {
  if (!raw || typeof raw !== "object" || !catalog?.length) return undefined;
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const out: Partial<Record<DayKey, string>> = {};
  const obj = raw as Record<string, unknown>;
  for (const day of DAY_KEYS) {
    const wid = obj[day];
    if (typeof wid !== "string" || wid.length < 2) continue;
    const lowered = wid.trim().toLowerCase();
    if (lowered === "null" || lowered === "undefined" || lowered === "none") continue;
    const meta = byId.get(wid.trim());
    if (!meta) continue;
    const mode = week[day]?.mode;
    if (!mode) continue;
    if (!workoutCategoryAllowedForMode(mode, meta.category)) continue;
    out[day] = wid.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
