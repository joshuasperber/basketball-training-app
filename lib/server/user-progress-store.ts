import type { SessionDatabase } from "@/lib/session-types";
import { normalizeSupabaseProjectUrl } from "@/lib/supabase-env";
import { mergeSessionDatabases } from "@/lib/server/session-merge";

const supabaseUrl = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type AuthedUser = { id: string; email: string };

export type StoredProgressRow = {
  email: string;
  user_id?: string | null;
  sessions: SessionDatabase | null;
  workout_history: string | null;
};

function fetchProgressRow(user: AuthedUser, column: "user_id" | "email", value: string) {
  const url = new URL(`${supabaseUrl}/rest/v1/user_progress`);
  url.searchParams.set("select", "email,user_id,sessions,workout_history");
  url.searchParams.set("limit", "1");
  url.searchParams.set(column, `eq.${value}`);
  return fetch(url.toString(), {
    headers: {
      apikey: supabaseServiceRoleKey!,
      Authorization: `Bearer ${supabaseServiceRoleKey!}`,
    },
    cache: "no-store",
  });
}

export function isUserProgressStoreConfigured() {
  return Boolean(supabaseUrl && supabaseServiceRoleKey);
}

export async function readStoredProgress(user: AuthedUser): Promise<StoredProgressRow | null> {
  if (!isUserProgressStoreConfigured()) return null;

  let response = await fetchProgressRow(user, "user_id", user.id);
  if (!response.ok) return null;
  let rows = (await response.json()) as StoredProgressRow[];
  if (rows.length > 0) return rows[0];

  response = await fetchProgressRow(user, "email", user.email);
  if (!response.ok) return null;
  rows = (await response.json()) as StoredProgressRow[];
  return rows[0] ?? null;
}

function parseHistoryArray(raw: string | null | undefined) {
  if (!raw) return [] as Array<Record<string, unknown>>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
  } catch {
    return [];
  }
}

function mergeWorkoutHistory(existing: string | null | undefined, incoming: string | null | undefined) {
  const merged = [...parseHistoryArray(incoming), ...parseHistoryArray(existing)];
  const seen = new Set<string>();
  const unique = merged.filter((entry) => {
    const date = String(entry.date ?? "").slice(0, 10);
    const workoutId = String(entry.workoutId ?? entry.id ?? "");
    const key = `${date}-${workoutId}`;
    if (!date || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.length > 0 ? JSON.stringify(unique.slice(0, 400)) : incoming ?? existing ?? null;
}

export async function writeStoredWorkoutProgress(
  user: AuthedUser,
  payload: { sessions: SessionDatabase; workoutHistory?: string | null },
): Promise<{ ok: boolean; error?: string; sessionCount: number }> {
  if (!isUserProgressStoreConfigured()) {
    return { ok: false, error: "supabase_not_configured", sessionCount: 0 };
  }

  const existing = await readStoredProgress(user);
  const mergedSessions = mergeSessionDatabases(existing?.sessions, payload.sessions);
  const mergedHistory = mergeWorkoutHistory(existing?.workout_history, payload.workoutHistory ?? null);

  const row = {
    email: user.email,
    user_id: user.id,
    sessions: mergedSessions,
    workout_history: mergedHistory,
  };

  const url = new URL(`${supabaseUrl}/rest/v1/user_progress`);
  url.searchParams.set("on_conflict", "email");

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

  if (!response.ok) {
    const error = (await response.text().catch(() => "")).slice(0, 300);
    return { ok: false, error: error || `http_${response.status}`, sessionCount: 0 };
  }

  return { ok: true, sessionCount: mergedSessions.workoutSessions?.length ?? 0 };
}
