import type { DayKey } from "@/lib/planner";

export const WEEKLY_SUGGESTIONS_CACHE_KEY = "bt.weekly-suggestion-by-day.v1";

export type CachedDaySuggestion = {
  workoutId?: string;
  title: string;
  durationMin: number;
  notes: string;
  sport: string;
  subcategory: string;
  exerciseIds?: string[];
  exercises?: string[];
};

export type CachedDaySuggestions = {
  suggested: CachedDaySuggestion;
  autoSuggested: CachedDaySuggestion;
};

export function writeWeeklySuggestionsCache(
  suggested: Partial<Record<DayKey, CachedDaySuggestion>>,
  autoSuggested?: Partial<Record<DayKey, CachedDaySuggestion>>,
) {
  if (typeof window === "undefined") return;
  const next: Partial<Record<DayKey, CachedDaySuggestions>> = {};
  const dayKeys = new Set([
    ...Object.keys(suggested),
    ...Object.keys(autoSuggested ?? {}),
  ]) as Set<DayKey>;

  dayKeys.forEach((dayKey) => {
    const headline = suggested[dayKey];
    const auto = autoSuggested?.[dayKey] ?? headline;
    const resolvedSuggested = headline ?? auto;
    const resolvedAuto = auto ?? headline;
    if (!resolvedSuggested || !resolvedAuto) return;
    next[dayKey] = { suggested: resolvedSuggested, autoSuggested: resolvedAuto };
  });

  window.localStorage.setItem(WEEKLY_SUGGESTIONS_CACHE_KEY, JSON.stringify(next));
}

function isLegacyEntry(value: unknown): value is CachedDaySuggestion {
  return Boolean(value && typeof value === "object" && "title" in value && !("suggested" in value));
}

export function readWeeklySuggestionsCache(): Partial<Record<DayKey, CachedDaySuggestions>> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(WEEKLY_SUGGESTIONS_CACHE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<Record<DayKey, CachedDaySuggestions | CachedDaySuggestion>>;
    const normalized: Partial<Record<DayKey, CachedDaySuggestions>> = {};
    for (const [dayKey, entry] of Object.entries(parsed) as Array<[DayKey, CachedDaySuggestions | CachedDaySuggestion]>) {
      if (!entry) continue;
      if (isLegacyEntry(entry)) {
        normalized[dayKey] = { suggested: entry, autoSuggested: entry };
      } else {
        normalized[dayKey] = entry;
      }
    }
    return normalized;
  } catch {
    return {};
  }
}
