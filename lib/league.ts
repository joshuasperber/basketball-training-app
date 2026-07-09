import type { OpponentStyleTag } from "@/lib/opponent-styles";
import { normalizeOpponentStyles } from "@/lib/opponent-styles";
import { addManualGameForDate } from "@/lib/plan-day-actions";
import { findGameStatByDateAndContext, upsertGameStat } from "@/lib/game-stats";

export const LEAGUE_STORAGE_KEY = "bt.league.v1";

export type LeagueGameKind = "game" | "game_training";

export type LeagueSeason = {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
  createdAt: string;
};

export type LeagueOpponent = {
  id: string;
  seasonId: string;
  name: string;
  strengths: string;
  weaknesses: string;
  defenseNotes: string;
  opponentStyles: OpponentStyleTag[];
  notes?: string;
};

export type LeagueScheduleEntry = {
  id: string;
  seasonId: string;
  date: string;
  opponentId?: string;
  kind: LeagueGameKind;
  homeAway?: "home" | "away" | "neutral";
  notes?: string;
  syncedAt?: string;
};

export type LeagueBundle = {
  activeSeasonId: string | null;
  seasons: LeagueSeason[];
  opponents: LeagueOpponent[];
  schedule: LeagueScheduleEntry[];
};

function emptyBundle(): LeagueBundle {
  return { activeSeasonId: null, seasons: [], opponents: [], schedule: [] };
}

function canUseStorage() {
  return typeof window !== "undefined";
}

export function loadLeagueBundle(): LeagueBundle {
  if (!canUseStorage()) return emptyBundle();
  const raw = window.localStorage.getItem(LEAGUE_STORAGE_KEY);
  if (!raw) return emptyBundle();
  try {
    const parsed = JSON.parse(raw) as LeagueBundle;
    return {
      activeSeasonId: parsed.activeSeasonId ?? null,
      seasons: Array.isArray(parsed.seasons) ? parsed.seasons : [],
      opponents: Array.isArray(parsed.opponents)
        ? parsed.opponents.map((entry) => ({
            ...entry,
            opponentStyles: normalizeOpponentStyles(entry.opponentStyles),
          }))
        : [],
      schedule: Array.isArray(parsed.schedule) ? parsed.schedule : [],
    };
  } catch {
    return emptyBundle();
  }
}

export function saveLeagueBundle(bundle: LeagueBundle) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(LEAGUE_STORAGE_KEY, JSON.stringify(bundle));
  window.dispatchEvent(new Event("bt:league-updated"));
}

export function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getActiveSeason(bundle: LeagueBundle): LeagueSeason | null {
  if (!bundle.activeSeasonId) return bundle.seasons[0] ?? null;
  return bundle.seasons.find((season) => season.id === bundle.activeSeasonId) ?? bundle.seasons[0] ?? null;
}

export function opponentsForSeason(bundle: LeagueBundle, seasonId: string) {
  return bundle.opponents.filter((entry) => entry.seasonId === seasonId);
}

export function scheduleForSeason(bundle: LeagueBundle, seasonId: string) {
  return bundle.schedule
    .filter((entry) => entry.seasonId === seasonId)
    .sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0));
}

function opponentPrepNotes(opponent: LeagueOpponent | undefined) {
  if (!opponent) return undefined;
  const parts = [
    opponent.strengths.trim() ? `Stärken: ${opponent.strengths.trim()}` : null,
    opponent.weaknesses.trim() ? `Schwächen: ${opponent.weaknesses.trim()}` : null,
    opponent.defenseNotes.trim() ? `Verteidigung: ${opponent.defenseNotes.trim()}` : null,
    opponent.notes?.trim() ? opponent.notes.trim() : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : undefined;
}

/** Schreibt Liga-Spiel in Tagesplan + Spiel-Vorbereitung (ohne bestehende Stats zu überschreiben). */
export function syncLeagueEntryToPlan(entry: LeagueScheduleEntry, opponent?: LeagueOpponent) {
  addManualGameForDate(entry.date, entry.kind === "game_training" ? "game_training" : "game");

  const context = entry.kind === "game_training" ? "game_training" : "game";
  const existing = findGameStatByDateAndContext(entry.date, context);
  const prepNotes = [opponentPrepNotes(opponent), entry.notes?.trim()].filter(Boolean).join("\n\n");

  upsertGameStat({
    id: existing?.id,
    date: entry.date,
    context,
    opponentLabel: opponent?.name?.trim() || existing?.opponentLabel || null,
    opponentStyles:
      opponent && opponent.opponentStyles.length > 0
        ? opponent.opponentStyles
        : (existing?.opponentStyles ?? []),
    notes: prepNotes || existing?.notes || undefined,
    minutes: existing?.minutes ?? null,
    points: existing?.points ?? null,
    assists: existing?.assists ?? null,
    rebounds: existing?.rebounds ?? null,
    steals: existing?.steals ?? null,
  });

  return { ...entry, syncedAt: new Date().toISOString() };
}

export function syncUpcomingLeagueSchedule(seasonId: string, fromDate: string) {
  const bundle = loadLeagueBundle();
  const opponentsById = new Map(bundle.opponents.map((entry) => [entry.id, entry]));
  let count = 0;
  const nextSchedule = bundle.schedule.map((entry) => {
    if (entry.seasonId !== seasonId || entry.date < fromDate) return entry;
    const opponent = entry.opponentId ? opponentsById.get(entry.opponentId) : undefined;
    count += 1;
    return syncLeagueEntryToPlan(entry, opponent);
  });
  saveLeagueBundle({ ...bundle, schedule: nextSchedule });
  return count;
}
