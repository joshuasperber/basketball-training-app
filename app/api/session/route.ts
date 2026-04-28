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
};

type ProgressRow = {
  email: string;
  sessions: SessionDatabase | null;
  daily_plan_map: DailyPlanMap | null;
  manual_day_workouts_map: Record<string, unknown[]> | null;
  manual_day_disabled_map: Record<string, boolean> | null;
  hidden_auto_workouts_map: Record<string, string[]> | null;
  profile_cache: string | null;
  xp_history: string | null;
  xp_progression: string | null;
  updated_at?: string;
};

const emptySessions: SessionDatabase = { workoutSessions: [], exerciseHistory: {} };

function isConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey);
}

function defaultProgress(): ProgressRecord {
  return {
    sessions: emptySessions,
    dailyPlanMap: {},
    manualDayWorkoutsMap: {},
    manualDayDisabledMap: {},
    profileCache: null,
    xpHistory: null,
    xpProgression: null,
    hiddenAutoWorkoutsMap: {},
  };
}

async function getRequestUserEmail(request: NextRequest): Promise<string | null> {
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
  const user = (await response.json()) as { email?: string };
  return user.email?.trim().toLowerCase() ?? null;
}

function mapRowToProgress(row: ProgressRow | null): ProgressRecord {
  if (!row) return defaultProgress();

  return {
    sessions: row.sessions ?? emptySessions,
    dailyPlanMap: row.daily_plan_map ?? {},
    manualDayWorkoutsMap: row.manual_day_workouts_map ?? {},
    manualDayDisabledMap: row.manual_day_disabled_map ?? {},
    profileCache: row.profile_cache ?? null,
    xpHistory: row.xp_history ?? null,
    xpProgression: row.xp_progression ?? null,
    hiddenAutoWorkoutsMap: row.hidden_auto_workouts_map ?? {},
  };
}

async function readProgress(email: string): Promise<ProgressRecord> {
  const url = new URL(`${supabaseUrl}/rest/v1/user_progress`);
  url.searchParams.set("email", `eq.${email}`);
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      apikey: supabaseServiceRoleKey!,
      Authorization: `Bearer ${supabaseServiceRoleKey!}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return defaultProgress();
  }

  const rows = (await response.json()) as ProgressRow[];
  const row = Array.isArray(rows) ? rows[0] ?? null : null;
  return mapRowToProgress(row);
}

async function writeProgress(email: string, payload: ProgressRecord): Promise<boolean> {
  const url = new URL(`${supabaseUrl}/rest/v1/user_progress`);
  url.searchParams.set("on_conflict", "email");

  const row: ProgressRow = {
    email,
    sessions: payload.sessions ?? emptySessions,
    daily_plan_map: payload.dailyPlanMap ?? {},
    manual_day_workouts_map: payload.manualDayWorkoutsMap ?? {},
    manual_day_disabled_map: payload.manualDayDisabledMap ?? {},
    hidden_auto_workouts_map: payload.hiddenAutoWorkoutsMap ?? {},
    profile_cache: payload.profileCache ?? null,
    xp_history: payload.xpHistory ?? null,
    xp_progression: payload.xpProgression ?? null,
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

  return response.ok;
}

export async function GET(request: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 500 });
  }

  const email = await getRequestUserEmail(request);
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const progress = await readProgress(email);
  return NextResponse.json(progress);
}

export async function POST(request: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 500 });
  }

  const email = await getRequestUserEmail(request);
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as ProgressRecord | null;

  if (!payload?.sessions || !payload?.dailyPlanMap) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const ok = await writeProgress(email, payload);
  if (!ok) {
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}