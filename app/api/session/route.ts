import { NextRequest, NextResponse } from "next/server";
import { DailyPlanMap } from "@/lib/activity-calendar";
import { SessionDatabase } from "@/lib/session-types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type ProgressRecord = {
  sessions: SessionDatabase;
  dailyPlanMap: DailyPlanMap;
  manualDayWorkoutsMap: Record<string, unknown[]>;
  manualDayDisabledMap: Record<string, boolean>;
  profileCache: string | null;
  xpHistory: string | null;
  xpProgression: string | null;
  hiddenAutoWorkoutsMap: Record<string, string[]>;
  performanceTips: string | null;
  gameStats: string | null;
  trainingGoals: string | null;
};

type ProgressRow = {
  email: string;
  user_id?: string | null;
  sessions: SessionDatabase | null;
  daily_plan_map: DailyPlanMap | null;
  manual_day_workouts_map: Record<string, unknown[]> | null;
  manual_day_disabled_map: Record<string, boolean> | null;
  hidden_auto_workouts_map: Record<string, string[]> | null;
  profile_cache: string | null;
  xp_history: string | null;
  xp_progression: string | null;
  performance_tips: string | null;
  game_stats: string | null;
  training_goals: string | null;
};

type AuthedUser = { id: string; email: string };

const emptySessions: SessionDatabase = { workoutSessions: [], exerciseHistory: {} };

function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey);
}

function getDefaultProgress(): ProgressRecord {
  return {
    sessions: emptySessions,
    dailyPlanMap: {},
    manualDayWorkoutsMap: {},
    manualDayDisabledMap: {},
    profileCache: null,
    xpHistory: null,
    xpProgression: null,
    hiddenAutoWorkoutsMap: {},
    performanceTips: null,
    gameStats: null,
    trainingGoals: null,
  };
}

async function getRequestUser(request: NextRequest): Promise<AuthedUser | null> {
  const accessToken = request.cookies.get("sb-access-token")?.value;
  if (!accessToken || !supabaseUrl || !supabaseAnonKey) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) return null;
  const user = (await response.json()) as { id?: string; email?: string };
  const id = user.id?.trim();
  const email = user.email?.trim().toLowerCase();
  if (!id || !email) return null;
  return { id, email };
}

function mapRowToProgressRecord(row: ProgressRow | null): ProgressRecord {
  if (!row) return getDefaultProgress();

  return {
    sessions: row.sessions ?? emptySessions,
    dailyPlanMap: row.daily_plan_map ?? {},
    manualDayWorkoutsMap: row.manual_day_workouts_map ?? {},
    manualDayDisabledMap: row.manual_day_disabled_map ?? {},
    profileCache: row.profile_cache ?? null,
    xpHistory: row.xp_history ?? null,
    xpProgression: row.xp_progression ?? null,
    hiddenAutoWorkoutsMap: row.hidden_auto_workouts_map ?? {},
    performanceTips: row.performance_tips ?? null,
    gameStats: row.game_stats ?? null,
    trainingGoals: row.training_goals ?? null,
  };
}

async function readProgressFromSupabase(user: AuthedUser): Promise<ProgressRecord | null> {
  if (!isSupabaseConfigured()) return null;

  const tryFetch = async (filter: string): Promise<ProgressRow[] | null> => {
    const url = new URL(`${supabaseUrl}/rest/v1/user_progress`);
    url.searchParams.set("select", "*");
    url.searchParams.set("limit", "1");
    url.searchParams.set(...(filter.split("=", 2) as [string, string]));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        apikey: supabaseServiceRoleKey!,
        Authorization: `Bearer ${supabaseServiceRoleKey!}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as ProgressRow[];
  };

  let rows = await tryFetch(`user_id=eq.${user.id}`);
  if (!rows || rows.length === 0) {
    rows = await tryFetch(`email=eq.${user.email}`);
  }
  return mapRowToProgressRecord(rows?.[0] ?? null);
}

async function writeProgressToSupabase(user: AuthedUser, payload: ProgressRecord): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const url = new URL(`${supabaseUrl}/rest/v1/user_progress`);
  url.searchParams.set("on_conflict", "user_id");

  const row: ProgressRow = {
    email: user.email,
    user_id: user.id,
    sessions: payload.sessions ?? emptySessions,
    daily_plan_map: payload.dailyPlanMap ?? {},
    manual_day_workouts_map: payload.manualDayWorkoutsMap ?? {},
    manual_day_disabled_map: payload.manualDayDisabledMap ?? {},
    hidden_auto_workouts_map: payload.hiddenAutoWorkoutsMap ?? {},
    profile_cache: payload.profileCache ?? null,
    xp_history: payload.xpHistory ?? null,
    xp_progression: payload.xpProgression ?? null,
    performance_tips: payload.performanceTips ?? null,
    game_stats: payload.gameStats ?? null,
    training_goals: payload.trainingGoals ?? null,
  };

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey!,
      Authorization: `Bearer ${supabaseServiceRoleKey!}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
    cache: "no-store",
  });

  if (response.ok) return true;

  // Fallback: ältere Datenbanken ohne user_id-Spalte – Upsert über email.
  const legacyUrl = new URL(`${supabaseUrl}/rest/v1/user_progress`);
  legacyUrl.searchParams.set("on_conflict", "email");
  const legacyRow: ProgressRow = { ...row };
  delete legacyRow.user_id;
  const legacyResponse = await fetch(legacyUrl.toString(), {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey!,
      Authorization: `Bearer ${supabaseServiceRoleKey!}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(legacyRow),
    cache: "no-store",
  });
  return legacyResponse.ok;
}

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 500 });
  }

  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const progress = await readProgressFromSupabase(user);
  return NextResponse.json(progress ?? getDefaultProgress());
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 500 });
  }

  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as ProgressRecord | null;
  if (!payload?.sessions || !payload?.dailyPlanMap) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const ok = await writeProgressToSupabase(user, payload);
  if (!ok) {
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
