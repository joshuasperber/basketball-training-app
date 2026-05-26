import { supabaseRest } from "@/lib/server/supabase-admin";
import { createInviteToken } from "@/lib/server/team-progress";

type InviteRow = { token: string };

export async function getOrCreateTeamInviteToken(teamId: string, createdBy: string): Promise<string | null> {
  const existing = await supabaseRest<Array<InviteRow & { max_uses: number; use_count: number }>>(
    `team_invites?team_id=eq.${teamId}&expires_at=gte.${new Date().toISOString()}&select=token,max_uses,use_count&order=created_at.desc&limit=1`,
  );
  const row = existing.data?.find((invite) => invite.use_count < invite.max_uses);
  if (row?.token) return row.token;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);
  const token = createInviteToken();
  const created = await supabaseRest<InviteRow[]>("team_invites", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({
      team_id: teamId,
      token,
      created_by: createdBy,
      expires_at: expiresAt.toISOString(),
      max_uses: 20,
      use_count: 0,
    }),
  });
  return created.data?.[0]?.token ?? (created.ok ? token : null);
}
