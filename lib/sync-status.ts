export const SYNC_STATUS_EVENT = "bt:sync-status";
export const LAST_SUCCESSFUL_SYNC_KEY = "bt.last-successful-sync.v1";

export type SyncStatus = "saving" | "saved" | "error" | "offline";

export type SyncStatusDetail = {
  status: SyncStatus;
  message?: string;
  at?: string;
};

export function dispatchSyncStatus(detail: SyncStatusDetail) {
  if (typeof window === "undefined") return;
  const at = detail.at ?? new Date().toISOString();
  if (detail.status === "saved") {
    window.localStorage.setItem(LAST_SUCCESSFUL_SYNC_KEY, at);
  }
  window.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT, { detail: { ...detail, at } }));
}

export function readLastSuccessfulSync(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_SUCCESSFUL_SYNC_KEY);
}
