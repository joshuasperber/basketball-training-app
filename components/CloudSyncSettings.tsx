"use client";

import { useEffect, useMemo, useState } from "react";
import { ensureInitialCloudSync, pushProgressToCloudWithRetry } from "@/lib/progress-sync";
import {
  readLastSuccessfulSync,
  SYNC_STATUS_EVENT,
  type SyncStatus,
  type SyncStatusDetail,
} from "@/lib/sync-status";

function formatLastSync(value: string | null) {
  if (!value) return "Noch nicht auf diesem Gerät synchronisiert";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Zuletzt synchronisiert";
  return `Zuletzt synchronisiert: ${date.toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  })}`;
}

export default function CloudSyncSettings() {
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState<SyncStatus>("saved");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const refreshNetwork = () => {
      const nextOnline = navigator.onLine;
      setOnline(nextOnline);
      if (!nextOnline) setStatus("offline");
    };
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<SyncStatusDetail>).detail;
      if (!detail?.status) return;
      setStatus(detail.status);
      if (detail.status === "saved") setLastSync(detail.at ?? readLastSuccessfulSync());
    };

    setLastSync(readLastSuccessfulSync());
    refreshNetwork();
    window.addEventListener("online", refreshNetwork);
    window.addEventListener("offline", refreshNetwork);
    window.addEventListener(SYNC_STATUS_EVENT, onStatus);
    return () => {
      window.removeEventListener("online", refreshNetwork);
      window.removeEventListener("offline", refreshNetwork);
      window.removeEventListener(SYNC_STATUS_EVENT, onStatus);
    };
  }, []);

  const label = useMemo(() => {
    if (!online || status === "offline") return "Offline – Änderungen bleiben lokal vorgemerkt";
    if (status === "saving") return "Wird in der Cloud gespeichert …";
    if (status === "error") return "Cloud-Sync wird erneut versucht";
    return formatLastSync(lastSync);
  }, [lastSync, online, status]);

  const syncNow = async () => {
    if (!navigator.onLine) {
      setStatus("offline");
      return;
    }
    setBusy(true);
    setStatus("saving");
    try {
      const pushed = await pushProgressToCloudWithRetry();
      if (pushed) await ensureInitialCloudSync({ force: true });
      setStatus(pushed ? "saved" : "error");
      setLastSync(readLastSuccessfulSync());
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="app-card mt-4" aria-live="polite">
      <p className="section-eyebrow">Cloud-Sync</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">Geräteübergreifende Daten</h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                !online || status === "offline"
                  ? "bg-slate-400"
                  : status === "error"
                    ? "bg-red-500"
                    : status === "saving"
                      ? "animate-pulse bg-amber-500"
                      : "bg-emerald-500"
              }`}
              aria-hidden
            />
            {label}
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy || !online} onClick={() => void syncNow()}>
          {busy ? "Synchronisiere …" : "Jetzt synchronisieren"}
        </button>
      </div>
    </section>
  );
}
