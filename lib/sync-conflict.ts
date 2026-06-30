import type { RemoteProgressPayload } from "@/lib/progress-sync";

export const SYNC_CONFLICT_EVENT = "bt:sync-conflict";

export type SyncConflictDetail = {
  remote: RemoteProgressPayload;
  remoteUpdatedAt: string;
};

export function dispatchSyncConflict(detail: SyncConflictDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SYNC_CONFLICT_EVENT, { detail }));
}
