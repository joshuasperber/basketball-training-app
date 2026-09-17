const SYNC_DIRTY_KEY = "bt.sync-dirty.v1";
const SYNC_DIRTY_REVISION_KEY = "bt.sync-dirty-revision.v1";

export function markLocalProgressDirty() {
  if (typeof window === "undefined") return;
  const current = Number(window.localStorage.getItem(SYNC_DIRTY_REVISION_KEY) ?? "0");
  const next = Number.isSafeInteger(current) && current >= 0 ? current + 1 : 1;
  window.localStorage.setItem(SYNC_DIRTY_REVISION_KEY, String(next));
  window.localStorage.setItem(SYNC_DIRTY_KEY, "1");
}

export function getLocalProgressDirtyRevision() {
  if (typeof window === "undefined") return 0;
  const revision = Number(window.localStorage.getItem(SYNC_DIRTY_REVISION_KEY) ?? "0");
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

export function clearLocalProgressDirty(expectedRevision?: number) {
  if (typeof window === "undefined") return false;
  if (expectedRevision !== undefined && getLocalProgressDirtyRevision() !== expectedRevision) {
    return false;
  }
  window.localStorage.removeItem(SYNC_DIRTY_KEY);
  return true;
}

export function isLocalProgressDirty() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SYNC_DIRTY_KEY) === "1";
}
