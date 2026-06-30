import { describe, expect, it } from "vitest";
import { getDefaultWeekConfig } from "@/lib/planner";
import { isActiveTrainingDay, isReminderDueNow, nextOccurrencesForActiveDays } from "@/lib/workout-reminders";

describe("workout reminders", () => {
  it("detects active training days", () => {
    const weekConfig = getDefaultWeekConfig();
    weekConfig.friday = { mode: "basketball_training", minutes: 45 };
    const friday = new Date("2026-06-26T10:00:00");
    expect(isActiveTrainingDay(weekConfig, friday)).toBe(true);
  });

  it("marks reminder due after configured time on active day", () => {
    const weekConfig = getDefaultWeekConfig();
    weekConfig.friday = { mode: "basketball_training", minutes: 45 };
    const now = new Date("2026-06-26T09:30:00");
    expect(
      isReminderDueNow(
        weekConfig,
        { enabled: true, time: "08:00" },
        now,
      ),
    ).toBe(true);
  });

  it("builds upcoming occurrences for active days", () => {
    const weekConfig = getDefaultWeekConfig();
    weekConfig.friday = { mode: "basketball_training", minutes: 45 };
    const now = new Date("2026-06-24T12:00:00");
    const occurrences = nextOccurrencesForActiveDays(weekConfig, "08:00", now);
    expect(occurrences.length).toBeGreaterThan(0);
    expect(occurrences[0]?.fireAt).toBeGreaterThan(now.getTime());
  });
});
