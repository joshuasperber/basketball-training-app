import type { GameStatEntry } from "@/lib/game-stats";
import type { WorkoutSessionEntry } from "@/lib/session-storage";

export type FormScoreTone = "green" | "yellow" | "red";
export type FormScoreTrend = "up" | "down" | "stable";

export type FormScoreResult = {
  score: number;
  trend: FormScoreTrend;
  tone: FormScoreTone;
  reasons: string[];
};

function daysAgo(dateIso: string, days: number) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);
  return new Date(dateIso) >= cutoff;
}

function averageRpe(sessions: WorkoutSessionEntry[]) {
  const values: number[] = [];
  sessions.forEach((session) => {
    session.logs.forEach((log) => {
      if (typeof log.rpe === "number" && log.rpe > 0) values.push(log.rpe);
    });
  });
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageGamePoints(games: GameStatEntry[]) {
  const withPoints = games.filter((game) => game.points != null);
  if (withPoints.length === 0) return null;
  return withPoints.reduce((sum, game) => sum + (game.points ?? 0), 0) / withPoints.length;
}

export function computeFormScore(input: {
  sessions: WorkoutSessionEntry[];
  games: GameStatEntry[];
  windowDays?: number;
}): FormScoreResult {
  const windowDays = input.windowDays ?? 14;
  const recentSessions = input.sessions.filter((session) => daysAgo(session.dateISO, windowDays));
  const recentGames = input.games.filter((game) => game.context === "game" && daysAgo(game.date, windowDays));
  const last7Games = input.games.filter((game) => game.context === "game" && daysAgo(game.date, 7));
  const prior7Games = input.games.filter((game) => {
    if (game.context !== "game") return false;
    const date = new Date(game.date);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 14);
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - 7);
    return date >= start && date < end;
  });

  let score = 52;
  const reasons: string[] = [];

  const workoutCount = recentSessions.length;
  if (workoutCount >= 3 && workoutCount <= 8) {
    score += 8;
    reasons.push(`${workoutCount} Workouts in ${windowDays} Tagen — solide Vorbereitung.`);
  } else if (workoutCount > 10) {
    score -= 10;
    reasons.push("Sehr hohes Trainingsvolumen — Deload-Risiko.");
  } else if (workoutCount === 0) {
    score -= 12;
    reasons.push("Wenig Training in den letzten Wochen.");
  }

  const rpe = averageRpe(recentSessions);
  if (rpe != null) {
    if (rpe >= 8.5) {
      score -= 14;
      reasons.push(`Hohe Belastung (Ø RPE ${rpe.toFixed(1)}).`);
    } else if (rpe >= 7) {
      score -= 4;
      reasons.push(`Moderate bis hohe Belastung (Ø RPE ${rpe.toFixed(1)}).`);
    } else if (rpe <= 5.5 && workoutCount >= 2) {
      score += 6;
      reasons.push(`Frische Belastung (Ø RPE ${rpe.toFixed(1)}).`);
    }
  }

  const recentAvg = averageGamePoints(last7Games);
  const priorAvg = averageGamePoints(prior7Games);
  if (recentAvg != null) {
    if (recentAvg >= 12) {
      score += 10;
      reasons.push(`Starke Spiele zuletzt (Ø ${recentAvg.toFixed(1)} Punkte).`);
    } else if (recentAvg >= 8) {
      score += 4;
      reasons.push(`Solide Spiele zuletzt (Ø ${recentAvg.toFixed(1)} Punkte).`);
    } else {
      score -= 6;
      reasons.push(`Schwächere Spiele zuletzt (Ø ${recentAvg.toFixed(1)} Punkte).`);
    }
  }

  if (recentGames.length >= 2) {
    score += 4;
    reasons.push(`${recentGames.length} Spiele im Fenster — Match-Fitness vorhanden.`);
  }

  let trend: FormScoreTrend = "stable";
  if (recentAvg != null && priorAvg != null) {
    const delta = recentAvg - priorAvg;
    if (delta >= 2) trend = "up";
    else if (delta <= -2) trend = "down";
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const tone: FormScoreTone = score >= 70 ? "green" : score >= 45 ? "yellow" : "red";

  if (reasons.length === 0) {
    reasons.push("Noch wenig Daten — Form-Score basiert auf Defaults.");
  }

  return { score, trend, tone, reasons };
}
