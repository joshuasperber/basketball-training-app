import { NextRequest, NextResponse } from "next/server";
import { applySessionCookies, refreshSessionFromRequest } from "@/lib/server/session-cookies";

export async function POST(request: NextRequest) {
  const check = await refreshSessionFromRequest(request);
  if (check.status === "unavailable") {
    return NextResponse.json({ error: "auth_unavailable", retryable: true }, { status: 503 });
  }
  if (check.status === "invalid") {
    return NextResponse.json({ error: "invalid_refresh" }, { status: 401 });
  }
  const refreshed = check.session;

  const response = NextResponse.json({ ok: true, user: { id: refreshed.user.id, email: refreshed.user.email } });
  applySessionCookies(response, refreshed, request);
  return response;
}
