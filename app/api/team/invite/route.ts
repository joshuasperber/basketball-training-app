import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseRest } from "@/lib/server/supabase-admin";
import { getOrCreateTeamInviteToken } from "@/lib/server/team-invite";
import type { TeamRole } from "@/lib/team-types";

type MemberRow = { role: string };

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    teamId?: string;
    inviteRole?: Extract<TeamRole, "player" | "coach">;
  } | null;
  const teamId = body?.teamId?.trim();
  const inviteRole = body?.inviteRole === "coach" ? "coach" : "player";
  if (!teamId) return NextResponse.json({ error: "invalid_team" }, { status: 400 });

  const membership = await supabaseRest<MemberRow[]>(
    `team_members?team_id=eq.${teamId}&user_id=eq.${user.id}&select=role&limit=1`,
  );
  const role = membership.data?.[0]?.role;
  if (!role || !["owner", "captain", "coach"].includes(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const token = await getOrCreateTeamInviteToken(teamId, user.id, inviteRole);
  if (!token) return NextResponse.json({ error: "invite_failed" }, { status: 500 });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);
  return NextResponse.json({ token, inviteRole, expiresAt: expiresAt.toISOString() });
}
