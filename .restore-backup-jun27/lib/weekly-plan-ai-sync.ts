import { applyWeekConfigToCalendar } from "@/lib/activity-calendar";
import { buildCoachRequestPayload } from "@/lib/coach-request-payload";
import { sanitizeCoachWorkoutByDay } from "@/lib/coach-workout-by-day";
import { getIsoWeekKey, writeCoachLlmWeeklyMarkers, weekConfigSignature } from "@/lib/coach-trigger";
import { pushProgressToCloud } from "@/lib/progress-sync";
import type { DayKey, WeekConfig } from "@/lib/planner";
import { mergeAiWeekConfigPreservingUserMinutes } from "@/lib/week-config-merge";

export type WeeklyPlanAiSyncResult = {
  ok: boolean;
  message: string;
};

export function persistWeekFromAi(week: WeekConfig, coachWorkoutByDay?: Partial<Record<DayKey, string>> | null) {
  const key = "profile_cache_v4";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(window.localStorage.getItem(key) || "{}") as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  parsed.weekConfig = week;
  if (coachWorkoutByDay != null) {
    if (Object.keys(coachWorkoutByDay).length === 0) {
      delete parsed.coachWorkoutByDay;
    } else {
      parsed.coachWorkoutByDay = coachWorkoutByDay;
    }
  }
  window.localStorage.setItem(key, JSON.stringify(parsed));
  applyWeekConfigToCalendar(week, 28);
  void pushProgressToCloud();
  writeCoachLlmWeeklyMarkers(getIsoWeekKey(), weekConfigSignature(week));
  window.dispatchEvent(new Event("bt:plan-updated"));
  window.dispatchEvent(new Event("bt:weekly-suggestions-updated"));
  window.dispatchEvent(new Event("storage"));
}

export async function syncWeeklyPlanFromAi(skipCache = false): Promise<WeeklyPlanAiSyncResult> {
  try {
    const payload = buildCoachRequestPayload();
    const response = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, intent: "weekly_plan", skipCache }),
    });
    const json = (await response.json()) as {
      weekConfig?: WeekConfig;
      coachWorkoutByDay?: Partial<Record<DayKey, string>>;
      error?: string;
    };
    if (!json.weekConfig) {
      return { ok: false, message: json.error ?? "Wochenplan konnte nicht geladen werden." };
    }
    const safeAssignments = sanitizeCoachWorkoutByDay(
      json.coachWorkoutByDay,
      json.weekConfig,
      payload.workoutCatalog,
    );
    let existingWeek: WeekConfig | undefined;
    try {
      const raw = window.localStorage.getItem("profile_cache_v4");
      if (raw) {
        const parsed = JSON.parse(raw) as { weekConfig?: WeekConfig };
        if (parsed.weekConfig) existingWeek = parsed.weekConfig;
      }
    } catch {
      existingWeek = undefined;
    }
    const mergedWeek = mergeAiWeekConfigPreservingUserMinutes(json.weekConfig, existingWeek);
    persistWeekFromAi(mergedWeek, safeAssignments ?? null);
    return { ok: true, message: "Wochenplan wurde per KI abgestimmt und ins Weekly übernommen." };
  } catch {
    return { ok: false, message: "Wochen-Sync fehlgeschlagen — Weekly zeigt weiter deine gespeicherte Woche." };
  }
}
