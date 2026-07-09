import { applyWeekConfigToCalendar } from "@/lib/activity-calendar";
import { buildCoachRequestPayload } from "@/lib/coach-request-payload";
import { hasAiConsent } from "@/lib/ai-consent";
import { sanitizeCoachWorkoutByDay } from "@/lib/coach-workout-by-day";
import { getIsoWeekKey, writeCoachLlmWeeklyMarkers, weekConfigSignature } from "@/lib/coach-trigger";
import { markLocalProgressDirty, pushProgressToCloudWithRetry } from "@/lib/progress-sync";
import type { DayKey, WeekConfig } from "@/lib/planner";
import { mergeAiWeekConfigPreservingUserMinutes } from "@/lib/week-config-merge";

export type WeeklyPlanAiSyncResult = {
  ok: boolean;
  message: string;
  cloudSynced?: boolean;
};

export type WeeklyPlanAiPreview = {
  headline: string;
  bullets: string[];
  weekConfig: WeekConfig;
  coachWorkoutByDay: Partial<Record<DayKey, string>> | null;
  changedDays: DayKey[];
};

const DAY_LABELS: Record<DayKey, string> = {
  monday: "Mo",
  tuesday: "Di",
  wednesday: "Mi",
  thursday: "Do",
  friday: "Fr",
  saturday: "Sa",
  sunday: "So",
};

function readCurrentWeekConfig(): WeekConfig | null {
  try {
    const raw = window.localStorage.getItem("profile_cache_v4");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { weekConfig?: WeekConfig };
    return parsed.weekConfig ?? null;
  } catch {
    return null;
  }
}

export function diffWeekConfigDays(current: WeekConfig | null, next: WeekConfig): DayKey[] {
  if (!current) return Object.keys(next) as DayKey[];
  return (Object.keys(next) as DayKey[]).filter((day) => {
    const before = current[day];
    const after = next[day];
    return before?.mode !== after?.mode || (before?.minutes ?? 0) !== (after?.minutes ?? 0);
  });
}

export function formatWeekConfigDaySummary(day: DayKey, config: WeekConfig[DayKey]) {
  const label = DAY_LABELS[day];
  if (config.mode === "game_day") return `${label}: Spiel`;
  if (config.mode === "rest" || config.mode === "unavailable") return `${label}: frei`;
  return `${label}: ${config.minutes} Min · ${config.mode}`;
}

export async function persistWeekFromAi(
  week: WeekConfig,
  coachWorkoutByDay?: Partial<Record<DayKey, string>> | null,
): Promise<boolean> {
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
  markLocalProgressDirty();
  const cloudSynced = await pushProgressToCloudWithRetry();
  writeCoachLlmWeeklyMarkers(getIsoWeekKey(), weekConfigSignature(week));
  window.dispatchEvent(new Event("bt:plan-updated"));
  window.dispatchEvent(new Event("bt:weekly-suggestions-updated"));
  window.dispatchEvent(new Event("storage"));
  return cloudSynced;
}

export async function fetchWeeklyPlanAiPreview(skipCache = false): Promise<{
  ok: boolean;
  message: string;
  preview?: WeeklyPlanAiPreview;
}> {
  if (!hasAiConsent()) {
    return {
      ok: false,
      message: "KI-Wochenplan erfordert Einwilligung im Profil unter Datenschutz.",
    };
  }
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
    const existingWeek = readCurrentWeekConfig() ?? undefined;
    const mergedWeek = mergeAiWeekConfigPreservingUserMinutes(json.weekConfig, existingWeek);
    const changedDays = diffWeekConfigDays(existingWeek ?? null, mergedWeek);
    return {
      ok: true,
      message: "Vorschlag bereit.",
      preview: {
        headline: json.headline ?? "KI-Wochenplan",
        bullets: json.bullets ?? [],
        weekConfig: mergedWeek,
        coachWorkoutByDay: safeAssignments ?? null,
        changedDays,
      },
    };
  } catch {
    return { ok: false, message: "Wochen-Sync fehlgeschlagen." };
  }
}

export async function applyWeeklyPlanAiPreview(preview: WeeklyPlanAiPreview): Promise<WeeklyPlanAiSyncResult> {
  const cloudSynced = await persistWeekFromAi(preview.weekConfig, preview.coachWorkoutByDay);
  if (!cloudSynced) {
    return {
      ok: true,
      cloudSynced: false,
      message:
        "Wochenplan lokal übernommen — Cloud-Sync steht noch aus (offline oder Konflikt). Prüfe das Sync-Banner.",
    };
  }
  return {
    ok: true,
    cloudSynced: true,
    message: "Wochenplan übernommen und in der Cloud gespeichert.",
  };
}

/** @deprecated Nutze fetchWeeklyPlanAiPreview + applyWeeklyPlanAiPreview */
export async function syncWeeklyPlanFromAi(skipCache = false): Promise<WeeklyPlanAiSyncResult> {
  const fetched = await fetchWeeklyPlanAiPreview(skipCache);
  if (!fetched.ok || !fetched.preview) return { ok: false, message: fetched.message };
  return applyWeeklyPlanAiPreview(fetched.preview);
}
