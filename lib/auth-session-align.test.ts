import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAuthMe, resetAuthMeCache } from "@/lib/auth-session-align";

describe("auth session cache", () => {
  beforeEach(() => {
    resetAuthMeCache();
    vi.restoreAllMocks();
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });
  });

  it("deduplicates parallel requests and reuses a successful result", async () => {
    const payload = {
      id: "user-1",
      email: "spieler@example.com",
      cloud: { sessionCount: 4, workouts14d: 2 },
      supabaseConfigured: true,
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([fetchAuthMe(), fetchAuthMe()]);
    const cached = await fetchAuthMe();

    expect(first).toEqual(payload);
    expect(second).toEqual(payload);
    expect(cached).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("can be invalidated after a login or logout", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchAuthMe();
    await fetchAuthMe();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resetAuthMeCache();
    await fetchAuthMe();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
