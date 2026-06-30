import { beforeEach, describe, expect, it } from "vitest";
import { buildLocalProgressSnapshot } from "@/lib/progress-sync";
import { REMINDER_PREFS_KEY } from "@/lib/workout-reminders";

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

describe("progress-sync snapshot", () => {
  beforeEach(() => {
    installBrowserStorage();
  });

  it("reads reminder prefs from the canonical key with legacy fallback", () => {
    window.localStorage.setItem(REMINDER_PREFS_KEY, JSON.stringify({ enabled: true, time: "18:30" }));
    const snapshot = buildLocalProgressSnapshot();
    expect(snapshot.reminderPrefs).toContain("18:30");
  });

  it("falls back to legacy reminder key when canonical key is missing", () => {
    window.localStorage.removeItem(REMINDER_PREFS_KEY);
    window.localStorage.setItem("bt.workout-reminders.v1", JSON.stringify({ enabled: false, time: "07:00" }));
    const snapshot = buildLocalProgressSnapshot();
    expect(snapshot.reminderPrefs).toContain("07:00");
  });
});
