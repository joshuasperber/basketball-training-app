import type { GameStatEntry } from "@/lib/game-stats";
import { loadGameStats } from "@/lib/game-stats";

export function gamePrepHasContent(entry: GameStatEntry): boolean {
  return Boolean(
    entry.opponentLabel?.trim() ||
      (entry.opponentStyles?.length ?? 0) > 0 ||
      entry.notes?.trim(),
  );
}

/** Spiel-Vorbereitungen im Datumsbereich (ISO yyyy-mm-dd), sortiert nach Datum. */
export function getGamePrepsInDateRange(fromDate: string, toDate: string): GameStatEntry[] {
  return loadGameStats()
    .filter((entry) => entry.date >= fromDate && entry.date <= toDate && gamePrepHasContent(entry))
    .sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0));
}

export function getUpcomingGamePreps(fromDate: string, limit = 3): GameStatEntry[] {
  return loadGameStats()
    .filter((entry) => entry.date >= fromDate && gamePrepHasContent(entry))
    .sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0))
    .slice(0, limit);
}
