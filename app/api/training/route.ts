import { NextResponse } from "next/server";
import { readTrainingDb, writeTrainingDb } from "@/lib/training-db";
import { type Exercise, type Workout } from "@/lib/training-data";

type TrainingPayload = {
  exercises?: Exercise[];
  workouts?: Workout[];
};

export async function GET() {
  const db = await readTrainingDb();
  return NextResponse.json(db);
}

export async function POST(request: Request) {
  const payload = (await request.json()) as TrainingPayload;

  if (!Array.isArray(payload.exercises) || !Array.isArray(payload.workouts)) {
    return NextResponse.json({ error: "Invalid training payload" }, { status: 400 });
  }

  await writeTrainingDb({
    exercises: payload.exercises,
    workouts: payload.workouts,
  });

  return NextResponse.json({ ok: true });
}