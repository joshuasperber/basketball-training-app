"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import CoachIntakeChat from "@/components/CoachIntakeChat";
import { isPlayerIntakeComplete, PLAYER_INTAKE_UPDATED_EVENT } from "@/lib/coach-intake";

const HIDDEN_PREFIXES = ["/login", "/auth/"];

export default function CoachIntakeLauncher() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);

  const hiddenRoute = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    if (hiddenRoute) {
      setOpen(false);
      return;
    }
    setOpen(!isPlayerIntakeComplete());
  }, [pathname, hiddenRoute]);

  useEffect(() => {
    const sync = () => {
      if (hiddenRoute) return;
      setOpen(!isPlayerIntakeComplete());
    };
    window.addEventListener(PLAYER_INTAKE_UPDATED_EVENT, sync);
    return () => window.removeEventListener(PLAYER_INTAKE_UPDATED_EVENT, sync);
  }, [hiddenRoute]);

  if (hiddenRoute || !open) return null;

  return <CoachIntakeChat onClose={() => setOpen(false)} />;
}
