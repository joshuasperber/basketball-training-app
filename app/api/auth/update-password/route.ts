import { NextRequest, NextResponse } from "next/server";
import { passwordGrant } from "@/lib/server/auth-password-grant";
import { applySessionCookies, validateSessionTokens } from "@/lib/server/session-cookies";
import { normalizeSupabaseProjectUrl } from "@/lib/supabase-env";

const supabaseUrl = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type UpdatePasswordPayload = {
  password?: string;
  email?: string;
};

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get("sb-access-token")?.value;
  const refreshToken = request.cookies.get("sb-refresh-token")?.value;
  if (!accessToken || !refreshToken || !supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as UpdatePasswordPayload | null;
  const password = body?.password?.trim() ?? "";
  if (password.length < 6) {
    return NextResponse.json({ error: "password_too_short" }, { status: 400 });
  }

  const validated = await validateSessionTokens(accessToken, refreshToken);
  if (!validated) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }

  const emailHint = body?.email?.trim().toLowerCase() ?? "";
  if (emailHint && emailHint !== validated.user.email) {
    return NextResponse.json({ error: "email_mismatch" }, { status: 403 });
  }

  const updateResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${validated.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
    cache: "no-store",
  });

  if (!updateResponse.ok) {
    const detail = await updateResponse.text().catch(() => "");
    return NextResponse.json({ error: "update_failed", detail }, { status: updateResponse.status });
  }

  const resolvedEmail = validated.user.email;
  let session = {
    access_token: validated.access_token,
    refresh_token: validated.refresh_token,
    expires_in: validated.expires_in,
  };
  let user = validated.user;

  const refreshCheck = await validateSessionTokens(session.access_token, session.refresh_token);
  if (refreshCheck) {
    session = {
      access_token: refreshCheck.access_token,
      refresh_token: refreshCheck.refresh_token,
      expires_in: refreshCheck.expires_in,
    };
    user = refreshCheck.user;
  } else if (resolvedEmail) {
    const reauth = await passwordGrant(resolvedEmail, password, { autoConfirm: true });
    if ("error" in reauth) {
      return NextResponse.json({ error: "reauth_failed", message: reauth.error }, { status: 401 });
    }
    session = reauth.session;
    user = reauth.user;
  }

  const jsonResponse = NextResponse.json({ ok: true, user });
  applySessionCookies(jsonResponse, session, request);
  return jsonResponse;
}
