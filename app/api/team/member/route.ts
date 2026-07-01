import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseRest } from "@/lib/server/supabase-admin";
import type { TeamRole, TeamShareLevel } from "@/lib/team-types";

type MemberRow = { id: string; user_id: string; role: TeamRole; share_level: TeamShareLevel };

function canManageMembers(role: TeamRole) {
  return role === "owner" || role === "captain";
}

export async function PATCH(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    teamId?: string;
    shareLevel?: TeamShareLevel;
    memberUserId?: string;
    role?: Extract<TeamRole, "player" | "coach" | "captain">;
  } | null;

  const teamId = body?.teamId?.trim();
  if (!teamId) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const membership = await supabaseRest<MemberRow[]>(
    `team_members?team_id=eq.${teamId}&user_id=eq.${user.id}&select=id,user_id,role,share_level&limit=1`,
  );
  const self = membership.data?.[0];
  if (!membership.ok || !self) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const targetUserId = body?.memberUserId?.trim() || user.id;
  const isSelf = targetUserId === user.id;

  if (body?.shareLevel != null) {
    if (!isSelf) {
      return NextResponse.json({ error: "share_level_self_only" }, { status: 403 });
    }
    if (body.shareLevel !== "summary" && body.shareLevel !== "full") {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }
    const update = await supabaseRest<MemberRow[]>(`team_members?team_id=eq.${teamId}&user_id=eq.${user.id}`, {
      method: "PATCH",
      prefer: "return=representation",
      body: JSON.stringify({ share_level: body.shareLevel }),
    });
    if (!update.ok) {
      return NextResponse.json({ error: "update_failed", detail: update.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true, shareLevel: body.shareLevel });
  }

  if (body?.role != null) {
    if (!canManageMembers(self.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (isSelf) {
      return NextResponse.json({ error: "role_self_change_forbidden" }, { status: 403 });
    }
    if (!["player", "coach", "captain"].includes(body.role)) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const target = await supabaseRest<MemberRow[]>(
      `team_members?team_id=eq.${teamId}&user_id=eq.${targetUserId}&select=id,user_id,role,share_level&limit=1`,
    );
    const targetMember = target.data?.[0];
    if (!targetMember) return NextResponse.json({ error: "member_not_found" }, { status: 404 });
    if (targetMember.role === "owner") {
      return NextResponse.json({ error: "owner_role_locked" }, { status: 403 });
    }
    if (body.role === "captain" && self.role !== "owner") {
      return NextResponse.json({ error: "captain_promote_owner_only" }, { status: 403 });
    }

    const update = await supabaseRest<MemberRow[]>(`team_members?team_id=eq.${teamId}&user_id=eq.${targetUserId}`, {
      method: "PATCH",
      prefer: "return=representation",
      body: JSON.stringify({ role: body.role }),
    });
    if (!update.ok) {
      return NextResponse.json({ error: "update_failed", detail: update.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true, role: body.role });
  }

  return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
}
