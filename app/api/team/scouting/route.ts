import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseRest } from "@/lib/server/supabase-admin";
import { normalizeOpponentStyles, type OpponentStyleTag } from "@/lib/opponent-styles";

type MemberRow = { role: string };

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    teamId?: string;
    opponentName?: string;
    styles?: OpponentStyleTag[];
    notes?: string;
  } | null;

  const teamId = body?.teamId?.trim();
  const opponentName = body?.opponentName?.trim();
  if (!teamId || !opponentName) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const membership = await supabaseRest<MemberRow[]>(
    `team_members?team_id=eq.${teamId}&user_id=eq.${user.id}&select=role&limit=1`,
  );
  const role = membership.data?.[0]?.role;
  if (!role || !["owner", "captain", "coach"].includes(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const styles = normalizeOpponentStyles(body?.styles ?? []);
  const upsertRes = await supabaseRest("opponent_scouting", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify({
      team_id: teamId,
      opponent_name: opponentName,
      styles,
      notes: body?.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!upsertRes.ok) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
