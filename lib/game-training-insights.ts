import { type GameStatEntry } from "@/lib/game-stats";
import { type WorkoutSessionEntry } from "@/lib/session-storage";

export type GameTrainingDay = {
  /** YYYY-MM-DD */
  dateKey: string;
  game: GameStatEntry | null;
  trainingSessions: WorkoutSessionEntry[];
  /** Anzahl Trainings 1-3 Tage VOR diesem Spiel (Lead-Time-Effekt). */
  trainingsLast3Days: number;
  /** Anzahl Trainings am selben Tag bzw. später. */
  trainingsSameDay: number;
};

export type GameTrainingCorrelation = {
  /** Spiele mit >= 1 Training in den letzten 3 Tagen */
  withTraining: { count: number; avgPoints: number; avgAssists: number; avgRebounds: number };
  /** Spiele mit 0 Trainings in den letzten 3 Tagen */
  withoutTraining: { count: number; avgPoints: number; avgAssists: number; avgRebounds: number };
  /** Letzte 5 Spiele mit Vorbereitung-Score (0–3 Trainings × wertigkeit) */
  recentGames: GameTrainingDay[];
  /** Brutto-Korrelationskoeffizient zwischen Vorbereitung und Punkten (Pearson, vereinfacht). */
  correlationPointsVsPrep: number | null;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isoDateKey(input: string): string {
  if (!input) return "";
  if (input.length >= 10 && input.includes("-")) return input.slice(0, 10);
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function diffDays(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00`).getTime();
  const db = new Date(`${b}T00:00:00`).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 0;
  return Math.round((da - db) / ONE_DAY_MS);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

/** Pearson-Korrelation (gleiche Länge, n ≥ 3). Export für Unit-Tests. */
export function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length < 3 || xs.length !== ys.length) return null;
  const mx = average(xs);
  const my = average(ys);
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  if (denom === 0) return null;
  return num / denom;
}

export function buildGameTrainingCorrelation(
  games: GameStatEntry[],
  sessions: WorkoutSessionEntry[],
): GameTrainingCorrelation {
  const sessionsByDate = sessions.reduce<Record<string, WorkoutSessionEntry[]>>((acc, session) => {
    const key = isoDateKey(session.dateISO);
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(session);
    return acc;
  }, {});

  const sortedGames = [...games].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const annotated: GameTrainingDay[] = sortedGames.map((game) => {
    const gameDateKey = isoDateKey(game.date);
    const trainingsSameDay = sessionsByDate[gameDateKey]?.length ?? 0;
    let trainingsLast3Days = 0;
    for (const session of sessions) {
      const key = isoDateKey(session.dateISO);
      if (!key) continue;
      const delta = diffDays(gameDateKey, key);
      if (delta >= 1 && delta <= 3) trainingsLast3Days += 1;
    }
    return {
      dateKey: gameDateKey,
      game,
      trainingSessions: sessionsByDate[gameDateKey] ?? [],
      trainingsLast3Days,
      trainingsSameDay,
    };
  });

  const withTrainingGames = annotated.filter((entry) => entry.trainingsLast3Days >= 1 && entry.game);
  const withoutTrainingGames = annotated.filter((entry) => entry.trainingsLast3Days === 0 && entry.game);

  const summarize = (entries: GameTrainingDay[]) => {
    const pts = entries.map((e) => e.game?.points ?? 0);
    const ast = entries.map((e) => e.game?.assists ?? 0);
    const reb = entries.map((e) => e.game?.rebounds ?? 0);
    return {
      count: entries.length,
      avgPoints: Math.round(average(pts) * 10) / 10,
      avgAssists: Math.round(average(ast) * 10) / 10,
      avgRebounds: Math.round(average(reb) * 10) / 10,
    };
  };

  const prepXs = annotated.map((entry) => entry.trainingsLast3Days);
  const pointsYs = annotated.map((entry) => entry.game?.points ?? 0);

  return {
    withTraining: summarize(withTrainingGames),
    withoutTraining: summarize(withoutTrainingGames),
    recentGames: annotated.slice(0, 5),
    correlationPointsVsPrep: pearsonCorrelation(prepXs, pointsYs),
  };
}

export function describeCorrelationStrength(value: number | null): string {
  if (value === null) return "Zu wenig Daten";
  const abs = Math.abs(value);
  const direction = value >= 0 ? "positiv" : "negativ";
  if (abs >= 0.6) return `stark ${direction}`;
  if (abs >= 0.3) return `moderat ${direction}`;
  if (abs >= 0.1) return `schwach ${direction}`;
  return "kein Zusammenhang";
}
