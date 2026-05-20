"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import CoachIntakeChat from "@/components/CoachIntakeChat";
import { isPlayerIntakeComplete, PLAYER_INTAKE_UPDATED_EVENT } from "@/lib/coach-intake";
import { ensureInitialCloudSync } from "@/lib/progress-sync";

const HIDDEN_PREFIXES = ["/login", "/auth/"];

export default function CoachIntakeLauncher() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [cloudChecked, setCloudChecked] = useState(false);

  const hiddenRoute = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    let cancelled = false;
    if (hiddenRoute) {
      const timer = window.setTimeout(() => {
        setOpen(false);
        setCloudChecked(true);
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }
    const resetTimer = window.setTimeout(() => setCloudChecked(false), 0);
    const sync = async () => {
      await ensureInitialCloudSync();
      if (!cancelled) {
        window.setTimeout(() => {
          setCloudChecked(true);
          setOpen(!isPlayerIntakeComplete());
        }, 0);
      }
    };
    void sync();
    return () => {
      cancelled = true;
      window.clearTimeout(resetTimer);
    };
  }, [pathname, hiddenRoute]);

  useEffect(() => {
    const sync = () => {
      if (hiddenRoute) return;
      window.setTimeout(() => setOpen(!isPlayerIntakeComplete()), 0);
    };
    window.addEventListener(PLAYER_INTAKE_UPDATED_EVENT, sync);
    return () => window.removeEventListener(PLAYER_INTAKE_UPDATED_EVENT, sync);
  }, [hiddenRoute]);

  if (hiddenRoute || !cloudChecked || !open) return null;

  return <CoachIntakeChat onClose={() => setOpen(false)} />;
}
