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

  const check = await validateSessionTokens(payload.access_token, payload.refresh_token);
  if (check.status === "unavailable") {
    return NextResponse.json({ error: "auth_unavailable", retryable: true }, { status: 503 });
  }
  if (check.status === "invalid") {
    return NextResponse.json({ error: "invalid_session" }, { status: 401 });
  }
  const validated = check.session;

  const response = NextResponse.json({
    ok: true,
    user: { id: validated.user.id, email: validated.user.email },
  });
  applySessionCookies(response, validated, request);

  return response;
}
