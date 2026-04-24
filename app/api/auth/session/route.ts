import { NextRequest, NextResponse } from "next/server";

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

  const response = NextResponse.json({ ok: true });

  response.cookies.set("sb-access-token", payload.access_token, {
    path: "/",
    maxAge: payload.expires_in ?? 60 * 60,
    sameSite: "lax",
    httpOnly: false,
  });

  response.cookies.set("sb-refresh-token", payload.refresh_token, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
    httpOnly: false,
  });

  return response;
}