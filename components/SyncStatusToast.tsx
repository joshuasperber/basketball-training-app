"use client";

import { useEffect, useState } from "react";
import ViewportToast from "@/components/ViewportToast";
import { SYNC_STATUS_EVENT, type SyncStatusDetail } from "@/lib/sync-status";

export default function SyncStatusToast() {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<SyncStatusDetail>).detail;
      if (!detail?.status) return;

      if (hideTimer) clearTimeout(hideTimer);

      if (detail.status === "saving") {
        setToast("Speichere in der Cloud …");
        return;
      }
      if (detail.status === "saved") {
        setToast(detail.message ?? "In der Cloud gespeichert");
        hideTimer = setTimeout(() => setToast(null), 2200);
        return;
      }
      if (detail.status === "offline") {
        setToast("Offline — Änderungen werden lokal gespeichert");
        return;
      }
      setToast(detail.message ?? "Cloud-Sync fehlgeschlagen");
      hideTimer = setTimeout(() => setToast(null), 4000);
    };

    window.addEventListener(SYNC_STATUS_EVENT, onStatus);
    return () => {
      window.removeEventListener(SYNC_STATUS_EVENT, onStatus);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  return <ViewportToast message={toast} />;
}
