import { beforeEach, describe, expect, it } from "vitest";
import { appendRegenerationTagsAfterWorkoutComplete } from "@/lib/post-workout-regeneration";

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

describe("post-workout-regeneration", () => {
  beforeEach(() => {
    installBrowserStorage();
  });

  it("adds regeneration tags for today after a normal workout", () => {
    const banner = appendRegenerationTagsAfterWorkoutComplete("Basketball");
    expect(banner).toContain("Regeneration");
    const raw = window.localStorage.getItem("bt.daily-plan.v1");
    expect(raw).toContain("Regeneration");
  });

  it("skips regeneration tagging for recovery workouts", () => {
    expect(appendRegenerationTagsAfterWorkoutComplete("Regeneration")).toBeNull();
  });
});
