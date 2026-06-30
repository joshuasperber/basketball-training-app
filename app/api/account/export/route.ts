import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, getSupabaseServiceConfig, supabaseRest } from "@/lib/server/supabase-admin";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const config = getSupabaseServiceConfig();
  if (!config) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const progressRes = await supabaseRest<Record<string, unknown>[]>(
    `user_progress?user_id=eq.${user.id}&select=*&limit=1`,
  );
  const profileRes = await supabaseRest<Record<string, unknown>[]>(
    `profiles?id=eq.${user.id}&select=*&limit=1`,
  );
  const teamRes = await supabaseRest<Record<string, unknown>[]>(
    `team_members?user_id=eq.${user.id}&select=*,teams(name,season,club_name)`,
  );

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    user: { id: user.id, email: user.email },
    cloud: {
      userProgress: progressRes.data?.[0] ?? null,
      profile: profileRes.data?.[0] ?? null,
      teamMemberships: teamRes.data ?? [],
    },
    note: "Lokale Browser-Daten (localStorage) sind in diesem Export nicht enthalten — nutze den Profil-Export in der App für die vollständige JSON-Datei.",
  };

  const filename = `basketball-training-export-${user.id.slice(0, 8)}-${Date.now()}.json`;
  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
