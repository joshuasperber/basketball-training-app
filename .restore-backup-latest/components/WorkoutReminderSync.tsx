"use client";

import { useEffect } from "react";
import { runReminderMaintenance } from "@/lib/workout-reminders";

export default function WorkoutReminderSync() {
  useEffect(() => {
    const sync = () => {
      void runReminderMaintenance();
    };

    const timer = window.setTimeout(sync, 0);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") sync();
    });
    window.addEventListener("bt:plan-updated", sync);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("bt:plan-updated", sync);
    };
  }, []);

  return null;
}
