import { beforeEach, describe, expect, it } from "vitest";
import { buildDayWorkoutCards } from "@/lib/day-workout-cards";
import type { CachedDaySuggestion } from "@/lib/weekly-suggestions-cache";

function installBrowserStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage },
  });
}

describe("buildDayWorkoutCards", () => {
  beforeEach(() => {
    installBrowserStorage();
  });

  it("includes manual and auto workout cards together", () => {
    const manualEntry = {
      id: "manual-1",
      title: "Custom Shooting",
      sport: "Basketball" as const,
      subcategory: "Shooting",
      notes: "Manuell geplant.",
      exerciseIds: [],
      durationMin: 30,
    };
    const autoSuggested: CachedDaySuggestion = {
      title: "Handles Session",
      durationMin: 45,
      notes: "Auto",
      sport: "Basketball",
      subcategory: "Handles",
    };

    const cards = buildDayWorkoutCards({
      dayIndex: 1,
      dateKey: "2026-06-27",
      dayKey: "monday",
      dayManualEntries: [manualEntry],
      suggestedWorkout: manualEntry as unknown as CachedDaySuggestion,
      autoSuggestedWorkout: autoSuggested,
      profilePlan: { minutes: 45, sessionType: "basketball" },
      dailyTags: ["Trainingstag"],
      exercisesById: {},
    });

    expect(cards.some((card) => card.manualWorkoutId === "manual-1")).toBe(true);
    expect(cards.some((card) => card.title === "Handles Session")).toBe(true);
  });

  it("adds game and warmup cards for spieltag", () => {
    const cards = buildDayWorkoutCards({
      dayIndex: 6,
      dateKey: "2026-06-28",
      dayKey: "saturday",
      profilePlan: { minutes: 0, sessionType: "game" },
      dailyTags: ["Spieltag"],
      exercisesById: {},
      warmupCatalogWorkouts: [
        {
          id: "warmup-1",
          name: "Game Warm-Up",
          category: "Basketball",
          subcategory: "Warm-Up",
          level: 1,
          exerciseIds: [],
          notes: "",
        },
      ],
    });

    expect(cards.some((card) => card.kind === "game")).toBe(true);
    expect(cards.some((card) => card.workoutId === "warmup-1")).toBe(true);
  });
});
