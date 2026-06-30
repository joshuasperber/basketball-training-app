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

export type WeeklyPlanAiPreview = {
  headline: string;
  bullets: string[];
  weekConfig: WeekConfig;
  coachWorkoutByDay: Partial<Record<DayKey, string>> | null;
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

export async function fetchWeeklyPlanAiPreview(skipCache = false): Promise<{
  ok: boolean;
  message: string;
  preview?: WeeklyPlanAiPreview;
}> {
  try {
    const payload = buildCoachRequestPayload();
    const response = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ ...payload, intent: "weekly_plan", skipCache }),
    });
    if (response.status === 401) {
      return { ok: false, message: "Bitte einloggen für den KI-Wochenplan." };
    }
    const json = (await response.json()) as {
      weekConfig?: WeekConfig;
      coachWorkoutByDay?: Partial<Record<DayKey, string>>;
      headline?: string;
      bullets?: string[];
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
    return {
      ok: true,
      message: "Vorschlag bereit.",
      preview: {
        headline: json.headline ?? "KI-Wochenplan",
        bullets: json.bullets ?? [],
        weekConfig: mergedWeek,
        coachWorkoutByDay: safeAssignments ?? null,
      },
    };
  } catch {
    return { ok: false, message: "Wochen-Sync fehlgeschlagen." };
  }
}

export function applyWeeklyPlanAiPreview(preview: WeeklyPlanAiPreview): WeeklyPlanAiSyncResult {
  persistWeekFromAi(preview.weekConfig, preview.coachWorkoutByDay);
  return { ok: true, message: "Wochenplan wurde übernommen und ins Weekly synchronisiert." };
}

/** @deprecated Nutze fetchWeeklyPlanAiPreview + applyWeeklyPlanAiPreview */
export async function syncWeeklyPlanFromAi(skipCache = false): Promise<WeeklyPlanAiSyncResult> {
  const fetched = await fetchWeeklyPlanAiPreview(skipCache);
  if (!fetched.ok || !fetched.preview) return { ok: false, message: fetched.message };
  return applyWeeklyPlanAiPreview(fetched.preview);
}
