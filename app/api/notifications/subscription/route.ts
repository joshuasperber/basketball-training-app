import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseRest } from "@/lib/server/supabase-admin";
import { postgrestPath } from "@/lib/server/postgrest-query";
import { isWebPushConfigured } from "@/lib/server/web-push";

type SubscriptionInput = {
  endpoint?: unknown;
  expirationTime?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

function validSubscription(value: unknown): value is PushSubscriptionJSON & { endpoint: string; keys: { p256dh: string; auth: string } } {
  if (!value || typeof value !== "object") return false;
  const raw = value as SubscriptionInput;
  return typeof raw.endpoint === "string" && raw.endpoint.startsWith("https://") && raw.endpoint.length <= 2048 &&
    typeof raw.keys?.p256dh === "string" && raw.keys.p256dh.length <= 256 &&
    typeof raw.keys?.auth === "string" && raw.keys.auth.length <= 256;
}

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await supabaseRest<{ endpoint: string; game_updates: boolean; game_reminders: boolean; reminder_minutes: number }[]>(postgrestPath("push_subscriptions", {
    user_id: `eq.${user.id}`,
    enabled: "eq.true",
    select: "endpoint,game_updates,game_reminders,reminder_minutes",
  }));
  if (!result.ok && result.status !== 404) return NextResponse.json({ error: "read_failed" }, { status: 502 });
  return NextResponse.json({
    configured: isWebPushConfigured(),
    publicKey: isWebPushConfigured() ? process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY : null,
    subscriptions: result.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isWebPushConfigured()) return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  const body = await request.json().catch(() => null) as { subscription?: unknown; reminderMinutes?: unknown; timeZone?: unknown } | null;
  if (!validSubscription(body?.subscription)) return NextResponse.json({ error: "invalid_subscription" }, { status: 400 });
  const reminderMinutes = Number(body?.reminderMinutes ?? 120);
  if (!Number.isInteger(reminderMinutes) || reminderMinutes < 15 || reminderMinutes > 10080) return NextResponse.json({ error: "invalid_reminder" }, { status: 400 });
  const timeZone = typeof body?.timeZone === "string" && body.timeZone.length <= 80 ? body.timeZone : "Europe/Berlin";
  const existing = await supabaseRest<{ user_id: string }[]>(postgrestPath("push_subscriptions", {
    endpoint: `eq.${body.subscription.endpoint}`,
    select: "user_id",
    limit: 1,
  }));
  if (!existing.ok) return NextResponse.json({ error: "read_failed" }, { status: 502 });
  if (existing.data?.[0] && existing.data[0].user_id !== user.id) {
    return NextResponse.json({ error: "subscription_owned_by_other_user" }, { status: 409 });
  }
  const result = await supabaseRest("push_subscriptions?on_conflict=endpoint", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({
      user_id: user.id,
      endpoint: body.subscription.endpoint,
      subscription: body.subscription,
      enabled: true,
      game_updates: true,
      game_reminders: true,
      reminder_minutes: reminderMinutes,
      timezone: timeZone,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!result.ok) return NextResponse.json({ error: "write_failed" }, { status: 502 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string" || !body.endpoint.startsWith("https://")) return NextResponse.json({ error: "invalid_endpoint" }, { status: 400 });
  const result = await supabaseRest(postgrestPath("push_subscriptions", {
    user_id: `eq.${user.id}`,
    endpoint: `eq.${body.endpoint}`,
  }), { method: "DELETE" });
  if (!result.ok) return NextResponse.json({ error: "delete_failed" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
