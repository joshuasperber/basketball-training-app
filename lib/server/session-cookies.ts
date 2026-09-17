import type { NextRequest, NextResponse } from "next/server";
import { normalizeSupabaseProjectUrl } from "@/lib/supabase-env";

const supabaseUrl = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export type ValidatedSession = SupabaseSession & {
  user: { id: string; email: string };
};

export type SessionCheckResult =
  | { status: "valid"; session: ValidatedSession; refreshed: boolean }
  | { status: "invalid" }
  | { status: "unavailable" };

type AuthUser = ValidatedSession["user"];
type AuthUserCheck =
  | { status: "valid"; user: AuthUser }
  | { status: "invalid" }
  | { status: "unavailable" };

type RefreshCheck =
  | { status: "valid"; session: SupabaseSession; user: AuthUser | null }
  | { status: "invalid" }
  | { status: "unavailable" };

/** Sliding browser cookie lifetime; access JWTs continue to refresh server-side. */
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;
const ACCESS_REFRESH_LEEWAY_SECONDS = 45;
const ACCESS_VALIDATION_CACHE_MS = 2 * 60 * 1000;

const accessValidationCache = new Map<string, { user: AuthUser; expiresAt: number }>();
const accessValidationInFlight = new Map<string, Promise<AuthUserCheck>>();
const refreshInFlight = new Map<string, Promise<RefreshCheck>>();

function sessionCookieOptions(request: NextRequest | undefined, maxAge: number) {
  const isSecure = request?.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production";
  return {
    path: "/",
    maxAge,
    sameSite: "lax" as const,
    httpOnly: true,
    secure: isSecure,
  };
}

export function applySessionCookies(
  response: NextResponse,
  session: SupabaseSession,
  request?: NextRequest,
) {
  response.cookies.set("sb-access-token", session.access_token, sessionCookieOptions(request, SESSION_COOKIE_MAX_AGE));
  response.cookies.set(
    "sb-refresh-token",
    session.refresh_token,
    sessionCookieOptions(request, SESSION_COOKIE_MAX_AGE),
  );
}

export function clearSessionCookies(response: NextResponse, request?: NextRequest) {
  const opts = { ...sessionCookieOptions(request, 0), maxAge: 0 };
  response.cookies.set("sb-access-token", "", opts);
  response.cookies.set("sb-refresh-token", "", opts);
}

function decodeJwtExpiry(accessToken: string): number | null {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const json = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof json.exp === "number" && Number.isFinite(json.exp) ? json.exp : null;
  } catch {
    return null;
  }
}

function accessTokenNeedsRefresh(accessToken: string) {
  const expiry = decodeJwtExpiry(accessToken);
  return expiry != null && expiry <= Math.floor(Date.now() / 1000) + ACCESS_REFRESH_LEEWAY_SECONDS;
}

function authFailureStatus(status: number): "invalid" | "unavailable" {
  return status === 400 || status === 401 || status === 403 ? "invalid" : "unavailable";
}

async function fetchAuthUserUncached(accessToken: string): Promise<AuthUserCheck> {
  if (!supabaseUrl || !supabaseAnonKey) return { status: "unavailable" };

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) return { status: authFailureStatus(response.status) };
    const user = (await response.json()) as { id?: string; email?: string };
    const id = user.id?.trim();
    const email = user.email?.trim().toLowerCase();
    if (!id || !email) return { status: "invalid" };
    return { status: "valid", user: { id, email } };
  } catch {
    return { status: "unavailable" };
  }
}

async function fetchAuthUser(accessToken: string): Promise<AuthUserCheck> {
  const cached = accessValidationCache.get(accessToken);
  if (cached && cached.expiresAt > Date.now() && !accessTokenNeedsRefresh(accessToken)) {
    return { status: "valid", user: cached.user };
  }

  const running = accessValidationInFlight.get(accessToken);
  if (running) return running;

  const request = fetchAuthUserUncached(accessToken)
    .then((result) => {
      if (result.status === "valid") {
        const tokenExpiry = decodeJwtExpiry(accessToken);
        const tokenExpiryMs = tokenExpiry == null ? Number.POSITIVE_INFINITY : tokenExpiry * 1000 - 15_000;
        accessValidationCache.set(accessToken, {
          user: result.user,
          expiresAt: Math.min(Date.now() + ACCESS_VALIDATION_CACHE_MS, tokenExpiryMs),
        });
      } else if (result.status === "invalid") {
        accessValidationCache.delete(accessToken);
      }
      return result;
    })
    .finally(() => {
      if (accessValidationInFlight.get(accessToken) === request) {
        accessValidationInFlight.delete(accessToken);
      }
    });
  accessValidationInFlight.set(accessToken, request);
  return request;
}

