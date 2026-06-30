import { NextRequest, NextResponse } from "next/server";
import { applySessionCookies, validateSessionTokens } from "@/lib/server/session-cookies";

type SessionPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as SessionPayload | null;

  if (!payload?.access_token || !payload?.refresh_token) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const validated = await validateSessionTokens(payload.access_token, payload.refresh_token);

  const session = validated ?? {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: payload.expires_in ?? 3600,
  };

  const response = NextResponse.json({
    ok: true,
    user: validated ? { id: validated.user.id, email: validated.user.email } : null,
    sessionUnverified: !validated,
  });
  applySessionCookies(response, session, request);

  return response;
}
