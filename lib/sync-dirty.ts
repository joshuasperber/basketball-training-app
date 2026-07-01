const SYNC_DIRTY_KEY = "bt.sync-dirty.v1";

export function markLocalProgressDirty() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SYNC_DIRTY_KEY, "1");
}

export function clearLocalProgressDirty() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SYNC_DIRTY_KEY);
}

export function isLocalProgressDirty() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SYNC_DIRTY_KEY) === "1";
}
