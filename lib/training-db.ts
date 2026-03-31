import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultExercises, defaultWorkouts, type Exercise, type Workout } from "@/lib/training-data";

type TrainingDatabase = {
  exercises: Exercise[];
  workouts: Workout[];
};

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "training.json");

const defaultDb: TrainingDatabase = {
  exercises: defaultExercises,
  workouts: defaultWorkouts,
};

async function ensureDbFile() {
  await mkdir(dataDir, { recursive: true });

  try {
    await readFile(dbPath, "utf-8");
  } catch {
    await writeFile(dbPath, JSON.stringify(defaultDb, null, 2), "utf-8");
  }
}

export async function readTrainingDb(): Promise<TrainingDatabase> {
  await ensureDbFile();
  const raw = await readFile(dbPath, "utf-8");

  try {
    const parsed = JSON.parse(raw) as Partial<TrainingDatabase>;
    const exercises = Array.isArray(parsed.exercises) ? parsed.exercises : defaultExercises;
    const workouts = Array.isArray(parsed.workouts) ? parsed.workouts : defaultWorkouts;
    return { exercises, workouts };
  } catch {
    return defaultDb;
  }
}

export async function writeTrainingDb(db: TrainingDatabase) {
  await ensureDbFile();
  await writeFile(dbPath, JSON.stringify(db, null, 2), "utf-8");
}