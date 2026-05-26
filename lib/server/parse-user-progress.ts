import type { WorkoutSessionEntry } from "@/lib/session-storage";
import type { SessionDatabase } from "@/lib/session-types";

type HistoryEntry = {
  id?: string;
  date?: string;
  workoutId?: string;
  title?: string;
  sport?: string;
  subcategory?: string;
};

function parseJsonValue<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return raw as T;
}

function historyEntryToSession(entry: HistoryEntry): WorkoutSessionEntry | null {
  const date = entry.date?.trim();
  if (!date) return null;
  const dateKey = date.slice(0, 10);
  const id = entry.id?.trim() || `${dateKey}-${entry.workoutId ?? "workout"}`;
  return {
    id: `hist-${id}`,
    dateISO: `${dateKey}T12:00:00.000Z`,
    workoutId: entry.workoutId?.trim() || id,
    workoutName: entry.title?.trim() || "Workout",
    workoutCategory: entry.sport,
    workoutSubcategory: entry.subcategory,
    logs: [],
  };
}

function sessionDayKey(session: WorkoutSessionEntry) {
  return `${session.dateISO.slice(0, 10)}-${session.workoutId}`;
}

export function parseWorkoutSessionsFromProgress(
  sessionsField: unknown,
  workoutHistoryField?: string | null,
): WorkoutSessionEntry[] {
  let normalizedField: unknown = sessionsField;
  if (typeof sessionsField === "string") {
    const inner = parseJsonValue<SessionDatabase | { workoutSessions?: WorkoutSessionEntry[] }>(sessionsField);
    normalizedField = inner ?? sessionsField;
  }

  const parsed = parseJsonValue<SessionDatabase | { workoutSessions?: WorkoutSessionEntry[] }>(normalizedField);
  const fromSessions = (
    parsed && "workoutSessions" in parsed
      ? parsed.workoutSessions
      : (parsed as SessionDatabase | null)?.workoutSessions
  ) ?? [];

  const merged = [...fromSessions];
  const seen = new Set(merged.map(sessionDayKey));

  const history = parseJsonValue<HistoryEntry[]>(workoutHistoryField);
  if (Array.isArray(history)) {
    for (const entry of history) {
      const pseudo = historyEntryToSession(entry);
      if (!pseudo) continue;
      const key = sessionDayKey(pseudo);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(pseudo);
    }
  }

  return merged;
}
