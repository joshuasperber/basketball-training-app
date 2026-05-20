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
  manualPlanOverrides: string | null;
  weeklyRegenSlotMap: Record<string, boolean>;
  profileCache: string | null;
  profileUsername: string | null;
  profileWeekConfig: string | null;
  playerIntake: string | null;
  xpHistory: string | null;
  xpProgression: string | null;
  hiddenAutoWorkoutsMap: Record<string, string[]>;
  performanceTips: string | null;
  gameStats: string | null;
  trainingGoals: string | null;
  customSubcategories: string | null;
  workoutHistory: string | null;
  reminderPrefs: string | null;
  coachWeeklyNote: string | null;
  trainingExercises: string | null;
  trainingWorkouts: string | null;
  workoutOverrides: Record<string, string>;
  remoteExists?: boolean;
};

type ProgressRow = {
  email: string;
  user_id?: string | null;
  sessions: SessionDatabase | null;
  daily_plan_map: DailyPlanMap | null;
  manual_day_workouts_map: Record<string, unknown[]> | null;
  manual_day_disabled_map: Record<string, boolean> | null;
  manual_plan_overrides: string | null;
  weekly_regen_slot_map: Record<string, boolean> | null;
  hidden_auto_workouts_map: Record<string, string[]> | null;
  profile_cache: string | null;
  profile_username: string | null;
  profile_week_config: string | null;
  player_intake: string | null;
  xp_history: string | null;
  xp_progression: string | null;
  performance_tips: string | null;
  game_stats: string | null;
  training_goals: string | null;
  custom_subcategories: string | null;
  workout_history: string | null;
  reminder_prefs: string | null;
  coach_weekly_note: string | null;
  training_exercises: string | null;
  training_workouts: string | null;
  workout_overrides: Record<string, string> | null;
  updated_at?: string | null;
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
    manualPlanOverrides: null,
    weeklyRegenSlotMap: {},
    profileCache: null,
    profileUsername: null,
    profileWeekConfig: null,
    playerIntake: null,
    xpHistory: null,
    xpProgression: null,
    hiddenAutoWorkoutsMap: {},
    performanceTips: null,
    gameStats: null,
    trainingGoals: null,
    customSubcategories: null,
    workoutHistory: null,
    reminderPrefs: null,
    coachWeeklyNote: null,
    trainingExercises: null,
    trainingWorkouts: null,
    workoutOverrides: {},
    remoteExists: false,
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
    manualPlanOverrides: row.manual_plan_overrides ?? null,
    weeklyRegenSlotMap: row.weekly_regen_slot_map ?? {},
    profileCache: row.profile_cache ?? null,
    profileUsername: row.profile_username ?? null,
    profileWeekConfig: row.profile_week_config ?? null,
    playerIntake: row.player_intake ?? null,
    xpHistory: row.xp_history ?? null,
    xpProgression: row.xp_progression ?? null,
    hiddenAutoWorkoutsMap: row.hidden_auto_workouts_map ?? {},
    performanceTips: row.performance_tips ?? null,
    gameStats: row.game_stats ?? null,
    trainingGoals: row.training_goals ?? null,
    customSubcategories: row.custom_subcategories ?? null,
    workoutHistory: row.workout_history ?? null,
    reminderPrefs: row.reminder_prefs ?? null,
    coachWeeklyNote: row.coach_weekly_note ?? null,
    trainingExercises: row.training_exercises ?? null,
    trainingWorkouts: row.training_workouts ?? null,
    workoutOverrides: row.workout_overrides ?? {},
    remoteExists: true,
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
  const row = rows?.[0] ?? null;
  return row ? mapRowToProgressRecord(row) : null;
}

/** Leerer String = Feld bewusst löschen; null = nicht überschreiben (Cloud-Wert behalten). */
function mergeCloudTextField(incoming: string | null | undefined, existing: string | null | undefined): string | null {
  if (incoming === "") return null;
  if (incoming != null) return incoming;
  return existing ?? null;
}

