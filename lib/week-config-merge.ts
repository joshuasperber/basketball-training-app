import type { DayKey, WeekConfig } from "@/lib/planner";

const DAY_ORDER: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/**
 * Übernimmt KI-/Server-`weekConfig` (Modi & Minuten aus Plan), behält aber pro Tag die **vom Nutzer
 * gesetzten Minuten**, wenn der Modus unverändert bleibt — damit Profil-Verfügbarkeit nicht
 * bei jedem Coach-Sync verloren geht.
 */
export function mergeAiWeekConfigPreservingUserMinutes(incoming: WeekConfig, existing: WeekConfig | null | undefined): WeekConfig {
  if (!existing) return incoming;
  const out: WeekConfig = { ...incoming };
  for (const day of DAY_ORDER) {
    const inc = out[day];
    const prev = existing[day];
    if (!inc || !prev) continue;
    if (prev.mode === inc.mode) {
      out[day] = { ...inc, minutes: prev.minutes };
    }
  }
  return out;
}
