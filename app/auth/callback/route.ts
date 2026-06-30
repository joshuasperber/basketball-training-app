import { NextRequest, NextResponse } from "next/server";
import { exchangeAuthCode, verifyTokenHash } from "@/lib/server/auth-token-exchange";
import { applySessionCookies, clearSessionCookies, validateSessionTokens } from "@/lib/server/session-cookies";

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
  const response = NextResponse.redirect(
    new URL(`/login?error=access_denied&error_code=${encodeURIComponent(code)}`, request.url),
  );
  clearSessionCookies(response, request);
  return response;
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") ?? "magiclink";
  const rawNext = request.nextUrl.searchParams.get("next");
  const isRecovery = type === "recovery" || rawNext?.includes("reset-password");
  const nextPath = isRecovery ? "/auth/reset-password" : buildRedirectPath(rawNext);
  const accessToken = request.nextUrl.searchParams.get("access_token");
  const refreshToken = request.nextUrl.searchParams.get("refresh_token");
  const expiresInRaw = request.nextUrl.searchParams.get("expires_in");
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const exchangeType = isRecovery ? "recovery" : type;

  let session: SupabaseSession | null = null;

  if (accessToken && refreshToken) {
    session = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: Number(expiresInRaw ?? "3600") || 3600,
    };
  } else if (tokenHash) {
    session = await verifyTokenHash(tokenHash, exchangeType);
  } else if (code) {
    session = await exchangeAuthCode(code);
  }

  if (!session?.access_token || !session?.refresh_token) {
    return withError(request, "missing_or_invalid_token");
  }

  const validated = await validateSessionTokens(session.access_token, session.refresh_token);
  if (!validated) {
    return withError(request, "invalid_session");
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  clearSessionCookies(response, request);
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