function mergeProgressWithExisting(existing: ProgressRecord | null, incoming: ProgressRecord): ProgressRecord {
  if (!existing?.remoteExists) return incoming;
  return {
    ...incoming,
    profileCache: mergeCloudTextField(incoming.profileCache, existing.profileCache),
    profileUsername: mergeCloudTextField(incoming.profileUsername, existing.profileUsername),
    profileWeekConfig: mergeCloudTextField(incoming.profileWeekConfig, existing.profileWeekConfig),
    playerIntake: mergeCloudTextField(incoming.playerIntake, existing.playerIntake),
    xpHistory: mergeCloudTextField(incoming.xpHistory, existing.xpHistory),
    xpProgression: mergeCloudTextField(incoming.xpProgression, existing.xpProgression),
    performanceTips: mergeCloudTextField(incoming.performanceTips, existing.performanceTips),
    gameStats: mergeCloudTextField(incoming.gameStats, existing.gameStats),
    trainingGoals: mergeCloudTextField(incoming.trainingGoals, existing.trainingGoals),
    customSubcategories: mergeCloudTextField(incoming.customSubcategories, existing.customSubcategories),
    workoutHistory: mergeCloudTextField(incoming.workoutHistory, existing.workoutHistory),
    reminderPrefs: mergeCloudTextField(incoming.reminderPrefs, existing.reminderPrefs),
    coachWeeklyNote: mergeCloudTextField(incoming.coachWeeklyNote, existing.coachWeeklyNote),
    trainingExercises: mergeCloudTextField(incoming.trainingExercises, existing.trainingExercises),
    trainingWorkouts: mergeCloudTextField(incoming.trainingWorkouts, existing.trainingWorkouts),
    manualPlanOverrides: mergeCloudTextField(incoming.manualPlanOverrides, existing.manualPlanOverrides),
  };
}

async function writeProgressToSupabase(user: AuthedUser, payload: ProgressRecord): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const existing = await readProgressFromSupabase(user);
  const merged = mergeProgressWithExisting(existing, payload);

  const url = new URL(`${supabaseUrl}/rest/v1/user_progress`);
  url.searchParams.set("on_conflict", "email");

  const row: ProgressRow = {
    email: user.email,
    user_id: user.id,
    sessions: merged.sessions ?? emptySessions,
    daily_plan_map: merged.dailyPlanMap ?? {},
    manual_day_workouts_map: merged.manualDayWorkoutsMap ?? {},
    manual_day_disabled_map: merged.manualDayDisabledMap ?? {},
    manual_plan_overrides: merged.manualPlanOverrides ?? null,
    weekly_regen_slot_map: merged.weeklyRegenSlotMap ?? {},
    hidden_auto_workouts_map: merged.hiddenAutoWorkoutsMap ?? {},
    profile_cache: merged.profileCache ?? null,
    profile_username: merged.profileUsername ?? null,
    profile_week_config: merged.profileWeekConfig ?? null,
    player_intake: merged.playerIntake ?? null,
    xp_history: merged.xpHistory ?? null,
    xp_progression: merged.xpProgression ?? null,
    performance_tips: merged.performanceTips ?? null,
    game_stats: merged.gameStats ?? null,
    training_goals: merged.trainingGoals ?? null,
    custom_subcategories: merged.customSubcategories ?? null,
    workout_history: merged.workoutHistory ?? null,
    reminder_prefs: merged.reminderPrefs ?? null,
    coach_weekly_note: merged.coachWeeklyNote ?? null,
    training_exercises: merged.trainingExercises ?? null,
    training_workouts: merged.trainingWorkouts ?? null,
    workout_overrides: merged.workoutOverrides ?? {},
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

  // Fallback: ältere Datenbanken ohne neue optionale Spalten.
  const legacyRow = {
    email: row.email,
    user_id: row.user_id,
    sessions: row.sessions,
    daily_plan_map: row.daily_plan_map,
    manual_day_workouts_map: row.manual_day_workouts_map,
    manual_day_disabled_map: row.manual_day_disabled_map,
    hidden_auto_workouts_map: row.hidden_auto_workouts_map,
    profile_cache: row.profile_cache,
    profile_username: row.profile_username,
    profile_week_config: row.profile_week_config,
    player_intake: row.player_intake,
    xp_history: row.xp_history,
    xp_progression: row.xp_progression,
    performance_tips: row.performance_tips,
    game_stats: row.game_stats,
    training_goals: row.training_goals,
    custom_subcategories: row.custom_subcategories,
    workout_history: row.workout_history,
    reminder_prefs: row.reminder_prefs,
    coach_weekly_note: row.coach_weekly_note,
    training_exercises: row.training_exercises,
    training_workouts: row.training_workouts,
  };
  const legacyResponse = await fetch(url.toString(), {
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
