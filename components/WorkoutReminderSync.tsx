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
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("bt:plan-updated", sync);
    window.addEventListener("bt:reminder-prefs-updated", sync);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("bt:plan-updated", sync);
      window.removeEventListener("bt:reminder-prefs-updated", sync);
    };
  }, []);

  return null;
}
