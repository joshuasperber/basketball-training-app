import { NextRequest, NextResponse } from "next/server";
import { isLikelyInviteToken, parseJoinInviteToken } from "@/lib/team-invite-token";
import { getRequestUser, supabaseRest } from "@/lib/server/supabase-admin";
import { isUuid, postgrestPath } from "@/lib/server/postgrest-query";

type MemberRow = { id: string; role: string };
type InviteRow = {
  id: string;
  team_id: string;
  token: string;
  expires_at: string;
  max_uses: number;
  use_count: number;
  invited_role?: string;
};

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { token?: string; displayName?: string } | null;
  const token = parseJoinInviteToken(body?.token ?? "");
  if (!isLikelyInviteToken(token)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const inviteRes = await supabaseRest<InviteRow[]>(
    postgrestPath("team_invites", { token: `eq.${token}`, select: "*", limit: 1 }),
  );
  const invite = inviteRes.data?.[0];
  if (!invite) return NextResponse.json({ error: "invite_not_found" }, { status: 404 });
  if (!isUuid(invite.id) || !isUuid(invite.team_id)) {
    return NextResponse.json({ error: "invalid_invite_data" }, { status: 500 });
  }
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "invite_expired" }, { status: 410 });
  }
  if (invite.use_count >= invite.max_uses) {
    return NextResponse.json({ error: "invite_exhausted" }, { status: 410 });
  }

  const existing = await supabaseRest<MemberRow[]>(
    postgrestPath("team_members", {
      team_id: `eq.${invite.team_id}`,
      user_id: `eq.${user.id}`,
      select: "id",
      limit: 1,
    }),
  );
  if (existing.data?.[0]) {
    return NextResponse.json({ ok: true, teamId: invite.team_id, alreadyMember: true });
  }

  const invitedRole = invite.invited_role === "coach" ? "coach" : "player";
  const memberPayload = {
    team_id: invite.team_id,
    user_id: user.id,
    role: invitedRole,
    display_name: body?.displayName?.trim() || user.email.split("@")[0],
    member_email: user.email,
    share_level: "summary",
  };
  let memberRes = await supabaseRest("team_members", {
    method: "POST",
    body: JSON.stringify(memberPayload),
  });
  if (!memberRes.ok) {
    const { member_email, ...legacyPayload } = memberPayload;
    void member_email;
    memberRes = await supabaseRest("team_members", {
      method: "POST",
      body: JSON.stringify(legacyPayload),
    });
  }
  if (!memberRes.ok) return NextResponse.json({ error: "join_failed" }, { status: 500 });

  await supabaseRest(postgrestPath("team_invites", { id: `eq.${invite.id}` }), {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ use_count: invite.use_count + 1 }),
  });

  return NextResponse.json({ ok: true, teamId: invite.team_id });
}
