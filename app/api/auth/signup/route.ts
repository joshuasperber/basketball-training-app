import { NextRequest, NextResponse } from "next/server";
import { applySessionCookies, clearSessionCookies, type SupabaseSession } from "@/lib/server/session-cookies";
import { normalizeSupabaseProjectUrl } from "@/lib/supabase-env";
import { isValidEmailAddress } from "@/lib/auth-validation";

const supabaseUrl = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type SignUpPayload = { email?: string; password?: string };
type SignUpResponse = {
  user?: { id?: string; email?: string };
  session?: SupabaseSession | null;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  msg?: string;
  message?: string;
  error_description?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as SignUpPayload | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";

  if (!isValidEmailAddress(email)) {
    return NextResponse.json({ error: "invalid_email", message: "Bitte gib eine gültige E-Mail-Adresse ein." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "weak_password", message: "Das Passwort muss mindestens 6 Zeichen haben." }, { status: 400 });
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  }

  const result = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  const payload = (await result.json().catch(() => ({}))) as SignUpResponse;
  if (!result.ok) {
    return NextResponse.json(
      { error: "sign_up_failed", message: payload.msg ?? payload.message ?? payload.error_description },
      { status: result.status },
    );
  }

  const session = payload.session ?? (
    payload.access_token && payload.refresh_token
      ? { access_token: payload.access_token, refresh_token: payload.refresh_token, expires_in: payload.expires_in ?? 3600 }
      : null
  );
  const response = NextResponse.json({
    ok: true,
    user: payload.user,
    needsEmailConfirmation: !session,
  });
  clearSessionCookies(response, request);
  if (session) applySessionCookies(response, session, request);
  return response;
}
