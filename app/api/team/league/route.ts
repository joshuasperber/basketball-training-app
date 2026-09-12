import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseRest } from "@/lib/server/supabase-admin";
import { isUuid, postgrestPath } from "@/lib/server/postgrest-query";

type MemberRow = { role: string };
type LeagueDataRow = { league_data: unknown; updated_at: string };

async function getMembership(teamId: string, userId: string) {
  const result = await supabaseRest<MemberRow[]>(
    postgrestPath("team_members", {
      team_id: `eq.${teamId}`,
      user_id: `eq.${userId}`,
      select: "role",
      limit: 1,
    }),
  );
  return result.ok ? result.data?.[0] ?? null : null;
}

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const teamId = request.nextUrl.searchParams.get("teamId")?.trim();
  if (!isUuid(teamId)) return NextResponse.json({ error: "invalid_team" }, { status: 400 });

  const membership = await getMembership(teamId, user.id);
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const result = await supabaseRest<LeagueDataRow[]>(
    postgrestPath("team_league_data", {
      team_id: `eq.${teamId}`,
      select: "league_data,updated_at",
      limit: 1,
    }),
  );
  if (!result.ok) return NextResponse.json({ error: "read_failed" }, { status: 502 });

  const row = result.data?.[0];
  return NextResponse.json({
    bundle: row?.league_data ?? null,
    updatedAt: row?.updated_at ?? null,
    canEdit: membership.role === "owner" || membership.role === "captain",
  });
}

export async function PUT(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { teamId?: string; bundle?: unknown } | null;
  const teamId = body?.teamId?.trim();
  if (!isUuid(teamId) || !body?.bundle || typeof body.bundle !== "object") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const serialized = JSON.stringify(body.bundle);
  if (serialized.length > 1_000_000) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  const sourceTeamId = (body.bundle as { ownTeam?: { sourceTeamId?: unknown } }).ownTeam?.sourceTeamId;
  if (sourceTeamId !== teamId) {
    return NextResponse.json({ error: "team_mismatch" }, { status: 400 });
  }

  const membership = await getMembership(teamId, user.id);
  if (!membership || !["owner", "captain"].includes(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const updatedAt = new Date().toISOString();
  const result = await supabaseRest("team_league_data", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({
      team_id: teamId,
      league_data: body.bundle,
      updated_by: user.id,
      updated_at: updatedAt,
    }),
  });
  if (!result.ok) return NextResponse.json({ error: "write_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, updatedAt });
}
