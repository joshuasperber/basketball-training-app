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
  if (!validated) {
    return NextResponse.json({ error: "invalid_session" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, user: { id: validated.user.id, email: validated.user.email } });
  applySessionCookies(
    response,
    {
      access_token: validated.access_token,
      refresh_token: validated.refresh_token,
      expires_in: payload.expires_in ?? validated.expires_in,
    },
    request,
  );

  return response;
}
