import { NextResponse } from "next/server";
import {
  appendExerciseHistory,
  appendWorkoutSession,
} from "@/lib/session-db";
import { WorkoutSessionEntry } from "@/lib/session-types";

export async function POST(request: Request) {
  const payload = (await request.json()) as WorkoutSessionEntry;

  if (!payload.workoutId || !payload.workoutName || !Array.isArray(payload.logs)) {
    return NextResponse.json({ error: "Invalid workout payload" }, { status: 400 });
  }

  await appendWorkoutSession(payload);

  for (const log of payload.logs) {
    if (log.completedValue === null || !Number.isFinite(log.completedValue)) continue;

    await appendExerciseHistory({
      id: `eh-${Date.now()}-${log.exerciseId}`,
      dateISO: payload.dateISO,
      exerciseId: log.exerciseId,
      value: log.completedValue,
      note: log.note,
      source: "workout",
      workoutId: payload.workoutId,
    });
  }

  return NextResponse.json({ ok: true });
}