import { NextRequest, NextResponse } from "next/server";
import { parseWorkoutSessionsFromProgress } from "@/lib/server/parse-user-progress";
import { getRequestUser } from "@/lib/server/supabase-admin";
import { readStoredProgress } from "@/lib/server/user-progress-store";
import { normalizeSupabaseProjectUrl } from "@/lib/supabase-env";

const supabaseUrl = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function readCloudSessions(user: { id: string; email: string }) {
  const row = await readStoredProgress(user);
  if (!row) return { sessionCount: 0, workouts14d: 0 };

  const sessions = parseWorkoutSessionsFromProgress(row.sessions, row.workout_history);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const workouts14d = sessions.filter((session) => new Date(session.dateISO) >= cutoff).length;
  return { sessionCount: sessions.length, workouts14d };
}

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cloud = await readCloudSessions(user);
  return NextResponse.json({
    id: user.id,
    email: user.email,
    cloud,
    supabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey),
  });
}
