import { describe, expect, it } from "vitest";
import { fuzzyMatchScore, rankByFuzzySearch } from "@/lib/fuzzy-search";

describe("fuzzyMatchScore", () => {
  it("ranks exact and prefix matches highest", () => {
    expect(fuzzyMatchScore("shoot", "Shooting 1")).toBeGreaterThan(fuzzyMatchScore("sht", "Shooting 1"));
    expect(fuzzyMatchScore("shooting 1", "Shooting 1")).toBeGreaterThan(fuzzyMatchScore("shoot", "Shooting 1"));
  });

  it("matches subsequence typos", () => {
    expect(fuzzyMatchScore("mkan", "Mikan Finishes")).toBeGreaterThan(0);
  });
});

describe("rankByFuzzySearch", () => {
  it("sorts by score descending", () => {
    const items = [{ name: "Bench Press" }, { name: "Barbell Row" }, { name: "Back Squat" }];
    const ranked = rankByFuzzySearch(items, "bench", (item) => [item.name]);
    expect(ranked[0]?.item.name).toBe("Bench Press");
  });
});
