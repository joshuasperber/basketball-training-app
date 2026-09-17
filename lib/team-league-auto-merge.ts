import { normalizeLeagueBundle, type LeagueBundle } from "@/lib/league";
import { mergeThreeWayJson } from "@/lib/three-way-merge";

/**
 * Verbindet parallele Team-Liga-Änderungen objektweise. Neue oder auf
 * unterschiedlichen IDs bearbeitete Ligen, Saisons, Teams, Spieler und Spiele
 * bleiben erhalten; nur dieselbe gleichzeitig geänderte Eigenschaft folgt der
 * aktiven lokalen Bearbeitung.
 */
export function mergeTeamLeagueBundles(
  base: LeagueBundle,
  remote: LeagueBundle,
  local: LeagueBundle,
) {
  return normalizeLeagueBundle(mergeThreeWayJson(base, remote, local).value);
}
