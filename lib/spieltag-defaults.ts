export const SPIELTAG_TEAM_FORMAT = "5v5";
export const SPIELTAG_GAMES_PLAYED = 1;
export const SPIELTAG_CARD_SUBCATEGORY = "5v5 · Spiel";
export const SPIELTAG_DEFAULT_NOTES = "5v5 · 1 Spiel";

export function isSpieltagContext(context: "game" | "game_training") {
  return context === "game";
}

export function spieltagGameStatDefaults(context: "game" | "game_training") {
  if (!isSpieltagContext(context)) {
    return {};
  }
  return {
    teamFormat: SPIELTAG_TEAM_FORMAT,
    gamesPlayed: SPIELTAG_GAMES_PLAYED,
    statsAreTotals: false,
  };
}

export function spieltagCardNotes(prepNotes?: string | null) {
  const trimmed = prepNotes?.trim();
  if (!trimmed) return SPIELTAG_DEFAULT_NOTES;
  return `${SPIELTAG_DEFAULT_NOTES} · ${trimmed}`;
}
