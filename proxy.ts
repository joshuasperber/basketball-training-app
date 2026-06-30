import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applySessionCookies, refreshSessionFromRequest, validateSessionTokens } from "@/lib/server/session-cookies";

const protectedPrefixes = [
  "/dashboard",
  "/training",
  "/weekly-workout",
  "/stats",
  "/level",
  "/profile",
  "/team",
  "/workouts",
  "/create-exercise",
  "/exercises",
  "/game-track",
  "/liga",
  "/review",
  "/tips",
];

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/Weekly-Workout") {
    return NextResponse.redirect(new URL("/weekly-workout", request.url));
  }

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("sb-access-token")?.value;
  const refreshToken = request.cookies.get("sb-refresh-token")?.value;

  if (accessToken && refreshToken) {
    const validated = await validateSessionTokens(accessToken, refreshToken);
    if (validated) {
      if (validated.access_token !== accessToken) {
        const response = NextResponse.redirect(request.nextUrl);
        applySessionCookies(response, validated, request);
        return response;
      }
      return NextResponse.next();
    }
    // Supabase unreachable (TLS/proxy/offline): session cookies still present — app may load locally.
    return NextResponse.next();
  }

  if (refreshToken) {
    const refreshed = await refreshSessionFromRequest(request);
    if (refreshed) {
      const response = NextResponse.redirect(request.nextUrl);
      applySessionCookies(response, refreshed, request);
      return response;
    }
  }

  const loginUrl = new URL("/login", request.url);
  const returnPath = `${pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set("next", returnPath);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/Weekly-Workout",
    "/dashboard",
    "/dashboard/:path*",
    "/training/:path*",
    "/weekly-workout/:path*",
    "/stats/:path*",
    "/level/:path*",
    "/profile/:path*",
    "/team/:path*",
    "/workouts/:path*",
    "/create-exercise/:path*",
    "/exercises/:path*",
    "/game-track/:path*",
    "/liga/:path*",
    "/review/:path*",
    "/tips/:path*",
  ],
};
