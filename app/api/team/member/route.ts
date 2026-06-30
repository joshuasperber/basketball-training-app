import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseRest } from "@/lib/server/supabase-admin";
import type { TeamShareLevel } from "@/lib/team-types";

type MemberRow = { id: string; user_id: string; share_level: TeamShareLevel };

export async function PATCH(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    teamId?: string;
    shareLevel?: TeamShareLevel;
  } | null;

  const teamId = body?.teamId?.trim();
  const shareLevel = body?.shareLevel;
  if (!teamId || (shareLevel !== "summary" && shareLevel !== "full")) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const membership = await supabaseRest<MemberRow[]>(
    `team_members?team_id=eq.${teamId}&user_id=eq.${user.id}&select=id,user_id,share_level&limit=1`,
  );
  if (!membership.ok || !membership.data?.[0]) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const update = await supabaseRest<MemberRow[]>(
    `team_members?team_id=eq.${teamId}&user_id=eq.${user.id}`,
    {
      method: "PATCH",
      prefer: "return=representation",
      body: JSON.stringify({ share_level: shareLevel }),
    },
  );

  if (!update.ok) {
    return NextResponse.json({ error: "update_failed", detail: update.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true, shareLevel });
}
