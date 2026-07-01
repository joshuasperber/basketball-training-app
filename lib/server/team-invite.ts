import { supabaseRest } from "@/lib/server/supabase-admin";
import { createInviteToken } from "@/lib/server/team-progress";
import type { TeamRole } from "@/lib/team-types";

type InviteRow = { token: string };

export async function getOrCreateTeamInviteToken(
  teamId: string,
  createdBy: string,
  invitedRole: Extract<TeamRole, "player" | "coach"> = "player",
): Promise<string | null> {
  const existing = await supabaseRest<Array<InviteRow & { max_uses: number; use_count: number; invited_role?: string }>>(
    `team_invites?team_id=eq.${teamId}&expires_at=gte.${new Date().toISOString()}&select=token,max_uses,use_count,invited_role&order=created_at.desc&limit=5`,
  );
  const row = existing.data?.find(
    (invite) => invite.use_count < invite.max_uses && (invite.invited_role ?? "player") === invitedRole,
  );
  if (row?.token) return row.token;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);
  const token = createInviteToken();
  const payload = {
    team_id: teamId,
    token,
    created_by: createdBy,
    expires_at: expiresAt.toISOString(),
    max_uses: 20,
    use_count: 0,
    invited_role: invitedRole,
  };
  let created = await supabaseRest<InviteRow[]>("team_invites", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify(payload),
  });
  if (!created.ok) {
    const { invited_role: _role, ...legacyPayload } = payload;
    created = await supabaseRest<InviteRow[]>("team_invites", {
      method: "POST",
      prefer: "return=representation",
      body: JSON.stringify(legacyPayload),
    });
  }
  return created.data?.[0]?.token ?? (created.ok ? token : null);
}
