import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseRest } from "@/lib/server/supabase-admin";
import { isUuid, postgrestPath } from "@/lib/server/postgrest-query";

type MemberRow = { role: string };
type TokenRow = { token: string; revoked_at: string | null };

function feedUrl(request: NextRequest, token: string) {
  return `${request.nextUrl.origin}/api/calendar/feed/${token}`;
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { teamId?: unknown } | null;
  if (!isUuid(body?.teamId)) return NextResponse.json({ error: "invalid_team" }, { status: 400 });
  const teamId = body.teamId;
  const membership = await supabaseRest<MemberRow[]>(postgrestPath("team_members", {
    team_id: `eq.${teamId}`,
    user_id: `eq.${user.id}`,
    select: "role",
    limit: 1,
  }));
  if (!membership.data?.[0]) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const existing = await supabaseRest<TokenRow[]>(postgrestPath("calendar_feed_tokens", {
    user_id: `eq.${user.id}`,
    team_id: `eq.${teamId}`,
    select: "token,revoked_at",
    limit: 1,
  }));
  const current = existing.data?.[0];
  if (current) {
    if (current.revoked_at) {
      const removed = await supabaseRest(postgrestPath("calendar_feed_tokens", { token: `eq.${current.token}` }), {
        method: "DELETE",
      });
      if (!removed.ok) return NextResponse.json({ error: "create_failed" }, { status: 502 });
    } else {
      return NextResponse.json({ url: feedUrl(request, current.token) });
    }
  }

  const created = await supabaseRest<TokenRow[]>("calendar_feed_tokens", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({ user_id: user.id, team_id: teamId }),
  });
  const token = created.data?.[0]?.token;
  if (!created.ok || !token) return NextResponse.json({ error: "create_failed" }, { status: 502 });
  return NextResponse.json({ url: feedUrl(request, token) });
}

export async function DELETE(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { teamId?: unknown } | null;
  if (!isUuid(body?.teamId)) return NextResponse.json({ error: "invalid_team" }, { status: 400 });
  const result = await supabaseRest(postgrestPath("calendar_feed_tokens", {
    user_id: `eq.${user.id}`,
    team_id: `eq.${body.teamId}`,
  }), {
    method: "DELETE",
  });
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "revoke_failed" }, { status: 502 });
}
