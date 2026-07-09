"use client";

import { useCallback, useEffect, useState } from "react";
import { applyRemoteProgressToLocal } from "@/lib/progress-sync";
import { useT } from "@/lib/i18n/I18nProvider";
import { SYNC_CONFLICT_EVENT, type SyncConflictDetail } from "@/lib/sync-conflict";

export default function SyncConflictBanner() {
  const t = useT();
  const [conflict, setConflict] = useState<SyncConflictDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onConflict = (event: Event) => {
      const detail = (event as CustomEvent<SyncConflictDetail>).detail;
      if (detail?.remote) {
        setConflict(detail);
        setError(null);
      }
    };
    window.addEventListener(SYNC_CONFLICT_EVENT, onConflict);
    return () => window.removeEventListener(SYNC_CONFLICT_EVENT, onConflict);
  }, []);

  const applyCloudVersion = useCallback(async () => {
    if (!conflict) return;
    setBusy(true);
    setError(null);
    applyRemoteProgressToLocal(conflict.remote);
    window.localStorage.setItem("bt.cloud-updated-at.v1", conflict.remoteUpdatedAt);
    setConflict(null);
    setBusy(false);
    if (navigator.onLine) {
      window.location.reload();
    }
  }, [conflict]);

  const keepLocal = useCallback(async () => {
    if (!conflict) return;
    setBusy(true);
    setError(null);
    try {
      const { buildLocalProgressSnapshot } = await import("@/lib/progress-sync");
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...buildLocalProgressSnapshot(), forceOverwrite: true }),
      });
      if (!response.ok) {
        setError(t("sync.keepLocalFailed"));
        setBusy(false);
        return;
      }
      const json = (await response.json()) as { remoteUpdatedAt?: string };
      if (json.remoteUpdatedAt) {
        window.localStorage.setItem("bt.cloud-updated-at.v1", json.remoteUpdatedAt);
      }
      setConflict(null);
    } catch {
      setError(t("sync.networkError"));
    }
    setBusy(false);
  }, [conflict, t]);

  if (!conflict) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-height,4rem)+0.5rem)] z-50 px-4">
      <div className="app-card mx-auto max-w-lg border border-amber-500/40 bg-zinc-900/95 shadow-lg">
        <p className="text-sm font-semibold text-amber-200">{t("sync.title")}</p>
        <p className="mt-1 text-xs text-muted">{t("sync.body")}</p>
        {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void applyCloudVersion()}>
            {t("sync.useCloud")}
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void keepLocal()}>
            {t("sync.keepLocal")}
          </button>
        </div>
      </div>
    </div>
  );
}
