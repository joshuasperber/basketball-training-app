import { NextResponse } from "next/server";
import { runSupabaseLaunchHealthChecks } from "@/lib/server/supabase-health";

export async function GET() {
  const health = await runSupabaseLaunchHealthChecks();
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
