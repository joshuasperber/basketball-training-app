import { beforeEach, describe, expect, it, vi } from "vitest";
import { weeklyRecoverySuggestionSlotVisible } from "@/lib/weekly-regeneration";

vi.mock("@/lib/activity-calendar", () => ({
  storedRegenerationSignals: vi.fn(() => false),
}));

describe("weeklyRecoverySuggestionSlotVisible", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false on explicit rest display (disabled day)", () => {
    expect(
      weeklyRecoverySuggestionSlotVisible({
        manualDateKey: "2026-05-10",
        dayManualEntries: [],
        isDayDisabled: true,
        headlineSuggestedWorkout: { sport: "Basketball", durationMin: 45 },
        autoSuggestedWorkout: { sport: "Basketball" },
        hiddenCardIds: new Set(),
      }),
    ).toBe(false);
  });

  it("returns false when recovery card is hidden", () => {
    expect(
      weeklyRecoverySuggestionSlotVisible({
        manualDateKey: "2026-05-10",
        dayManualEntries: [],
        isDayDisabled: false,
        headlineSuggestedWorkout: { sport: "Basketball", durationMin: 45 },
        autoSuggestedWorkout: { sport: "Basketball" },
        hiddenCardIds: new Set(["recovery-2026-05-10"]),
      }),
    ).toBe(false);
  });

  it("returns true for a normal training day without regeneration coverage", () => {
    expect(
      weeklyRecoverySuggestionSlotVisible({
        manualDateKey: "2026-05-10",
        dayManualEntries: [],
        isDayDisabled: false,
        headlineSuggestedWorkout: { sport: "Basketball", durationMin: 45 },
        autoSuggestedWorkout: { sport: "Basketball" },
        hiddenCardIds: new Set(),
      }),
    ).toBe(true);
  });
});
