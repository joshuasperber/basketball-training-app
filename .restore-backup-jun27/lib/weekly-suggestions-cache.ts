import type { DayKey } from "@/lib/planner";

export const WEEKLY_SUGGESTIONS_CACHE_KEY = "bt.weekly-suggestion-by-day.v1";

export type CachedDaySuggestion = {
  workoutId?: string;
  title: string;
  durationMin: number;
  notes: string;
  sport: string;
  subcategory: string;
};

export function writeWeeklySuggestionsCache(suggestions: Partial<Record<DayKey, CachedDaySuggestion>>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WEEKLY_SUGGESTIONS_CACHE_KEY, JSON.stringify(suggestions));
}

export function readWeeklySuggestionsCache(): Partial<Record<DayKey, CachedDaySuggestion>> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(WEEKLY_SUGGESTIONS_CACHE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Partial<Record<DayKey, CachedDaySuggestion>>;
  } catch {
    return {};
  }
}
