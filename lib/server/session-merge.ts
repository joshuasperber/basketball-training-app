import type { SessionDatabase } from "@/lib/session-types";

const emptySessions: SessionDatabase = { workoutSessions: [], exerciseHistory: {} };

function sessionDayKey(session: { id: string; dateISO: string; workoutId: string }) {
  return `${session.dateISO.slice(0, 10)}-${session.workoutId}`;
}

function keepsMultipleSessions(session: { workoutId: string; allowMultiple?: boolean }) {
  return session.allowMultiple === true || session.workoutId === "single-exercise-session";
}

function mergeExerciseHistory(
  existing: SessionDatabase["exerciseHistory"],
  incoming: SessionDatabase["exerciseHistory"],
) {
  const merged = { ...(existing ?? {}) };
  for (const [exerciseId, entries] of Object.entries(incoming ?? {})) {
    const byId = new Map((merged[exerciseId] ?? []).map((entry) => [entry.id, entry]));
    for (const entry of entries ?? []) byId.set(entry.id, entry);
    merged[exerciseId] = [...byId.values()]
      .sort((left, right) => right.dateISO.localeCompare(left.dateISO))
      .slice(0, 100);
  }
  return merged;
}

export function mergeSessionDatabases(
  existing: SessionDatabase | null | undefined,
  incoming: SessionDatabase,
): SessionDatabase {
  const base = existing ?? emptySessions;
  let merged = [...(base.workoutSessions ?? [])];

  for (const session of incoming.workoutSessions ?? []) {
    const key = sessionDayKey(session);
    merged = merged.filter((existingSession) => {
      if (existingSession.id === session.id) return false;
      if (keepsMultipleSessions(session) || keepsMultipleSessions(existingSession)) return true;
      return sessionDayKey(existingSession) !== key;
    });
    merged.push(session);
  }

  return {
    workoutSessions: merged
      .sort((left, right) => right.dateISO.localeCompare(left.dateISO))
      .slice(0, 300),
    exerciseHistory: mergeExerciseHistory(base.exerciseHistory, incoming.exerciseHistory),
  };
}
