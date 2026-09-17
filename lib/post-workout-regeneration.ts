import { toLocalDateKey } from "@/lib/workout";

function normalizeWorkoutLabel(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Recovery and mobility sessions already cover the intended post-workout regeneration. */
export function workoutAlreadyCoversRecovery(sport: string, subcategory?: string | null): boolean {
  const normalizedSport = normalizeWorkoutLabel(sport);
  if (normalizedSport === "regeneration") return true;
  if (normalizedSport !== "home") return false;

  const normalizedSubcategory = normalizeWorkoutLabel(subcategory);
  return normalizedSubcategory === "recovery" || normalizedSubcategory === "mobility";
}

/** After a workout without recovery coverage, tag today for recovery in the daily plan. */
export function appendRegenerationTagsAfterWorkoutComplete(
  sport: string,
  subcategory?: string | null,
): string | null {
  if (workoutAlreadyCoversRecovery(sport, subcategory)) return null;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = toLocalDateKey(tomorrow);
  const todayKey = toLocalDateKey(new Date());
  const dailyRaw = window.localStorage.getItem("bt.daily-plan.v1");
  const daily = dailyRaw ? (JSON.parse(dailyRaw) as Record<string, string[]>) : {};
  const tomorrowHasRecovery = (daily[tomorrowKey] ?? []).some((tag) => tag === "Regeneration");
  if (tomorrowHasRecovery) return null;

  const todayTags = new Set([...(daily[todayKey] ?? []), "Regeneration", "Recovery:Mobilität & Dehnung"]);
  daily[todayKey] = Array.from(todayTags);
  window.localStorage.setItem("bt.daily-plan.v1", JSON.stringify(daily));
  return "Stark! Workout abgeschlossen ✅ Regeneration wurde für heute hinzugefügt.";
}
