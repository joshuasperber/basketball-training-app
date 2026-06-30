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
  response.cookies.set("sb-access-token", session.access_token, sessionCookieOptions(request, session.expires_in));
  response.cookies.set(
    "sb-refresh-token",
    session.refresh_token,
    sessionCookieOptions(request, 60 * 60 * 24 * 30),
  );
}

export function clearSessionCookies(response: NextResponse, request?: NextRequest) {
  const opts = { ...sessionCookieOptions(request, 0), maxAge: 0 };
  response.cookies.set("sb-access-token", "", opts);
  response.cookies.set("sb-refresh-token", "", opts);
}

async function fetchAuthUser(accessToken: string): Promise<{ id: string; email: string } | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) return null;
    const user = (await response.json()) as { id?: string; email?: string };
    const id = user.id?.trim();
    const email = user.email?.trim().toLowerCase();
    if (!id || !email) return null;
    return { id, email };
  } catch {
    return null;
  }
}

async function refreshSupabaseSession(refreshToken: string): Promise<SupabaseSession | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;

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

    if (!response.ok) return null;
    const session = (await response.json()) as SupabaseSession;
    if (!session.access_token || !session.refresh_token) return null;
    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in ?? 3600,
    };
  } catch {
    return null;
  }
}

/** Validates access token; falls back to refresh_token exchange when expired. */
export async function validateSessionTokens(
  accessToken: string,
  refreshToken: string,
): Promise<ValidatedSession | null> {
  const directUser = await fetchAuthUser(accessToken);
  if (directUser) {
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      user: directUser,
    };
  }

  const refreshed = await refreshSupabaseSession(refreshToken);
  if (!refreshed) return null;

  const refreshedUser = await fetchAuthUser(refreshed.access_token);
  if (!refreshedUser) return null;

  return {
    ...refreshed,
    user: refreshedUser,
  };
}

export async function refreshSessionFromRequest(request: NextRequest): Promise<ValidatedSession | null> {
  const refreshToken = request.cookies.get("sb-refresh-token")?.value;
  if (!refreshToken) return null;

  const refreshed = await refreshSupabaseSession(refreshToken);
  if (!refreshed) return null;

  const user = await fetchAuthUser(refreshed.access_token);
  if (!user) return null;

  return { ...refreshed, user };
}
