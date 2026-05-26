import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseRest } from "@/lib/server/supabase-admin";
import { getOrCreateTeamInviteToken } from "@/lib/server/team-invite";
import { buildMemberViewFromProgress } from "@/lib/server/team-progress";
import { parseWorkoutSessionsFromProgress } from "@/lib/server/parse-user-progress";
import { fetchProgressByUserIds } from "@/lib/server/user-progress-team";
import { normalizeOpponentStyles } from "@/lib/opponent-styles";
import type { OpponentScoutingEntry, TeamDetail, TeamMemberView, TeamRole } from "@/lib/team-types";

type MemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  member_email?: string | null;
  role: TeamRole;
  display_name: string | null;
  position: string | null;
  play_style: string | null;
  share_level: "summary" | "full";
};

type TeamRow = {
  id: string;
  name: string;
  season: string | null;
  club_name: string | null;
};

type ScoutingRow = {
  id: string;
  opponent_name: string;
  styles: string[];
  notes: string | null;
  updated_at: string;
};

type ProgressRow = {
  user_id?: string | null;
  email?: string | null;
  sessions?: unknown;
  workout_history?: string | null;
  game_stats?: string | null;
  profile_cache?: string | null;
  profile_username?: string | null;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ teamId: string }> },
) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { teamId } = await context.params;
  const membership = await supabaseRest<MemberRow[]>(
    `team_members?team_id=eq.${teamId}&user_id=eq.${user.id}&select=*&limit=1`,
  );
  if (!membership.ok || !membership.data?.[0]) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const teamRes = await supabaseRest<TeamRow[]>(`teams?id=eq.${teamId}&select=*&limit=1`);
  const team = teamRes.data?.[0];
  if (!team) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const membersRes = await supabaseRest<MemberRow[]>(`team_members?team_id=eq.${teamId}&select=*`);
  const memberRows = membersRes.data ?? [];
  const userIds = memberRows.map((row) => row.user_id).filter(Boolean);

  const emailByUserId = Object.fromEntries(
    memberRows.map((row) => [row.user_id, row.member_email ?? null]),
  );
  const progressByUser = await fetchProgressByUserIds(userIds, emailByUserId);

  const members: TeamMemberView[] = memberRows
    .map((row) => buildMemberViewFromProgress(row, progressByUser.get(row.user_id) ?? null))
    .sort((a, b) => b.form.score - a.form.score);

  const scoutingRes = await supabaseRest<ScoutingRow[]>(
    `opponent_scouting?team_id=eq.${teamId}&select=*&order=updated_at.desc`,
  );
  const scouting: OpponentScoutingEntry[] = (scoutingRes.data ?? []).map((row) => ({
    id: row.id,
    opponentName: row.opponent_name,
    styles: normalizeOpponentStyles(row.styles),
    notes: row.notes,
    updatedAt: row.updated_at,
  }));

  let inviteToken: string | null = null;
  if (["owner", "captain", "coach"].includes(membership.data[0].role)) {
    inviteToken = await getOrCreateTeamInviteToken(teamId, user.id);
  }

  const viewerProgress = progressByUser.get(user.id);
  const viewerSessions = parseWorkoutSessionsFromProgress(
    viewerProgress?.sessions,
    viewerProgress?.workout_history,
  );
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const viewerWorkouts14d = viewerSessions.filter((session) => new Date(session.dateISO) >= cutoff).length;

  const detail: TeamDetail = {
    team: {
      id: team.id,
      name: team.name,
      season: team.season,
      clubName: team.club_name,
    },
    members,
    scouting,
    inviteToken,
    syncMeta: {
      progressFound: Boolean(viewerProgress),
      workouts14d: viewerWorkouts14d,
      membersWithProgress: progressByUser.size,
    },
  };

  return NextResponse.json(detail);
}
