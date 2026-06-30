import { upsertGameStat, type GameStatEntry } from "@/lib/game-stats";
import { pushProgressToCloud } from "@/lib/progress-sync";

/** Persistiert eine Spiel-/Spieltraining-Zeile und synct optional zur Cloud. */
export async function saveGameStatAndSync(
  payload: Omit<GameStatEntry, "id" | "createdAt"> & { id?: string },
): Promise<GameStatEntry> {
  const entry = upsertGameStat(payload);
  await pushProgressToCloud();
  return entry;
}
