import { describe, expect, it } from "vitest";
import { mergeThreeWayJson } from "@/lib/three-way-merge";

describe("three-way merge", () => {
  it("keeps changes made to different object fields", () => {
    const base = { profile: { name: "Alex", position: "PG" }, theme: "light" };
    const remote = { profile: { name: "Alex", position: "SG" }, theme: "light" };
    const local = { profile: { name: "Sam", position: "PG" }, theme: "light" };

    expect(mergeThreeWayJson(base, remote, local).value).toEqual({
      profile: { name: "Sam", position: "SG" },
      theme: "light",
    });
  });

  it("merges separate entries in id-based collections", () => {
    const base = [{ id: "a", score: 1 }];
    const remote = [{ id: "a", score: 1 }, { id: "b", score: 2 }];
    const local = [{ id: "a", score: 3 }];

    expect(mergeThreeWayJson(base, remote, local).value).toEqual([
      { id: "a", score: 3 },
      { id: "b", score: 2 },
    ]);
  });

  it("preserves a deletion when the other side did not change the item", () => {
    const base = [{ id: "a", score: 1 }, { id: "b", score: 2 }];
    const remote = [{ id: "a", score: 1 }, { id: "b", score: 2 }];
    const local = [{ id: "b", score: 2 }];

    expect(mergeThreeWayJson(base, remote, local).value).toEqual([{ id: "b", score: 2 }]);
  });

  it("uses the active local edit only for the same scalar collision", () => {
    const result = mergeThreeWayJson(
      { game: { id: "g1", score: 70 } },
      { game: { id: "g1", score: 72 } },
      { game: { id: "g1", score: 75 } },
    );

    expect(result.value.game.score).toBe(75);
    expect(result.collisions).toEqual(["game.score"]);
  });
});
