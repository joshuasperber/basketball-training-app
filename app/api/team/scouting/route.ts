import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseRest } from "@/lib/server/supabase-admin";
import { normalizeOpponentStyles, type OpponentStyleTag } from "@/lib/opponent-styles";
import { isUuid, postgrestPath } from "@/lib/server/postgrest-query";

type MemberRow = { role: string };
type ScoutingRow = { id: string; opponent_name: string };

function normalizeOpponentName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE");
}

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
  if (!isUuid(teamId) || !opponentName) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const membership = await supabaseRest<MemberRow[]>(
    postgrestPath("team_members", {
      team_id: `eq.${teamId}`,
      user_id: `eq.${user.id}`,
      select: "role",
      limit: 1,
    }),
  );
  const role = membership.data?.[0]?.role;
  if (!role || !["owner", "captain"].includes(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const styles = normalizeOpponentStyles(body?.styles ?? []);
  const existing = await supabaseRest<ScoutingRow[]>(
    postgrestPath("opponent_scouting", {
      team_id: `eq.${teamId}`,
      select: "id,opponent_name",
    }),
  );
  if (!existing.ok) return NextResponse.json({ error: "save_failed" }, { status: 500 });

  const matching = existing.data?.find(
    (entry) => normalizeOpponentName(entry.opponent_name) === normalizeOpponentName(opponentName),
  );
  const payload = JSON.stringify({
    team_id: teamId,
    opponent_name: opponentName.trim().replace(/\s+/g, " "),
    styles,
    notes: body?.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  });
  const upsertRes = matching
    ? await supabaseRest(postgrestPath("opponent_scouting", { id: `eq.${matching.id}` }), {
        method: "PATCH",
        prefer: "return=representation",
        body: payload,
      })
    : await supabaseRest("opponent_scouting", {
        method: "POST",
        prefer: "return=representation",
        body: payload,
      });

  if (!upsertRes.ok) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
