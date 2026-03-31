import { NextResponse } from "next/server";
import { appendExerciseHistory } from "@/lib/session-db";
import { ExerciseHistoryEntry } from "@/lib/session-types";

export async function POST(request: Request) {
  const payload = (await request.json()) as ExerciseHistoryEntry[];
  if (!Array.isArray(payload)) {
    return NextResponse.json({ error: "Invalid exercise payload" }, { status: 400 });
  }

  for (const entry of payload) {
    if (!entry.exerciseId || !Number.isFinite(entry.value)) continue;
    await appendExerciseHistory(entry);
  }

  return NextResponse.json({ ok: true });
}