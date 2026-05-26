export const GAME_STATS_KEY = "bt.game-stats.v1";

import type { OpponentStyleTag } from "@/lib/opponent-styles";
import { normalizeOpponentStyles } from "@/lib/opponent-styles";

export type GameStatEntry = {
  id: string;
  date: string;
  context: "game" | "game_training";
  /** z. B. Gegner oder Turniername */
  opponentLabel?: string | null;
  /** Gegner-Stil-Tags für Matchup-Empfehlungen */
  opponentStyles?: OpponentStyleTag[];
  minutes: number | null;
  intensity?: number | null;
  points: number | null;
  assists: number | null;
  rebounds: number | null;
  steals: number | null;
  notes?: string;
  /** Pfad zum Foto im Supabase Storage Bucket "game-photos". */
  photoPath?: string | null;
  createdAt: string;
};

function canUseStorage() {
  return typeof window !== "undefined";
}

export function loadGameStats() {
  if (!canUseStorage()) return [] as GameStatEntry[];
  const raw = window.localStorage.getItem(GAME_STATS_KEY);
  if (!raw) return [] as GameStatEntry[];
  try {
    const parsed = JSON.parse(raw) as GameStatEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => ({
      ...entry,
      opponentStyles: normalizeOpponentStyles(entry.opponentStyles),
    }));
  } catch {
    return [];
  }
}

export function saveGameStats(entries: GameStatEntry[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(GAME_STATS_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event("bt:game-stats-updated"));
}

export type GameStatsFilter = {
  query?: string;
  context?: "all" | "game" | "game_training";
  dateFrom?: string;
  dateTo?: string;
};

/** Filtern nach Gegner/Notiz/Datumstext, Kontext und Datumsbereich (YYYY-MM-DD). */
export function filterGameStats(entries: GameStatEntry[], filter: GameStatsFilter): GameStatEntry[] {
  let list = [...entries];
  const q = filter.query?.trim().toLowerCase();
  if (q) {
    list = list.filter((entry) => {
      const label = (entry.opponentLabel ?? "").toLowerCase();
      const notes = (entry.notes ?? "").toLowerCase();
      const dateStr = entry.date.toLowerCase();
      return label.includes(q) || notes.includes(q) || dateStr.includes(q);
    });
  }
  if (filter.context && filter.context !== "all") {
    list = list.filter((entry) => entry.context === filter.context);
  }
  const from = filter.dateFrom;
  const to = filter.dateTo;
  if (from) {
    list = list.filter((entry) => entry.date >= from);
  }
  if (to) {
    list = list.filter((entry) => entry.date <= to);
  }
  return list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function aggregateGameStatTotals(entries: GameStatEntry[]) {
  return entries.reduce(
    (acc, entry) => ({
      count: acc.count + 1,
      points: acc.points + (entry.points ?? 0),
      assists: acc.assists + (entry.assists ?? 0),
      rebounds: acc.rebounds + (entry.rebounds ?? 0),
      steals: acc.steals + (entry.steals ?? 0),
      minutes: acc.minutes + (entry.minutes ?? 0),
    }),
    { count: 0, points: 0, assists: 0, rebounds: 0, steals: 0, minutes: 0 },
  );
}

export function upsertGameStat(entry: Omit<GameStatEntry, "id" | "createdAt"> & { id?: string }) {
  const current = loadGameStats();
  const now = new Date().toISOString();
  const existing = entry.id ? current.find((item) => item.id === entry.id) : undefined;
  const nextEntry: GameStatEntry = {
    ...existing,
    ...entry,
    id: entry.id ?? existing?.id ?? `gs-${Date.now()}`,
    createdAt: existing?.createdAt ?? now,
  };
  const next = [nextEntry, ...current.filter((item) => item.id !== nextEntry.id)].slice(0, 365);
  saveGameStats(next);
  return nextEntry;
}
