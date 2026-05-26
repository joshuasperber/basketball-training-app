import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, getSupabaseServiceConfig, supabaseRest } from "@/lib/server/supabase-admin";
import { createInviteToken } from "@/lib/server/team-progress";
import type { TeamRole, TeamSummary } from "@/lib/team-types";

type TeamRow = {
  id: string;
  name: string;
  season: string | null;
  club_name: string | null;
};

type MembershipRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
  teams?: TeamRow | TeamRow[] | null;
};


export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const memberships = await supabaseRest<MembershipRow[]>(
    `team_members?user_id=eq.${user.id}&select=id,team_id,user_id,role,teams(id,name,season,club_name)`,
  );
  if (!memberships.ok) return NextResponse.json({ error: "read_failed" }, { status: 500 });

  const rows = memberships.data ?? [];
  const teamIds = [...new Set(rows.map((row) => row.team_id))];
  const counts = new Map<string, number>();
  if (teamIds.length > 0) {
    const countRes = await supabaseRest<Array<{ team_id: string }>>(
      `team_members?team_id=in.(${teamIds.join(",")})&select=team_id`,
    );
    (countRes.data ?? []).forEach((row) => {
      counts.set(row.team_id, (counts.get(row.team_id) ?? 0) + 1);
    });
  }

  const teams: TeamSummary[] = rows.map((row) => {
    const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
    return {
      id: row.team_id,
      name: team?.name ?? "Team",
      season: team?.season ?? null,
      clubName: team?.club_name ?? null,
      memberCount: counts.get(row.team_id) ?? 1,
      role: row.role,
    };
  });

  return NextResponse.json({ teams });
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!getSupabaseServiceConfig()) {
    return NextResponse.json(
      {
        error: "missing_service_role",
        message: "SUPABASE_SERVICE_ROLE_KEY fehlt in .env.local — Team-API kann Supabase nicht ansprechen.",
      },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    season?: string;
    clubName?: string;
  } | null;
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "invalid_name" }, { status: 400 });

  const teamRes = await supabaseRest<TeamRow[]>("teams", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({
      name,
      season: body?.season?.trim() || null,
      club_name: body?.clubName?.trim() || null,
      created_by: user.id,
    }),
  });
  if (!teamRes.ok || !teamRes.data?.[0]) {
    return NextResponse.json(
      {
        error: "create_failed",
        message: "Team-Tabelle konnte nicht beschrieben werden.",
        detail: teamRes.error ?? null,
      },
      { status: 500 },
    );
  }

  const team = teamRes.data[0];
  const ownerMemberPayload = {
    team_id: team.id,
    user_id: user.id,
    role: "owner",
    display_name: user.email.split("@")[0],
    member_email: user.email,
    share_level: "summary",
  };
  let memberRes = await supabaseRest("team_members", {
    method: "POST",
    body: JSON.stringify(ownerMemberPayload),
  });
  if (!memberRes.ok) {
    const { member_email: _omit, ...legacyPayload } = ownerMemberPayload;
    memberRes = await supabaseRest("team_members", {
      method: "POST",
      body: JSON.stringify(legacyPayload),
    });
  }
  if (!memberRes.ok) {
    return NextResponse.json(
      {
        error: "member_create_failed",
        message: "Team wurde angelegt, aber Mitgliedschaft fehlgeschlagen.",
        detail: memberRes.error ?? null,
      },
      { status: 500 },
    );
  }

  const summary: TeamSummary = {
    id: team.id,
    name: team.name,
    season: team.season,
    clubName: team.club_name,
    memberCount: 1,
    role: "owner",
  };

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);
  const token = createInviteToken();
  const inviteRes = await supabaseRest("team_invites", {
    method: "POST",
    body: JSON.stringify({
      team_id: team.id,
      token,
      created_by: user.id,
      expires_at: expiresAt.toISOString(),
      max_uses: 20,
      use_count: 0,
    }),
  });
  if (!inviteRes.ok) {
    return NextResponse.json(
      {
        error: "invite_create_failed",
        message: "Team wurde erstellt, aber die Einladung konnte nicht angelegt werden.",
        detail: inviteRes.error ?? null,
        team: summary,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ team: summary, inviteToken: token });
}
