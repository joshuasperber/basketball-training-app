import { upsertGameStat, type GameStatEntry } from "@/lib/game-stats";
import { pushProgressToCloudWithRetry } from "@/lib/progress-sync";

export type SaveGameStatSyncResult = {
  entry: GameStatEntry;
  cloudSynced: boolean;
};

/** Persistiert eine Spiel-/Spieltraining-Zeile und synct optional zur Cloud. */
export async function saveGameStatAndSync(
  payload: Omit<GameStatEntry, "id" | "createdAt"> & { id?: string },
): Promise<SaveGameStatSyncResult> {
  const entry = upsertGameStat(payload);
  const cloudSynced = await pushProgressToCloudWithRetry().catch(() => false);
  return { entry, cloudSynced };
}
