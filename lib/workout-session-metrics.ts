import type { WorkoutSessionLog, WorkoutSessionEntry } from "@/lib/session-storage";

/**
 * True wenn diese Zeile ein geleisteter Satz / geleistete Erfassung ist —
 * nicht nur auf completedValue verlassen (Basketball oft Makes/Tries ohne reps-Wert).
 */
export function logCountsAsTrackedSet(log: WorkoutSessionLog): boolean {
  if (log.completed === false) return false;

  const completedValue = log.completedValue;
  if (completedValue != null && Number.isFinite(completedValue) && completedValue > 0) return true;

  const attempts = log.attempts ?? 0;
  const made = log.made ?? 0;
  const misses = log.misses ?? 0;
  if (attempts > 0 || made > 0 || misses > 0) return true;

  const weight = log.weightKg ?? 0;
  if (weight > 0) return true;

  if (log.completed === true) return true;

  return false;
}

/**
 * Anzahl erfasster Sätze. Wenn explizit nichts gemessen wurde, aber Logs existieren:
 * mindestens 1 Satz (ein abgeschlossenes Training zählt als mindestens eine Einheit).
 */
export function countTrackedSetsInLogs(logs: WorkoutSessionLog[]): number {
  if (!logs.length) return 0;
  const n = logs.reduce((sum, log) => sum + (logCountsAsTrackedSet(log) ? 1 : 0), 0);
  if (n > 0) return n;
  const anyNotExplicitlyIncomplete = logs.some((log) => log.completed !== false);
  return anyNotExplicitlyIncomplete ? 1 : 0;
}

/** Strikte Zählung ohne Fallback — für Stats nur wirklich erfasste Leistung. */
export function countStrictTrackedSetsInLogs(logs: WorkoutSessionLog[]): number {
  if (!logs.length) return 0;
  return logs.reduce((sum, log) => sum + (logCountsAsTrackedSet(log) ? 1 : 0), 0);
}

/** True wenn die Session abgeschlossene, messbare Trainingsleistung enthält. */
export function sessionHasCompletedWork(session: WorkoutSessionEntry): boolean {
  if (session.workoutId === "single-exercise-session") return false;
  if (countStrictTrackedSetsInLogs(session.logs) > 0) return true;
  if ((session.durationSeconds ?? 0) > 0 && session.logs.some((log) => log.completed === true)) return true;
  return false;
}
