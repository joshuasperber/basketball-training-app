import { NextRequest, NextResponse } from "next/server";
import type { SessionDatabase } from "@/lib/session-types";
import { getRequestUser } from "@/lib/server/supabase-admin";
import { writeStoredWorkoutProgress } from "@/lib/server/user-progress-store";

type WorkoutSyncPayload = {
  sessions?: SessionDatabase;
  workoutHistory?: string | null;
};

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as WorkoutSyncPayload | null;
  const sessions = body?.sessions;
  if (!sessions?.workoutSessions) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const result = await writeStoredWorkoutProgress(user, {
    sessions,
    workoutHistory: body?.workoutHistory ?? null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "write_failed", detail: result.error, sessionCount: result.sessionCount },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, sessionCount: result.sessionCount });
}
