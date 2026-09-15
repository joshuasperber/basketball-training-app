import { describe, expect, it } from "vitest";
import { buildWeeklyFocus, normalizeReadinessHistory, readinessAverage } from "@/lib/readiness";

describe("readiness and weekly focus", () => {
  it("drops malformed readiness values", () => {
    expect(normalizeReadinessHistory({
      "2026-09-15": { energy: 4, freshness: 3, motivation: 5, updatedAt: "now" },
      bad: { energy: 9, freshness: 3, motivation: 2 },
    })).toEqual({
      "2026-09-15": { date: "2026-09-15", energy: 4, freshness: 3, motivation: 5, updatedAt: "now" },
    });
  });

  it("prioritizes recovery when readiness is low", () => {
    const readiness = { date: "2026-09-15", energy: 2, freshness: 2, motivation: 3, updatedAt: "now" };
    expect(readinessAverage(readiness)).toBe(2.3);
    expect(buildWeeklyFocus({ readiness, today: readiness.date, nextGame: { date: readiness.date, opponent: "Rivals" }, completed: 0, planned: 4, hasTodayPlan: true }).tone).toBe("calm");
  });

  it("surfaces an imminent game ahead of normal weekly progress", () => {
    const focus = buildWeeklyFocus({ today: "2026-09-15", nextGame: { date: "2026-09-16", opponent: "Rivals" }, completed: 1, planned: 4, hasTodayPlan: true });
    expect(focus.title).toContain("Rivals");
    expect(focus.href).toBe("/liga");
  });
});
