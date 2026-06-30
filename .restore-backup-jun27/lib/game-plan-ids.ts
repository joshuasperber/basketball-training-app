export type GamePlanContext = "game" | "game_training";

export function gamePlanId(dateKey: string, context: GamePlanContext): string {
  return context === "game_training" ? `game-training-${dateKey}` : `game-${dateKey}`;
}

export function parseGamePlanId(id: string): { dateKey: string; context: GamePlanContext } | null {
  if (id.startsWith("game-training-")) {
    return { dateKey: id.slice("game-training-".length), context: "game_training" };
  }
  if (id.startsWith("game_training-")) {
    return { dateKey: id.slice("game_training-".length), context: "game_training" };
  }
  if (id.startsWith("game-")) {
    return { dateKey: id.slice("game-".length), context: "game" };
  }
  return null;
}

export function isGamePlanId(id: string): boolean {
  return parseGamePlanId(id) != null;
}
