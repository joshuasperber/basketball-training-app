import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { DailyPlanMap } from "@/lib/activity-calendar";
import { SessionDatabase } from "@/lib/session-types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const dataDir = path.join(process.cwd(), "data");
const progressDbPath = path.join(dataDir, "progress-by-email.json");

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

type ProgressByEmail = Record<string, ProgressRecord>;

const emptySessions: SessionDatabase = { workoutSessions: [], exerciseHistory: {} };

async function ensureProgressDbFile() {
  await mkdir(dataDir, { recursive: true });
  try {
    await readFile(progressDbPath, "utf-8");
  } catch {
    await writeFile(progressDbPath, JSON.stringify({}, null, 2), "utf-8");
  }
}

async function readProgressDb(): Promise<ProgressByEmail> {
  await ensureProgressDbFile();
  const raw = await readFile(progressDbPath, "utf-8");
  try {
    return JSON.parse(raw) as ProgressByEmail;
  } catch {
    return {};
  }
}

async function writeProgressDb(db: ProgressByEmail) {
  await ensureProgressDbFile();
  await writeFile(progressDbPath, JSON.stringify(db, null, 2), "utf-8");
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

export async function GET(request: NextRequest) {
  const email = await getRequestUserEmail(request);
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = await readProgressDb();
  const progress = db[email] ?? {
    sessions: emptySessions,
    dailyPlanMap: {},
    manualDayWorkoutsMap: {},
    manualDayDisabledMap: {},
    profileCache: null,
    xpHistory: null,
    xpProgression: null,
    hiddenAutoWorkoutsMap: {},
  };
  return NextResponse.json(progress);
}

export async function POST(request: NextRequest) {
  const email = await getRequestUserEmail(request);
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as {
    sessions?: SessionDatabase;
    dailyPlanMap?: DailyPlanMap;
    manualDayWorkoutsMap?: Record<string, unknown[]>;
    manualDayDisabledMap?: Record<string, boolean>;
    profileCache?: string | null;
    xpHistory?: string | null;
    xpProgression?: string | null;
    hiddenAutoWorkoutsMap?: Record<string, string[]>;
  } | null;

  if (!payload?.sessions || !payload?.dailyPlanMap) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const db = await readProgressDb();
  db[email] = {
    sessions: payload.sessions,
    dailyPlanMap: payload.dailyPlanMap,
    manualDayWorkoutsMap: payload.manualDayWorkoutsMap ?? {},
    manualDayDisabledMap: payload.manualDayDisabledMap ?? {},
    profileCache: payload.profileCache ?? null,
    xpHistory: payload.xpHistory ?? null,
    xpProgression: payload.xpProgression ?? null,
    hiddenAutoWorkoutsMap: payload.hiddenAutoWorkoutsMap ?? {},
  };
  await writeProgressDb(db);

  return NextResponse.json({ ok: true });
}
