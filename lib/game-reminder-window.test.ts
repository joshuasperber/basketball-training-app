import { describe, expect, it } from "vitest";
import { isGameReminderDue } from "@/lib/game-reminder-window";

describe("game reminder window", () => {
  it("matches a reminder inside the dispatch tolerance", () => {
    expect(isGameReminderDue({
      date: "2026-09-15",
      startTime: "20:00",
      reminderMinutes: 120,
      timeZone: "Europe/Berlin",
      now: new Date("2026-09-15T16:05:00.000Z"),
      toleranceMinutes: 15,
    })).toBe(true);
  });

  it("ignores missing times and distant games", () => {
    expect(isGameReminderDue({ date: "2026-09-15", reminderMinutes: 120, timeZone: "Europe/Berlin" })).toBe(false);
    expect(isGameReminderDue({
      date: "2026-09-16",
      startTime: "20:00",
      reminderMinutes: 120,
      timeZone: "Europe/Berlin",
      now: new Date("2026-09-15T16:05:00.000Z"),
    })).toBe(false);
  });
});
