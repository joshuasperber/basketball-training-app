import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";

describe("training navigation translations", () => {
  it("uses Exercises for the English catalog tab", () => {
    expect(translate("en", "training.tabExercises")).toBe("Exercises");
    expect(translate("en", "training.tabWorkouts")).toBe("Workouts");
  });

  it("keeps the German catalog labels", () => {
    expect(translate("de", "training.tabExercises")).toBe("Übungen");
    expect(translate("de", "training.tabWorkouts")).toBe("Workouts");
  });
});
