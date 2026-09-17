export type TeamLeagueDiscoveryCandidate = {
  team: { id: string; name: string };
  bundle: unknown | null;
  updatedAt: string | null;
  version: number;
  history: unknown;
  canEdit: boolean;
};

/**
 * Bevorzugt die zuletzt aktualisierte vorhandene Team-Liga. Gibt es noch bei
 * keinem Team Ligadaten, wird nur bei genau einer Mitgliedschaft automatisch
 * verbunden, damit bei mehreren Teams keine willkuerliche Zuordnung entsteht.
 */
export function chooseTeamLeagueDiscoveryCandidate(
  candidates: TeamLeagueDiscoveryCandidate[],
): TeamLeagueDiscoveryCandidate | null {
  const withBundle = candidates
    .filter((candidate) => candidate.bundle !== null && typeof candidate.bundle === "object")
    .sort((left, right) => {
      const dateOrder = (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
      return dateOrder || right.version - left.version || left.team.id.localeCompare(right.team.id);
    });
  if (withBundle.length > 0) return withBundle[0];
  return candidates.length === 1 ? candidates[0] : null;
}
