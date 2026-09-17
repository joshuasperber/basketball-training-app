import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAuthMe, fetchAuthMeState, resetAuthMeCache } from "@/lib/auth-session-align";

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

  it("treats the silent unauthenticated probe as signed out without a failing HTTP request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })),
    );

    expect(await fetchAuthMeState()).toEqual({ status: "unauthenticated", user: null });
  });

  it("keeps the last confirmed user during a transient auth outage", async () => {
    const payload = {
      id: "user-1",
      email: "spieler@example.com",
      cloud: { sessionCount: 4, workouts14d: 2 },
      supabaseConfigured: true,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchAuthMe()).toEqual(payload);
    expect(await fetchAuthMeState({ force: true })).toEqual({ status: "unavailable", user: payload });
    expect(await fetchAuthMe()).toEqual(payload);
  });

  it("clears the confirmed user only after an explicit 401", async () => {
    const payload = {
      id: "user-1",
      email: "spieler@example.com",
      cloud: { sessionCount: 4, workouts14d: 2 },
      supabaseConfigured: true,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchAuthMe();
    expect(await fetchAuthMeState({ force: true })).toEqual({ status: "unauthenticated", user: null });
    expect(await fetchAuthMe()).toBeNull();
  });
});
