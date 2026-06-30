"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import CoachIntakeChat from "@/components/CoachIntakeChat";
import {
  isPlayerIntakeDoneLocallyOrRemote,
  PLAYER_INTAKE_UPDATED_EVENT,
} from "@/lib/coach-intake";
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
      setOpen(false);
      setCloudChecked(true);
      return () => {
        cancelled = true;
      };
    }

    setCloudChecked(false);

    const sync = async () => {
      const remote = await ensureInitialCloudSync();
      if (cancelled) return;
      const done = isPlayerIntakeDoneLocallyOrRemote(remote?.playerIntake ?? null);
      setOpen(!done);
      setCloudChecked(true);
    };

    void sync();

    return () => {
      cancelled = true;
    };
  }, [pathname, hiddenRoute]);

  useEffect(() => {
    const sync = () => {
      if (hiddenRoute) return;
      setOpen(!isPlayerIntakeDoneLocallyOrRemote(null));
    };
    window.addEventListener(PLAYER_INTAKE_UPDATED_EVENT, sync);
    return () => window.removeEventListener(PLAYER_INTAKE_UPDATED_EVENT, sync);
  }, [hiddenRoute]);

  if (hiddenRoute || !cloudChecked || !open) return null;

  return <CoachIntakeChat onClose={() => setOpen(false)} />;
}
