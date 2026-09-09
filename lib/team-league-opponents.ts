import type { LeagueBundle, LeagueOpponent } from "@/lib/league";
import type { OpponentStyleTag } from "@/lib/opponent-styles";
import type { OpponentScoutingEntry } from "@/lib/team-types";

export type TeamOpponentSource = "league" | "scouting" | "league-and-scouting";

export type TeamOpponentOption = {
  id: string;
  name: string;
  styles: OpponentStyleTag[];
  notes: string | null;
  source: TeamOpponentSource;
  leagueOpponentId?: string;
  scoutingId?: string;
  strengths?: string;
  weaknesses?: string;
  defenseNotes?: string;
};

export function normalizeTeamOpponentName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE");
}

function mergeStyles(...groups: OpponentStyleTag[][]) {
  return [...new Set(groups.flat())];
}

export function buildTeamOpponentOptions(
  leagueOpponents: LeagueOpponent[],
  scoutingEntries: OpponentScoutingEntry[],
): TeamOpponentOption[] {
  const byName = new Map<string, TeamOpponentOption>();

  for (const opponent of leagueOpponents) {
    const key = normalizeTeamOpponentName(opponent.name);
    if (!key) continue;
    byName.set(key, {
      id: `league:${opponent.id}`,
      name: opponent.name.trim(),
      styles: [...opponent.opponentStyles],
      notes: opponent.notes?.trim() || null,
      source: "league",
      leagueOpponentId: opponent.id,
      strengths: opponent.strengths,
      weaknesses: opponent.weaknesses,
      defenseNotes: opponent.defenseNotes,
    });
  }

  for (const scouting of scoutingEntries) {
    const key = normalizeTeamOpponentName(scouting.opponentName);
    if (!key) continue;
    const leagueOpponent = byName.get(key);
    if (leagueOpponent) {
      byName.set(key, {
        ...leagueOpponent,
        styles: mergeStyles(leagueOpponent.styles, scouting.styles),
        notes: scouting.notes?.trim() || leagueOpponent.notes,
        source: "league-and-scouting",
        scoutingId: scouting.id,
      });
      continue;
    }
    byName.set(key, {
      id: `scouting:${scouting.id}`,
      name: scouting.opponentName.trim(),
      styles: [...scouting.styles],
      notes: scouting.notes?.trim() || null,
      source: "scouting",
      scoutingId: scouting.id,
    });
  }

  return [...byName.values()].sort((left, right) => {
    const leftLeague = left.leagueOpponentId ? 0 : 1;
    const rightLeague = right.leagueOpponentId ? 0 : 1;
    return leftLeague - rightLeague || left.name.localeCompare(right.name, "de");
  });
}

export function updateLeagueOpponentScouting(
  bundle: LeagueBundle,
  opponentName: string,
  styles: OpponentStyleTag[],
  notes?: string,
): LeagueBundle {
  const targetName = normalizeTeamOpponentName(opponentName);
  let changed = false;
  const opponents = bundle.opponents.map((opponent) => {
    if (normalizeTeamOpponentName(opponent.name) !== targetName) return opponent;
    changed = true;
    return {
      ...opponent,
      opponentStyles: [...new Set(styles)],
      notes: notes?.trim() || opponent.notes,
    };
  });
  return changed ? { ...bundle, opponents } : bundle;
}
