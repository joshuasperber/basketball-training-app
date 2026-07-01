"use client";

import { useEffect, useState } from "react";
import { dispatchSyncStatus } from "@/lib/sync-status";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => {
      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
      setOffline(isOffline);
      if (isOffline) {
        dispatchSyncStatus({ status: "offline" });
      }
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      className="sticky top-0 z-50 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-center text-xs font-medium text-amber-900 dark:text-amber-100"
      role="status"
    >
      Offline — Änderungen werden lokal gespeichert und beim nächsten Online-Status synchronisiert.
    </div>
  );
}
