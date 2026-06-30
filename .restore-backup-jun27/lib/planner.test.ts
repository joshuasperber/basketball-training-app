import { describe, expect, it } from "vitest";
import { buildWeeklyPlan, getDefaultWeekConfig, PHASE_VOLUME_FACTOR, type MesocyclePhase } from "@/lib/planner";

describe("PHASE_VOLUME_FACTOR", () => {
  it("deload reduces volume vs base", () => {
    expect(PHASE_VOLUME_FACTOR.deload).toBeLessThan(PHASE_VOLUME_FACTOR.base);
    expect(PHASE_VOLUME_FACTOR.build).toBeGreaterThan(PHASE_VOLUME_FACTOR.base);
  });
});

describe("buildWeeklyPlan phase modifiers", () => {
  const baseInput = {
    position: "sg",
    playStyle: "slasher",
    weekConfig: getDefaultWeekConfig(),
    weeklyGoalSessions: 4,
  };

  it("scales gym minutes down in deload and softens intensity", () => {
    const base = buildWeeklyPlan({ ...baseInput, mesocyclePhase: undefined });
    const deload = buildWeeklyPlan({ ...baseInput, mesocyclePhase: "deload" satisfies MesocyclePhase });
    const monBase = base.find((d) => d.day === "monday")!;
    const monDeload = deload.find((d) => d.day === "monday")!;
    expect(monDeload.minutes).toBeLessThanOrEqual(monBase.minutes);
    if (monBase.intensity === "high" || monBase.intensity === "medium") {
      expect(monDeload.intensity).toBe("light");
    }
  });

  it("build phase increases monday gym minutes vs base", () => {
    const base = buildWeeklyPlan({ ...baseInput, mesocyclePhase: "base" satisfies MesocyclePhase });
    const build = buildWeeklyPlan({ ...baseInput, mesocyclePhase: "build" satisfies MesocyclePhase });
    const monBase = base.find((d) => d.day === "monday")!;
    const monBuild = build.find((d) => d.day === "monday")!;
    expect(monBuild.minutes).toBeGreaterThanOrEqual(monBase.minutes);
  });

  it("leaves unavailable days at zero minutes", () => {
    const wc = getDefaultWeekConfig();
    wc.monday = { mode: "unavailable", minutes: 90 };
    const plan = buildWeeklyPlan({ ...baseInput, weekConfig: wc, mesocyclePhase: "build" });
    const mon = plan.find((d) => d.day === "monday")!;
    expect(mon.minutes).toBe(0);
    expect(mon.sessionType).toBe("none");
  });
});
