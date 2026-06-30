import { NextRequest, NextResponse } from "next/server";
import { normalizeSupabaseProjectUrl } from "@/lib/supabase-env";
import { applySessionCookies, validateSessionTokens } from "@/lib/server/session-cookies";

const supabaseUrl = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

function buildRedirectPath(rawNext: string | null) {
  if (!rawNext || !rawNext.startsWith("/") || rawNext.startsWith("//")) return "/dashboard";
  return rawNext;
}

function withError(request: NextRequest, code: string) {
  return NextResponse.redirect(new URL(`/login?error=access_denied&error_code=${encodeURIComponent(code)}`, request.url));
}

async function verifyTokenHash(tokenHash: string, type: string): Promise<SupabaseSession | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const verifyResponse = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token_hash: tokenHash, type }),
    cache: "no-store",
  });

  if (!verifyResponse.ok) return null;
  return (await verifyResponse.json()) as SupabaseSession;
}

async function exchangeCode(code: string): Promise<SupabaseSession | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const attempt = async (grantType: "pkce" | "authorization_code") => {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=${grantType}`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ auth_code: code }),
      cache: "no-store",
    });

    if (!response.ok) return null;
    return (await response.json()) as SupabaseSession;
  };

  const pkce = await attempt("pkce");
  if (pkce?.access_token && pkce.refresh_token) return pkce;
  return attempt("authorization_code");
}

export async function GET(request: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL("/login?error=config_missing", request.url));
  }

  const nextPath = buildRedirectPath(request.nextUrl.searchParams.get("next"));
  const accessToken = request.nextUrl.searchParams.get("access_token");
  const refreshToken = request.nextUrl.searchParams.get("refresh_token");
  const expiresInRaw = request.nextUrl.searchParams.get("expires_in");
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") ?? "magiclink";

  let session: SupabaseSession | null = null;

  if (accessToken && refreshToken) {
    session = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: Number(expiresInRaw ?? "3600") || 3600,
    };
  } else if (tokenHash) {
    session = await verifyTokenHash(tokenHash, type);
  } else if (code) {
    session = await exchangeCode(code);
  }

  if (!session?.access_token || !session?.refresh_token) {
    return withError(request, "missing_or_invalid_token");
  }

  const validated = await validateSessionTokens(session.access_token, session.refresh_token);
  if (!validated) {
    return withError(request, "invalid_session");
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  applySessionCookies(
    response,
    {
      access_token: validated.access_token,
      refresh_token: validated.refresh_token,
      expires_in: session.expires_in ?? validated.expires_in,
    },
    request,
  );
  return response;
}
