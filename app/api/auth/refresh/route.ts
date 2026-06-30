import { NextRequest, NextResponse } from "next/server";
import { applySessionCookies, refreshSessionFromRequest } from "@/lib/server/session-cookies";

export async function POST(request: NextRequest) {
  const refreshed = await refreshSessionFromRequest(request);
  if (!refreshed) {
    return NextResponse.json({ error: "invalid_refresh" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, user: { id: refreshed.user.id, email: refreshed.user.email } });
  applySessionCookies(response, refreshed, request);
  return response;
}
