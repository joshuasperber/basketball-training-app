import { NextRequest, NextResponse } from "next/server";
import { isGameReminderDue, isWallClockDue, zonedDateParts } from "@/lib/game-reminder-window";
import { gameInvolvesOwnTeam, normalizeLeagueBundle } from "@/lib/league";
import { postgrestPath } from "@/lib/server/postgrest-query";
import { supabaseRest } from "@/lib/server/supabase-admin";
import { sendPush, type PushSubscriptionRow } from "@/lib/server/web-push";

export const dynamic = "force-dynamic";

type MemberRow = { team_id: string };
type LeagueRow = { team_id: string; league_data: unknown };
type ProgressRow = { profile_week_config: string | null; profile_cache: string | null; reminder_prefs: string | null };

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

function sentKeys(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").slice(-100) : [];
}

function parseJson(value: string | null) {
  if (!value) return null;
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

async function saveSentKeys(subscriptionId: string, keys: string[]) {
  await supabaseRest(postgrestPath("push_subscriptions", { id: `eq.${subscriptionId}` }), {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ sent_keys: keys.slice(-100), updated_at: new Date().toISOString() }),
  });
}

async function dispatchForSubscription(row: PushSubscriptionRow, now: Date, toleranceMinutes: number) {
  const alreadySent = new Set(sentKeys(row.sent_keys));
  const newlySent: string[] = [];
  const memberships = await supabaseRest<MemberRow[]>(postgrestPath("team_members", {
    user_id: `eq.${row.user_id}`,
    select: "team_id",
  }));
  const teamIds = [...new Set((memberships.data ?? []).map((entry) => entry.team_id))];
  if (teamIds.length > 0) {
    const leagues = await supabaseRest<LeagueRow[]>(postgrestPath("team_league_data", {
      team_id: `in.(${teamIds.join(",")})`,
      select: "team_id,league_data",
    }));
    for (const leagueRow of leagues.data ?? []) {
      const bundle = normalizeLeagueBundle(leagueRow.league_data);
      const names = new Map([[bundle.ownTeam.id, bundle.ownTeam.name], ...bundle.opponents.map((team) => [team.id, team.name] as const)]);
      for (const game of bundle.schedule) {
        if (!gameInvolvesOwnTeam(game) || game.status === "cancelled" || game.status === "postponed" || game.status === "final") continue;
        const opponentId = game.homeTeamId === bundle.ownTeam.id ? game.awayTeamId : game.homeTeamId;
        const opponent = names.get(opponentId ?? "") ?? "Gegner";
        const gameKey = `game:${game.id}:${game.date}:${game.startTime}:${row.reminder_minutes}`;
        if (!alreadySent.has(gameKey) && isGameReminderDue({ date: game.date, startTime: game.startTime, reminderMinutes: row.reminder_minutes, timeZone: row.timezone, now, toleranceMinutes })) {
          if (await sendPush(row, { title: `Spiel gegen ${opponent}`, body: `${game.startTime} Uhr${game.meetingTime ? ` · Treffpunkt ${game.meetingTime} Uhr` : ""}${game.venueName ? ` · ${game.venueName}` : ""}`, url: "/liga", tag: `game-reminder-${game.id}` })) newlySent.push(gameKey);
        }
        if (game.attendanceDeadline) {
          const [deadlineDate, deadlineTime] = game.attendanceDeadline.split("T");
          const attendanceKey = `attendance:${game.id}:${game.attendanceDeadline}`;
          if (!alreadySent.has(attendanceKey) && deadlineDate && deadlineTime && isWallClockDue({ date: deadlineDate, time: deadlineTime, timeZone: row.timezone, now, toleranceMinutes })) {
            if (await sendPush(row, { title: "Zusagefrist endet", body: `Bitte bestätige deine Teilnahme gegen ${opponent}.`, url: "/liga", tag: `attendance-${game.id}` })) newlySent.push(attendanceKey);
          }
        }
      }
    }
  }

  const progress = await supabaseRest<ProgressRow[]>(postgrestPath("user_progress", {
    user_id: `eq.${row.user_id}`,
    select: "profile_week_config,profile_cache,reminder_prefs",
    limit: 1,
  }));
  const progressRow = progress.data?.[0];
  const prefs = parseJson(progressRow?.reminder_prefs ?? null) as { enabled?: boolean; time?: string } | null;
  const directWeek = parseJson(progressRow?.profile_week_config ?? null);
  const profileCache = parseJson(progressRow?.profile_cache ?? null) as { weekConfig?: unknown } | null;
  const week = (directWeek && typeof directWeek === "object" ? directWeek : profileCache?.weekConfig) as Record<string, { mode?: string }> | undefined;
  if (prefs?.enabled && /^\d{2}:\d{2}$/.test(prefs.time ?? "") && week) {
    const local = zonedDateParts(now, row.timezone);
    const date = `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
    const pseudoDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
    const dayKey = DAY_KEYS[pseudoDate.getUTCDay()];
    const config = week[dayKey];
    const workoutKey = `workout:${date}:${prefs.time}`;
    if (config && config.mode !== "rest" && config.mode !== "unavailable" && !alreadySent.has(workoutKey) && isWallClockDue({ date, time: prefs.time!, timeZone: row.timezone, now, toleranceMinutes })) {
      if (await sendPush(row, { title: "Trainings-Reminder 🏀", body: "Deine geplante Einheit ist bereit.", url: "/weekly-workout", tag: `workout-${date}` })) newlySent.push(workoutKey);
    }
  }

  if (newlySent.length > 0) await saveSentKeys(row.id, [...alreadySent, ...newlySent]);
  return newlySent.length;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const all = await supabaseRest<PushSubscriptionRow[]>(postgrestPath("push_subscriptions", {
    enabled: "eq.true",
    game_reminders: "eq.true",
    select: "id,user_id,endpoint,subscription,game_updates,game_reminders,reminder_minutes,timezone,sent_keys",
    limit: 1000,
  }));
  if (!all.ok) return NextResponse.json({ error: "read_failed" }, { status: 502 });
  const toleranceMinutes = Math.max(5, Math.min(60, Number(process.env.PUSH_DISPATCH_TOLERANCE_MINUTES) || 15));
  const results = await Promise.all((all.data ?? []).map((row) => dispatchForSubscription(row, new Date(), toleranceMinutes)));
  return NextResponse.json({ ok: true, subscriptions: results.length, notifications: results.reduce((sum, count) => sum + count, 0) });
}
