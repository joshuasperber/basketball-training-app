import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SessionDatabase, WorkoutSessionEntry, ExerciseHistoryEntry } from "@/lib/session-types";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "sessions.json");

const emptyDb: SessionDatabase = {
  workoutSessions: [],
  exerciseHistory: {},
};

async function ensureDbFile() {
  await mkdir(dataDir, { recursive: true });
  try {
    await readFile(dbPath, "utf-8");
  } catch {
    await writeFile(dbPath, JSON.stringify(emptyDb, null, 2), "utf-8");
  }
}

export async function readSessionDb(): Promise<SessionDatabase> {
  await ensureDbFile();
  const raw = await readFile(dbPath, "utf-8");

  try {
    const parsed = JSON.parse(raw) as SessionDatabase;
    return {
      workoutSessions: parsed.workoutSessions ?? [],
      exerciseHistory: parsed.exerciseHistory ?? {},
    };
  } catch {
    return emptyDb;
  }
}

export async function writeSessionDb(db: SessionDatabase) {
  await ensureDbFile();
  await writeFile(dbPath, JSON.stringify(db, null, 2), "utf-8");
}

export async function appendWorkoutSession(session: WorkoutSessionEntry) {
  const db = await readSessionDb();
  db.workoutSessions = [session, ...db.workoutSessions].slice(0, 300);
  await writeSessionDb(db);
}

export async function appendExerciseHistory(entry: ExerciseHistoryEntry) {
  const db = await readSessionDb();
  const current = db.exerciseHistory[entry.exerciseId] ?? [];
  db.exerciseHistory[entry.exerciseId] = [entry, ...current].slice(0, 300);
  await writeSessionDb(db);
}