import type { CompletedWorkoutHistoryEntry } from "@/lib/workout";
import { WORKOUT_HISTORY_KEY as LEGACY_HISTORY_KEY } from "@/lib/workout";
import type { WorkoutSessionEntry } from "@/lib/session-storage";
import { getExerciseHistoryMap, getWorkoutSessions } from "@/lib/session-storage";
import type { SessionDatabase } from "@/lib/session-types";

const CLOUD_HISTORY_KEY = "bt.workout-history.v1";

function readLegacyHistory(): CompletedWorkoutHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(LEGACY_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CompletedWorkoutHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readCloudHistoryLocal(): CompletedWorkoutHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(CLOUD_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CompletedWorkoutHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function historyToSession(entry: CompletedWorkoutHistoryEntry): WorkoutSessionEntry {
  const dateKey = entry.date.slice(0, 10);
  return {
    id: `legacy-${entry.id}`,
    dateISO: `${dateKey}T12:00:00.000Z`,
    workoutId: entry.workoutId ?? entry.id,
    workoutName: entry.title,
    workoutCategory: entry.sport,
    workoutSubcategory: entry.subcategory,
    logs: [],
  };
}

function sessionDayKey(session: WorkoutSessionEntry) {
  return `${session.dateISO.slice(0, 10)}-${session.workoutId}`;
}

/** Lokale Sessions + fehlende Einträge aus Workout-Historie für Cloud/Team. */
export function buildWorkoutSessionsForCloud(): SessionDatabase {
  const sessions = getWorkoutSessions();
  const seen = new Set(sessions.map(sessionDayKey));
  const merged = [...sessions];

  for (const entry of [...readLegacyHistory(), ...readCloudHistoryLocal()]) {
    const pseudo = historyToSession(entry);
    const key = sessionDayKey(pseudo);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(pseudo);
  }

  return {
    workoutSessions: merged.slice(0, 300),
    exerciseHistory: getExerciseHistoryMap(),
  };
}
