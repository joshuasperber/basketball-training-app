import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/server/session-cookies";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response, request);
  return response;
}