export async function validateAccessTokenResult(
  accessToken: string,
  refreshToken: string,
): Promise<SessionCheckResult> {
  const result = await fetchAuthUser(accessToken);
  if (result.status !== "valid") return result;
  return {
    status: "valid",
    refreshed: false,
    session: {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: Math.max(
        1,
        (decodeJwtExpiry(accessToken) ?? Math.floor(Date.now() / 1000) + 3600) - Math.floor(Date.now() / 1000),
      ),
      user: result.user,
    },
  };
}

/** Compatibility helper for handlers whose proxy already classified transient failures. */
export async function validateAccessToken(
  accessToken: string,
  refreshToken: string,
): Promise<ValidatedSession | null> {
  const result = await validateAccessTokenResult(accessToken, refreshToken);
  return result.status === "valid" ? result.session : null;
}

async function refreshSupabaseSessionUncached(refreshToken: string): Promise<RefreshCheck> {
  if (!supabaseUrl || !supabaseAnonKey) return { status: "unavailable" };

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });

    if (!response.ok) return { status: authFailureStatus(response.status) };
    const payload = (await response.json()) as SupabaseSession & {
      user?: { id?: string; email?: string };
    };
    if (!payload.access_token || !payload.refresh_token) return { status: "invalid" };
    const id = payload.user?.id?.trim();
    const email = payload.user?.email?.trim().toLowerCase();
    return {
      status: "valid",
      session: {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        expires_in: payload.expires_in ?? 3600,
      },
      user: id && email ? { id, email } : null,
    };
  } catch {
    return { status: "unavailable" };
  }
}

async function refreshSupabaseSession(refreshToken: string): Promise<RefreshCheck> {
  const running = refreshInFlight.get(refreshToken);
  if (running) return running;

  const request = refreshSupabaseSessionUncached(refreshToken).finally(() => {
    if (refreshInFlight.get(refreshToken) === request) refreshInFlight.delete(refreshToken);
  });
  refreshInFlight.set(refreshToken, request);
  return request;
}

async function validateRefreshedSession(refreshToken: string): Promise<SessionCheckResult> {
  const refreshed = await refreshSupabaseSession(refreshToken);
  if (refreshed.status !== "valid") return refreshed;

  const userResult = refreshed.user
    ? ({ status: "valid", user: refreshed.user } satisfies AuthUserCheck)
    : await fetchAuthUser(refreshed.session.access_token);
  if (userResult.status !== "valid") return userResult;

  accessValidationCache.set(refreshed.session.access_token, {
    user: userResult.user,
    expiresAt: Date.now() + ACCESS_VALIDATION_CACHE_MS,
  });
  return {
    status: "valid",
    refreshed: true,
    session: { ...refreshed.session, user: userResult.user },
  };
}

/** Validates access token and refreshes only when it is expired or definitively rejected. */
export async function validateSessionTokens(
  accessToken: string,
  refreshToken: string,
): Promise<SessionCheckResult> {
  if (!accessTokenNeedsRefresh(accessToken)) {
    const directSession = await validateAccessTokenResult(accessToken, refreshToken);
    if (directSession.status === "valid" || directSession.status === "unavailable") return directSession;
  }

  if (!refreshToken) return { status: "invalid" };
  return validateRefreshedSession(refreshToken);
}

export async function refreshSessionFromRequest(request: NextRequest): Promise<SessionCheckResult> {
  const refreshToken = request.cookies.get("sb-refresh-token")?.value;
  if (!refreshToken) return { status: "invalid" };
  return validateRefreshedSession(refreshToken);
}

export function resetSessionValidationCache() {
  accessValidationCache.clear();
  accessValidationInFlight.clear();
  refreshInFlight.clear();
}
