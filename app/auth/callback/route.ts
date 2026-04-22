import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET(request: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL("/login?error=config_missing", request.url));
  }

  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") ?? "magiclink";

  if (!tokenHash) {
    return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
  }

  const verifyResponse = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token_hash: tokenHash,
      type,
    }),
    cache: "no-store",
  });

  if (!verifyResponse.ok) {
    const errorPayload = (await verifyResponse.json().catch(() => null)) as { code?: string } | null;
    const code = errorPayload?.code ?? "verify_failed";
    return NextResponse.redirect(new URL(`/login?error=access_denied&error_code=${encodeURIComponent(code)}`, request.url));
  }

  const session = (await verifyResponse.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const response = NextResponse.redirect(new URL("/dashboard", request.url));

  response.cookies.set("sb-access-token", session.access_token, {
    path: "/",
    maxAge: session.expires_in,
    sameSite: "lax",
    httpOnly: true,
  });

  response.cookies.set("sb-refresh-token", session.refresh_token, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
    httpOnly: true,
  });

  return response;
}