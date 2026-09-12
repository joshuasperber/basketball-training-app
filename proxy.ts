import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applySessionCookies, clearSessionCookies, refreshSessionFromRequest, validateSessionTokens } from "@/lib/server/session-cookies";
import { isProtectedAppPath } from "@/lib/app-routes";

const protectedApiPrefixes = [
  "/api/account",
  "/api/coach",
  "/api/game-photo",
  "/api/profile",
  "/api/session",
  "/api/team",
  "/api/auth/me",
  "/api/auth/update-password",
];

function isProtectedApiPath(pathname: string) {
  return protectedApiPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function continueApiWithRefreshedSession(
  request: NextRequest,
  session: Parameters<typeof applySessionCookies>[1],
) {
  request.cookies.set("sb-access-token", session.access_token);
  request.cookies.set("sb-refresh-token", session.refresh_token);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("cookie", request.cookies.toString());
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applySessionCookies(response, session, request);
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const protectedApi = isProtectedApiPath(pathname);

  if (pathname === "/Weekly-Workout") {
    return NextResponse.redirect(new URL("/weekly-workout", request.url));
  }

  if (!isProtectedAppPath(pathname) && !protectedApi) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("sb-access-token")?.value;
  const refreshToken = request.cookies.get("sb-refresh-token")?.value;

  if (accessToken && refreshToken) {
    const validated = await validateSessionTokens(accessToken, refreshToken);
    if (validated) {
      if (validated.access_token !== accessToken) {
        if (protectedApi) {
          return continueApiWithRefreshedSession(request, validated);
        }
        const response = NextResponse.redirect(request.nextUrl);
        applySessionCookies(response, validated, request);
        return response;
      }
      return NextResponse.next();
    }
    // Ungültige Cookie-Paare dürfen keine geschützten Seiten freischalten.
    // Echte Offline-Navigation wird vom zuvor befüllten Service-Worker-Cache übernommen.
  }

  if (refreshToken && !accessToken) {
    const refreshed = await refreshSessionFromRequest(request);
    if (refreshed) {
      if (protectedApi) {
        return continueApiWithRefreshedSession(request, refreshed);
      }
      const response = NextResponse.redirect(request.nextUrl);
      applySessionCookies(response, refreshed, request);
      return response;
    }
  }

  if (protectedApi) {
    const response = NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (accessToken || refreshToken) clearSessionCookies(response, request);
    return response;
  }

  const loginUrl = new URL("/login", request.url);
  const returnPath = `${pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set("next", returnPath);
  loginUrl.searchParams.set("reason", "missing_session");
  const response = NextResponse.redirect(loginUrl);
  if (accessToken || refreshToken) clearSessionCookies(response, request);
  return response;
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
    "/api/account/:path*",
    "/api/coach/:path*",
    "/api/game-photo/:path*",
    "/api/profile/:path*",
    "/api/session/:path*",
    "/api/team/:path*",
    "/api/auth/me",
    "/api/auth/update-password",
  ],
};
