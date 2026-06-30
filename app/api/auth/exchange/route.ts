import { NextRequest, NextResponse } from "next/server";
import { exchangeAuthCode, verifyTokenHash } from "@/lib/server/auth-token-exchange";
import { applySessionCookies, clearSessionCookies, validateSessionTokens } from "@/lib/server/session-cookies";

type ExchangePayload = {
  code?: string;
  token_hash?: string;
  type?: string;
};

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as ExchangePayload | null;
  const code = payload?.code?.trim();
  const tokenHash = payload?.token_hash?.trim();
  const type = payload?.type?.trim() || "signup";

  let session = null;
  if (code) {
    session = await exchangeAuthCode(code);
  } else if (tokenHash) {
    session = await verifyTokenHash(tokenHash, type);
  }

  if (!session?.access_token || !session?.refresh_token) {
    const response = NextResponse.json({ error: "invalid_link" }, { status: 400 });
    clearSessionCookies(response, request);
    return response;
  }

  const validated = await validateSessionTokens(session.access_token, session.refresh_token);
  const activeSession = validated ?? session;

  const response = NextResponse.json({
    ok: true,
    user: validated ? { id: validated.user.id, email: validated.user.email } : null,
    sessionUnverified: !validated,
  });
  clearSessionCookies(response, request);
  applySessionCookies(
    response,
    {
      access_token: activeSession.access_token,
      refresh_token: activeSession.refresh_token,
      expires_in: session.expires_in ?? validated?.expires_in ?? 3600,
    },
    request,
  );

  return response;
}
