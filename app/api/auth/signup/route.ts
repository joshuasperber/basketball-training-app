import { NextRequest, NextResponse } from "next/server";
import { createConfirmedUser } from "@/lib/server/auth-admin";
import { passwordGrant } from "@/lib/server/auth-password-grant";
import { applySessionCookies, clearSessionCookies } from "@/lib/server/session-cookies";

type SignUpPayload = {
  email?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as SignUpPayload | null;
  const email = body?.email?.trim() ?? "";
  const password = body?.password ?? "";

  if (!email || password.length < 6) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const created = await createConfirmedUser(email, password);
  if (!created.ok && created.error !== "email_exists") {
    return NextResponse.json({ error: created.error }, { status: 400 });
  }

  const result = await passwordGrant(email, password);
  if ("error" in result) {
    return NextResponse.json({ error: "sign_up_failed", message: result.error }, { status: 400 });
  }

  const response = NextResponse.json({
    ok: true,
    user: result.user,
  });
  clearSessionCookies(response, request);
  applySessionCookies(response, result.session, request);
  return response;
}
