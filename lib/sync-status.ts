export const SYNC_STATUS_EVENT = "bt:sync-status";

export type SyncStatus = "saving" | "saved" | "error" | "offline";

export type SyncStatusDetail = {
  status: SyncStatus;
  message?: string;
};

export function dispatchSyncStatus(detail: SyncStatusDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT, { detail }));
}
