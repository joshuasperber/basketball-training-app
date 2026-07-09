"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/I18nProvider";

export default function OfflineBanner() {
  const t = useT();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => {
      setOffline(typeof navigator !== "undefined" && !navigator.onLine);
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
      {t("offline.banner")}
    </div>
  );
}
