import { NextRequest, NextResponse } from "next/server";
import { buildLeagueCalendarIcs } from "@/lib/league-calendar";
import { gameInvolvesOwnTeam, normalizeLeagueBundle } from "@/lib/league";
import { isUuid, postgrestPath } from "@/lib/server/postgrest-query";
import { supabaseRest } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";

type TokenRow = { team_id: string };
type LeagueRow = { league_data: unknown; version?: number };

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!isUuid(token)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const tokenResult = await supabaseRest<TokenRow[]>(postgrestPath("calendar_feed_tokens", {
    token: `eq.${token}`,
    revoked_at: "is.null",
    select: "team_id",
    limit: 1,
  }));
  const tokenRow = tokenResult.data?.[0];
  if (!tokenRow) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const leagueResult = await supabaseRest<LeagueRow[]>(postgrestPath("team_league_data", {
    team_id: `eq.${tokenRow.team_id}`,
    select: "league_data,version",
    limit: 1,
  }));
  const leagueRow = leagueResult.data?.[0];
  if (!leagueRow) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const bundle = normalizeLeagueBundle(leagueRow.league_data);
  const teamNames = new Map([[bundle.ownTeam.id, bundle.ownTeam.name], ...bundle.opponents.map((team) => [team.id, team.name] as const)]);
  const entries = bundle.schedule.filter(gameInvolvesOwnTeam);
  const calendar = buildLeagueCalendarIcs(entries, (id) => teamNames.get(id ?? "") ?? "");
  return new NextResponse(calendar, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=team-spielplan.ics",
      "Cache-Control": "private, max-age=300, stale-while-revalidate=3600",
      ETag: `W/\"league-${leagueRow.version ?? 0}\"`,
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
