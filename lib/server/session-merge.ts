import type { SessionDatabase } from "@/lib/session-types";

const emptySessions: SessionDatabase = { workoutSessions: [], exerciseHistory: {} };

function sessionDayKey(session: { id: string; dateISO: string; workoutId: string }) {
  return `${session.dateISO.slice(0, 10)}-${session.workoutId}`;
}

export function mergeSessionDatabases(
  existing: SessionDatabase | null | undefined,
  incoming: SessionDatabase,
): SessionDatabase {
  const base = existing ?? emptySessions;
  const merged = [...(base.workoutSessions ?? [])];
  const seenIds = new Set(merged.map((session) => session.id));
  const seenDays = new Set(merged.map(sessionDayKey));

  for (const session of incoming.workoutSessions ?? []) {
    const key = sessionDayKey(session);
    if (seenIds.has(session.id) || seenDays.has(key)) continue;
    merged.push(session);
    seenIds.add(session.id);
    seenDays.add(key);
  }

  return {
    workoutSessions: merged.slice(0, 300),
    exerciseHistory: { ...(base.exerciseHistory ?? {}), ...(incoming.exerciseHistory ?? {}) },
  };
}
