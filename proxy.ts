import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("sb-access-token")?.value;

  if (accessToken) {
    return NextResponse.next();
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