import { NextRequest, NextResponse } from "next/server";
import { passwordGrant } from "@/lib/server/auth-password-grant";
import { applySessionCookies, clearSessionCookies } from "@/lib/server/session-cookies";

type SignInPayload = {
  email?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as SignInPayload | null;
  const email = body?.email?.trim() ?? "";
  const password = body?.password ?? "";

  if (!email || password.length < 6) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const result = await passwordGrant(email, password);
  if ("error" in result) {
    const response = NextResponse.json({ error: "sign_in_failed", message: result.error }, { status: 401 });
    clearSessionCookies(response, request);
    return response;
  }

  const response = NextResponse.json({
    ok: true,
    user: result.user,
  });
  clearSessionCookies(response, request);
  applySessionCookies(response, result.session, request);
  return response;
}
