import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLocalProgressDirty,
  getLocalProgressDirtyRevision,
  isLocalProgressDirty,
  markLocalProgressDirty,
} from "@/lib/sync-dirty";

describe("sync dirty generations", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => values.get(key) ?? null,
          setItem: (key: string, value: string) => values.set(key, value),
          removeItem: (key: string) => values.delete(key),
        },
      },
    });
  });

  it("does not clear a newer edit when an older upload completes", () => {
    markLocalProgressDirty();
    const uploadRevision = getLocalProgressDirtyRevision();
    markLocalProgressDirty();

    expect(clearLocalProgressDirty(uploadRevision)).toBe(false);
    expect(isLocalProgressDirty()).toBe(true);
    expect(clearLocalProgressDirty(getLocalProgressDirtyRevision())).toBe(true);
    expect(isLocalProgressDirty()).toBe(false);
  });
});
