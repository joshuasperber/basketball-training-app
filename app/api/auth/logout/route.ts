import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/server/session-cookies";
import { normalizeSupabaseProjectUrl } from "@/lib/supabase-env";

const supabaseUrl = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type LogoutScope = "local" | "others" | "global";

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as { scope?: LogoutScope } | null;
  const scope: LogoutScope = payload?.scope === "others" || payload?.scope === "global" ? payload.scope : "local";
  const accessToken = request.cookies.get("sb-access-token")?.value;

  if (scope === "others" && (!accessToken || !supabaseUrl || !supabaseAnonKey)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (accessToken && supabaseUrl && supabaseAnonKey) {
    try {
      const revoke = await fetch(`${supabaseUrl}/auth/v1/logout?scope=${scope}`, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });
      if (!revoke.ok && scope === "others") {
        return NextResponse.json({ error: "revoke_failed" }, { status: revoke.status });
      }
    } catch {
      if (scope === "others") {
        return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
      }
    }
  }

  const response = NextResponse.json({ ok: true, scope });
  if (scope !== "others") clearSessionCookies(response, request);
  return response;
}
