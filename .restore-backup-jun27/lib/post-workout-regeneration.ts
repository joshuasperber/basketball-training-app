import { toLocalDateKey } from "@/lib/workout";

/** After a non-regeneration workout, tag today for recovery in the daily plan. */
export function appendRegenerationTagsAfterWorkoutComplete(sport: string): string | null {
  if (sport === "Regeneration") return null;

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
