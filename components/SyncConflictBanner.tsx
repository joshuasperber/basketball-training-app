"use client";

import { useCallback, useEffect, useState } from "react";
import { applyRemoteProgressToLocal } from "@/lib/progress-sync";
import { SYNC_CONFLICT_EVENT, type SyncConflictDetail } from "@/lib/sync-conflict";

export default function SyncConflictBanner() {
  const [conflict, setConflict] = useState<SyncConflictDetail | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onConflict = (event: Event) => {
      const detail = (event as CustomEvent<SyncConflictDetail>).detail;
      if (detail?.remote) setConflict(detail);
    };
    window.addEventListener(SYNC_CONFLICT_EVENT, onConflict);
    return () => window.removeEventListener(SYNC_CONFLICT_EVENT, onConflict);
  }, []);

  const applyCloudVersion = useCallback(async () => {
    if (!conflict) return;
    setBusy(true);
    applyRemoteProgressToLocal(conflict.remote);
    window.localStorage.setItem("bt.cloud-updated-at.v1", conflict.remoteUpdatedAt);
    setConflict(null);
    setBusy(false);
    window.location.reload();
  }, [conflict]);

  const keepLocal = useCallback(async () => {
    if (!conflict) return;
    setBusy(true);
    const { buildLocalProgressSnapshot } = await import("@/lib/progress-sync");
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ ...buildLocalProgressSnapshot(), forceOverwrite: true }),
    });
    setBusy(false);
    if (response.ok) {
      const json = (await response.json()) as { remoteUpdatedAt?: string };
      if (json.remoteUpdatedAt) {
        window.localStorage.setItem("bt.cloud-updated-at.v1", json.remoteUpdatedAt);
      }
      setConflict(null);
    }
  }, [conflict]);

  if (!conflict) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-height,4rem)+0.5rem)] z-50 px-4">
      <div className="app-card mx-auto max-w-lg border border-amber-500/40 bg-zinc-900/95 shadow-lg">
        <p className="text-sm font-semibold text-amber-200">Sync-Konflikt</p>
        <p className="mt-1 text-xs text-muted">
          Die Cloud-Version ist neuer als dein letzter Sync. Welche Version soll gelten?
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void applyCloudVersion()}>
            Cloud übernehmen
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void keepLocal()}>
            Lokal behalten
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConflict(null)}>
            Später
          </button>
        </div>
      </div>
    </div>
  );
}
