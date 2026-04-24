import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const protectedPrefixes = [
  "/dashboard",
  "/training",
  "/Weekly-Workout",
  "/stats",
  "/level",
  "/profile",
  "/workouts",
  "/create-exercise",
  "/exercises",
];

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

type RefreshedSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

async function refreshSession(refreshToken: string): Promise<RefreshedSession | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });

  if (!response.ok) return null;
  return (await response.json()) as RefreshedSession;
}

function applySessionCookies(response: NextResponse, session: RefreshedSession, request: NextRequest) {
  const isSecure = request.nextUrl.protocol === "https:";

  response.cookies.set("sb-access-token", session.access_token, {
    path: "/",
    maxAge: session.expires_in,
    sameSite: "lax",
    httpOnly: false,
    secure: isSecure,
  });

  response.cookies.set("sb-refresh-token", session.refresh_token, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
    httpOnly: false,
    secure: isSecure,
  });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("sb-access-token")?.value;
  const refreshToken = request.cookies.get("sb-refresh-token")?.value;

  if (accessToken) {
    return NextResponse.next();
  }

  if (refreshToken) {
    const refreshedSession = await refreshSession(refreshToken);
    if (refreshedSession?.access_token && refreshedSession.refresh_token) {
      const response = NextResponse.redirect(request.nextUrl);
      applySessionCookies(response, refreshedSession, request);
      return response;
    }
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/training/:path*",
    "/Weekly-Workout/:path*",
    "/stats/:path*",
    "/level/:path*",
    "/profile/:path*",
    "/workouts/:path*",
    "/create-exercise/:path*",
    "/exercises/:path*",
  ],
};