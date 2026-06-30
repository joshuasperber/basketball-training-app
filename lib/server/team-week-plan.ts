import type { DayKey, WeekConfig } from "@/lib/planner";
import type { TeamMemberWeekPlan } from "@/lib/team-types";

const DAY_ORDER: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export const DAY_LABELS_DE: Record<DayKey, string> = {
  monday: "Mo",
  tuesday: "Di",
  wednesday: "Mi",
  thursday: "Do",
  friday: "Fr",
  saturday: "Sa",
  sunday: "So",
};

export const MODE_LABELS_DE: Record<string, string> = {
  unavailable: "—",
  rest: "Pause",
  recovery: "Regeneration",
  game_day: "Spieltag",
  game_training: "Spieltraining",
  basketball_training: "Basketball",
  gym: "Gym",
  custom: "Custom",
};

export function parseWeekConfigFromProgress(progress: {
  profile_week_config?: string | null;
  profile_cache?: string | null;
} | null): WeekConfig | null {
  if (!progress) return null;

  if (progress.profile_week_config) {
    try {
      const parsed = JSON.parse(progress.profile_week_config) as WeekConfig;
      if (parsed?.monday) return parsed;
    } catch {
      // fall through
    }
  }

  if (progress.profile_cache) {
    try {
      const parsed = JSON.parse(progress.profile_cache) as { weekConfig?: WeekConfig };
      if (parsed.weekConfig?.monday) return parsed.weekConfig;
    } catch {
      return null;
    }
  }

  return null;
}

export function buildMemberWeekPlanView(
  member: { id: string; user_id: string; display_name: string | null },
  progress: { profile_week_config?: string | null; profile_cache?: string | null; profile_username?: string | null } | null,
  displayNameFallback: string,
): TeamMemberWeekPlan | null {
  const week = parseWeekConfigFromProgress(progress);
  if (!week) return null;

  return {
    memberId: member.id,
    userId: member.user_id,
    displayName: member.display_name ?? progress?.profile_username ?? displayNameFallback,
    days: DAY_ORDER.map((day) => {
      const config = week[day] ?? { mode: "unavailable", minutes: 0 };
      return {
        day,
        mode: config.mode,
        minutes: config.minutes,
        label: MODE_LABELS_DE[config.mode] ?? config.mode,
      };
    }),
  };
}
