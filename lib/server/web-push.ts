import webPush, { type PushSubscription } from "web-push";
import { normalizeLeagueBundle, type LeagueBundle, type LeagueScheduleEntry } from "@/lib/league";
import { postgrestPath } from "@/lib/server/postgrest-query";
import { supabaseRest } from "@/lib/server/supabase-admin";

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  subscription: PushSubscription;
  game_updates: boolean;
  game_reminders: boolean;
  reminder_minutes: number;
  timezone: string;
  sent_keys?: unknown;
};

export function isWebPushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY &&
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY &&
    process.env.WEB_PUSH_VAPID_SUBJECT,
  );
}

function configureWebPush() {
  if (!isWebPushConfigured()) return false;
  webPush.setVapidDetails(
    process.env.WEB_PUSH_VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY!,
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY!,
  );
  return true;
}

export async function sendPush(row: PushSubscriptionRow, payload: { title: string; body: string; url: string; tag: string }) {
  if (!configureWebPush()) return false;
  try {
    await webPush.sendNotification(row.subscription, JSON.stringify(payload), { TTL: 60 * 60, timeout: 5_000 });
    return true;
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
    if (status === 404 || status === 410) {
      await supabaseRest(postgrestPath("push_subscriptions", { id: `eq.${row.id}` }), { method: "DELETE" });
    }
    return false;
  }
}

export async function getPushSubscriptionsForUsers(userIds: string[], preference: "game_updates" | "game_reminders") {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  if (!isWebPushConfigured() || uniqueIds.length === 0) return [];
  const result = await supabaseRest<PushSubscriptionRow[]>(postgrestPath("push_subscriptions", {
    user_id: `in.(${uniqueIds.join(",")})`,
    enabled: "eq.true",
    [preference]: "eq.true",
    select: "id,user_id,endpoint,subscription,game_updates,game_reminders,reminder_minutes,timezone,sent_keys",
  }));
  return result.ok ? result.data ?? [] : [];
}

function gameLabel(game: LeagueScheduleEntry, bundle: LeagueBundle) {
  const teams = new Map([
    [bundle.ownTeam.id, bundle.ownTeam.name],
    ...bundle.opponents.map((team) => [team.id, team.name] as const),
  ]);
  return `${teams.get(game.homeTeamId ?? "") ?? "Heimteam"} – ${teams.get(game.awayTeamId ?? "") ?? "Auswärtsteam"}`;
}

export function describeScheduleChange(beforeValue: unknown, afterValue: unknown) {
  const before = normalizeLeagueBundle(beforeValue);
  const after = normalizeLeagueBundle(afterValue);
  const beforeById = new Map(before.schedule.map((game) => [game.id, game]));
  const afterById = new Map(after.schedule.map((game) => [game.id, game]));
  for (const game of after.schedule) {
    if (!beforeById.has(game.id)) return { title: "Neues Spiel im Team", body: `${gameLabel(game, after)} · ${game.date}${game.startTime ? ` um ${game.startTime}` : ""}`, url: "/liga", tag: `league-game-${game.id}` };
  }
  for (const game of before.schedule) {
    if (!afterById.has(game.id)) return { title: "Spielplan geändert", body: `${gameLabel(game, before)} wurde aus dem Spielplan entfernt.`, url: "/liga", tag: `league-game-removed-${game.id}` };
  }
  for (const game of after.schedule) {
    const previous = beforeById.get(game.id);
    if (!previous) continue;
    const beforeLogistics = JSON.stringify([previous.date, previous.startTime, previous.status, previous.venueName, previous.venueAddress, previous.meetingTime]);
    const afterLogistics = JSON.stringify([game.date, game.startTime, game.status, game.venueName, game.venueAddress, game.meetingTime]);
    if (beforeLogistics !== afterLogistics) return { title: "Spiel wurde aktualisiert", body: `${gameLabel(game, after)} · ${game.date}${game.startTime ? ` um ${game.startTime}` : ""} · ${game.status ?? "scheduled"}`, url: "/liga", tag: `league-game-${game.id}` };
  }
  return null;
}

export async function notifyTeamScheduleChange(teamId: string, before: unknown, after: unknown) {
  const change = describeScheduleChange(before, after);
  if (!change) return;
  const members = await supabaseRest<{ user_id: string }[]>(postgrestPath("team_members", {
    team_id: `eq.${teamId}`,
    select: "user_id",
  }));
  if (!members.ok) return;
  const subscriptions = await getPushSubscriptionsForUsers((members.data ?? []).map((row) => row.user_id), "game_updates");
  await Promise.allSettled(subscriptions.map((row) => sendPush(row, change)));
}
