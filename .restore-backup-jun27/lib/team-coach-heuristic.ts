import {
  buildStartLineupRecommendation,
  buildTeamMatchupHints,
  type PlayerMatchupProfile,
} from "@/lib/matchup-hints";
import type { OpponentStyleTag } from "@/lib/opponent-styles";
import type { TeamCoachResponse, TeamMemberView } from "@/lib/team-types";

export function buildTeamCoachHeuristic(input: {
  members: TeamMemberView[];
  opponentName?: string;
  opponentStyles: OpponentStyleTag[];
}): TeamCoachResponse {
  const roster: PlayerMatchupProfile[] = input.members.map((member) => ({
    displayName: member.displayName,
    position: member.position,
    playStyle: member.playStyle,
    formScore: member.form.score,
  }));

  const lineup = buildStartLineupRecommendation(roster);
  const hints = buildTeamMatchupHints({
    opponentStyles: input.opponentStyles,
    roster,
  });

  const topForm = [...input.members].sort((a, b) => b.form.score - a.form.score)[0];
  const lowLoad = input.members.filter((member) => member.form.tone === "green");

  const bullets = [
    topForm
      ? `${topForm.displayName} ist aktuell am besten in Form (Score ${topForm.form.score}).`
      : "Form-Daten noch dünn — nach ein paar Spielen/Workouts wird das Ranking genauer.",
    lineup.starters.length > 0
      ? `Start-Empfehlung: ${lineup.starters.map((player) => player.displayName).join(", ")}.`
      : "Noch zu wenige Spieler für eine Start-Five.",
    lowLoad.length > 0
      ? `Frisch und belastbar: ${lowLoad.slice(0, 3).map((member) => member.displayName).join(", ")}.`
      : "Achte auf Belastungssteuerung — mehrere Spieler zeigen hohe RPE.",
    input.opponentName
      ? `Gegner ${input.opponentName}: ${input.opponentStyles.length ? input.opponentStyles.join(", ") : "Stil-Tags ergänzen für bessere Matchups"}.`
      : "Gegner im Scouting hinterlegen für Matchup-Empfehlungen.",
    ...lineup.rationale.slice(0, 1),
  ].filter(Boolean);

  return {
    headline: input.opponentName ? `Plan vs. ${input.opponentName}` : "Team-Form & Start-Idee",
    bullets: bullets.slice(0, 6),
    starters: lineup.starters.map((player) => player.displayName),
    matchupHints: hints.map((hint) => `${hint.title}: ${hint.detail}`),
    source: "heuristic",
  };
}
