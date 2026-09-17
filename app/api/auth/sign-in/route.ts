import { NextRequest, NextResponse } from "next/server";
import { passwordGrant } from "@/lib/server/auth-password-grant";
import { isValidEmailAddress } from "@/lib/auth-validation";
import { applySessionCookies, clearSessionCookies } from "@/lib/server/session-cookies";

type SignInPayload = {
  email?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as SignInPayload | null;
  const email = body?.email?.trim() ?? "";
  const password = body?.password ?? "";

  if (!isValidEmailAddress(email)) {
    return NextResponse.json({ error: "invalid_email", message: "Bitte gib eine gültige E-Mail-Adresse ein." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "invalid_credentials", message: "Invalid login credentials" }, { status: 401 });
  }

  const result = await passwordGrant(email, password);
  if ("error" in result) {
    const lower = result.error.toLowerCase();
    const needsConfirmation =
      lower.includes("email not confirmed") ||
      lower.includes("email_not_confirmed") ||
      lower.includes("not confirmed");
    const response = NextResponse.json(
      {
        error: needsConfirmation ? "email_not_confirmed" : "invalid_credentials",
        message: result.error,
      },
      { status: 401 },
    );
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
