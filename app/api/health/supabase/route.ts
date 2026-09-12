import { NextRequest, NextResponse } from "next/server";
import { runSupabaseLaunchHealthChecks } from "@/lib/server/supabase-health";

export async function GET(request: NextRequest) {
  const health = await runSupabaseLaunchHealthChecks();
  const expectedToken = process.env.HEALTHCHECK_TOKEN?.trim();
  const suppliedToken = request.headers.get("x-healthcheck-token")?.trim();
  const includeDetails = Boolean(expectedToken && suppliedToken === expectedToken);
  return NextResponse.json(
    includeDetails ? health : { ok: health.ok },
    { status: health.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
