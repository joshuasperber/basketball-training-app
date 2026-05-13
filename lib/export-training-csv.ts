import { loadGameStats } from "@/lib/game-stats";
import { getWorkoutSessions } from "@/lib/session-storage";

function csvEscape(value: string | number | null | undefined) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildTrainingHistoryCsv(): string {
  const sessions = getWorkoutSessions();
  const blocks: string[] = [];

  blocks.push("# SESSION_LOGS");
  blocks.push(
    [
      "dateISO",
      "workoutId",
      "workoutName",
      "category",
      "subcategory",
      "exerciseId",
      "weightKg",
      "completedValue",
      "attempts",
      "made",
    ].join(","),
  );

  sessions.forEach((session) => {
    session.logs.forEach((log) => {
      blocks.push(
        [
          session.dateISO,
          session.workoutId,
          session.workoutName,
          session.workoutCategory ?? "",
          session.workoutSubcategory ?? "",
          log.exerciseId,
          log.weightKg ?? "",
          log.completedValue ?? "",
          log.attempts ?? "",
          log.made ?? "",
        ]
          .map(csvEscape)
          .join(","),
      );
    });
  });

  blocks.push("");
  blocks.push("# GAME_STATS");
  blocks.push(["date", "context", "opponent", "pts", "ast", "reb", "stl", "min"].join(","));
  loadGameStats().forEach((game) => {
    blocks.push(
      [
        game.date,
        game.context,
        game.opponentLabel ?? "",
        game.points ?? "",
        game.assists ?? "",
        game.rebounds ?? "",
        game.steals ?? "",
        game.minutes ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  });

  return blocks.join("\n");
}

export function downloadTrainingCsv(filename = `training-export-${new Date().toISOString().slice(0, 10)}.csv`) {
  const blob = new Blob([buildTrainingHistoryCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
