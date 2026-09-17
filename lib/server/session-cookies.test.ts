import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function jwt(expirySeconds: number) {
  const payload = Buffer.from(JSON.stringify({ exp: expirySeconds })).toString("base64url");
  return `header.${payload}.signature`;
}

async function loadSessionModule() {
  vi.resetModules();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test-project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  return import("@/lib/server/session-cookies");
}

describe("server session validation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("classifies a temporary auth outage without trying to rotate a healthy token", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      void input;
      return new Response("", { status: 503 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { validateSessionTokens } = await loadSessionModule();

    const result = await validateSessionTokens(jwt(Math.floor(Date.now() / 1000) + 3600), "refresh-token");

    expect(result).toEqual({ status: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/auth/v1/user");
  });

  it("returns invalid only after access and refresh tokens are definitively rejected", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return url.includes("grant_type=refresh_token")
        ? new Response("", { status: 400 })
        : new Response("", { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { validateSessionTokens } = await loadSessionModule();

    const result = await validateSessionTokens(jwt(Math.floor(Date.now() / 1000) + 3600), "refresh-token");

    expect(result).toEqual({ status: "invalid" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches a confirmed access token instead of validating every request", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "user-1",
      email: "PLAYER@EXAMPLE.COM",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { validateSessionTokens } = await loadSessionModule();
    const accessToken = jwt(Math.floor(Date.now() / 1000) + 3600);

    const first = await validateSessionTokens(accessToken, "refresh-token");
    const second = await validateSessionTokens(accessToken, "refresh-token");

    expect(first.status).toBe("valid");
    expect(second.status).toBe("valid");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (second.status === "valid") expect(second.session.user.email).toBe("player@example.com");
  });

  it("coalesces concurrent refreshes into a single Supabase request", async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn(async () => {
      await blocked;
      return new Response(JSON.stringify({
        access_token: jwt(Math.floor(Date.now() / 1000) + 3600),
        refresh_token: "rotated-refresh",
        expires_in: 3600,
        user: { id: "user-1", email: "player@example.com" },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { validateSessionTokens } = await loadSessionModule();
    const expired = jwt(Math.floor(Date.now() / 1000) - 30);

    const first = validateSessionTokens(expired, "refresh-token");
    const second = validateSessionTokens(expired, "refresh-token");
    release?.();

    const results = await Promise.all([first, second]);
    expect(results.every((result) => result.status === "valid")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
