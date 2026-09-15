import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseRest } from "@/lib/server/supabase-admin";
import { isUuid, postgrestPath } from "@/lib/server/postgrest-query";
import { notifyTeamScheduleChange } from "@/lib/server/web-push";

type MemberRow = { role: string };
type LeagueChangeEntry = {
  id: string;
  at: string;
  userId: string;
  userLabel: string;
  summary: string;
};

type LeagueDataRow = {
  league_data: unknown;
  updated_at: string;
  version?: number;
  change_log?: unknown;
};

function normalizeChangeLog(value: unknown): LeagueChangeEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Partial<LeagueChangeEntry>;
    if (typeof raw.id !== "string" || typeof raw.at !== "string" || typeof raw.summary !== "string") return [];
    return [{
      id: raw.id,
      at: raw.at,
      userId: typeof raw.userId === "string" ? raw.userId : "",
      userLabel: typeof raw.userLabel === "string" ? raw.userLabel : "Teammitglied",
      summary: raw.summary.slice(0, 160),
    }];
  }).slice(-30);
}

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
      select: "league_data,updated_at,version,change_log",
      limit: 1,
    }),
  );
  if (!result.ok) return NextResponse.json({ error: "read_failed" }, { status: 502 });

  const row = result.data?.[0];
  return NextResponse.json({
    bundle: row?.league_data ?? null,
    updatedAt: row?.updated_at ?? null,
    version: row?.version ?? 0,
    history: normalizeChangeLog(row?.change_log),
    canEdit: membership.role === "owner" || membership.role === "captain",
  });
}

export async function PUT(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    teamId?: string;
    bundle?: unknown;
    expectedVersion?: number;
    summary?: string;
  } | null;
  const teamId = body?.teamId?.trim();
  const expectedVersion = Number(body?.expectedVersion);
  if (
    !isUuid(teamId) ||
    !body?.bundle ||
    typeof body.bundle !== "object" ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 0
  ) {
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

  const currentResult = await supabaseRest<LeagueDataRow[]>(
    postgrestPath("team_league_data", {
      team_id: `eq.${teamId}`,
      select: "league_data,updated_at,version,change_log",
      limit: 1,
    }),
  );
  if (!currentResult.ok) return NextResponse.json({ error: "read_failed" }, { status: 502 });

  const current = currentResult.data?.[0];
  const currentVersion = current?.version ?? 0;
  const currentHistory = normalizeChangeLog(current?.change_log);
  if (currentVersion !== expectedVersion) {
    return NextResponse.json({
      error: "version_conflict",
      bundle: current?.league_data ?? null,
      updatedAt: current?.updated_at ?? null,
      version: currentVersion,
      history: currentHistory,
    }, { status: 409 });
  }

  const updatedAt = new Date().toISOString();
  const version = currentVersion + 1;
  const summary = typeof body.summary === "string" && body.summary.trim()
    ? body.summary.trim().slice(0, 160)
    : "Ligadaten aktualisiert";
  const history = [...currentHistory, {
    id: `${version}-${updatedAt}`,
    at: updatedAt,
    userId: user.id,
    userLabel: user.email,
    summary,
  }].slice(-30);

  if (!current) {
    const inserted = await supabaseRest<LeagueDataRow[]>("team_league_data", {
      method: "POST",
      prefer: "return=representation",
      body: JSON.stringify({
        team_id: teamId,
        league_data: body.bundle,
        updated_by: user.id,
        updated_at: updatedAt,
        version,
        change_log: history,
      }),
    });
    if (!inserted.ok) {
      // A concurrent first writer may have created the row in the meantime.
      return NextResponse.json({ error: "version_conflict" }, { status: 409 });
    }
    await notifyTeamScheduleChange(teamId, null, body.bundle).catch(() => undefined);
    return NextResponse.json({ ok: true, updatedAt, version, history });
  }

  const result = await supabaseRest<LeagueDataRow[]>(
    postgrestPath("team_league_data", {
      team_id: `eq.${teamId}`,
      version: `eq.${currentVersion}`,
      select: "league_data,updated_at,version,change_log",
    }),
    {
      method: "PATCH",
      prefer: "return=representation",
      body: JSON.stringify({
        league_data: body.bundle,
        updated_by: user.id,
        updated_at: updatedAt,
        version,
        change_log: history,
      }),
    },
  );
  if (!result.ok) return NextResponse.json({ error: "write_failed" }, { status: 502 });
  if (!result.data?.length) {
    return NextResponse.json({ error: "version_conflict" }, { status: 409 });
  }
  await notifyTeamScheduleChange(teamId, current.league_data, body.bundle).catch(() => undefined);
  return NextResponse.json({ ok: true, updatedAt, version, history });
}
