import type { TeamMemberView, TeamShareLevel } from "@/lib/team-types";

/** Redacts member stats when the viewer is not the owner and share_level is summary. */
export function applyShareLevelToMemberView(
  view: TeamMemberView,
  memberUserId: string,
  shareLevel: TeamShareLevel,
  viewerUserId: string,
): TeamMemberView {
  if (memberUserId === viewerUserId || shareLevel === "full") {
    return view;
  }

  return {
    ...view,
    playStyle: null,
    recentGames: 0,
    recentWorkouts: view.recentWorkouts,
    shootingZoneTotals: null,
    gameTrainingInsight: null,
    form: {
      score: view.form.score,
      tone: view.form.tone,
      trend: view.form.trend,
      reasons: [`Form-Score ${view.form.score} — Details nur bei „Volles Teilen“ sichtbar.`],
    },
  };
}
