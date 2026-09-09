"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ModernTimeInput from "@/components/ui/ModernTimeInput";
import type { DayKey, WeekConfig } from "@/lib/planner";
import {
  loadReminderPrefs,
  saveReminderPrefs,
  syncReminderSchedule,
  type ReminderPrefs,
} from "@/lib/workout-reminders";

const DAY_LABELS: Record<DayKey, string> = {
  monday: "Mo",
  tuesday: "Di",
  wednesday: "Mi",
  thursday: "Do",
  friday: "Fr",
  saturday: "Sa",
  sunday: "So",
};

export default function WorkoutReminderSettings({ weekConfig }: { weekConfig: WeekConfig }) {
  const [prefs, setPrefs] = useState<ReminderPrefs>({ enabled: false, time: "08:00" });
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [supportsNotifications, setSupportsNotifications] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setPrefs(loadReminderPrefs());
      if (typeof window !== "undefined" && "Notification" in window) {
        setSupportsNotifications(true);
        setPermission(Notification.permission);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const activeDays = useMemo(
    () =>
      (Object.entries(weekConfig) as [DayKey, WeekConfig[DayKey]][])
        .filter(([, cfg]) => cfg && cfg.mode !== "unavailable" && cfg.mode !== "rest")
        .map(([day]) => day as DayKey),
    [weekConfig],
  );

  const handleEnable = useCallback(async () => {
    if (!supportsNotifications) return;
    let perm = permission;
    if (perm !== "granted") {
      perm = await Notification.requestPermission();
      setPermission(perm);
    }
    if (perm !== "granted") {
      setPrefs((current) => {
        const next = { ...current, enabled: false };
        saveReminderPrefs(next);
        return next;
      });
      return;
    }
    const next = { ...prefs, enabled: true };
    setPrefs(next);
    saveReminderPrefs(next);
    await syncReminderSchedule(weekConfig, next);
  }, [permission, prefs, supportsNotifications, weekConfig]);

  const handleDisable = useCallback(() => {
    setPrefs((current) => {
      const next = { ...current, enabled: false };
      saveReminderPrefs(next);
      void syncReminderSchedule(weekConfig, next);
      return next;
    });
  }, [weekConfig]);

  const handleTimeChange = useCallback(
    (value: string) => {
      setPrefs((current) => {
        const next = { ...current, time: value };
        saveReminderPrefs(next);
        if (next.enabled && permission === "granted") {
          void syncReminderSchedule(weekConfig, next);
        }
        return next;
      });
    },
    [permission, weekConfig],
  );

  if (!supportsNotifications) {
    return (
      <section className="mt-4 app-card">
        <p className="section-eyebrow">Reminder</p>
        <p className="mt-1 text-xs text-muted">
          Dieser Browser unterstützt keine Notifications.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-4 app-card">
      <p className="section-eyebrow">Reminder</p>
      <h2 className="section-title mt-1">Trainings-Erinnerung</h2>
      <p className="text-xs text-muted">
        An aktiven Tagen bekommst du eine Browser-Notification, sobald der Browser die App im Hintergrund ausführen darf. Details in der{" "}
        <a href="/datenschutz" className="text-[var(--brand-400)] underline">
          Datenschutzerklärung
        </a>
        .
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <ModernTimeInput value={prefs.time} onChange={handleTimeChange} label="Uhrzeit" className="w-40" controlClassName="app-unified-control" />
        {prefs.enabled && permission === "granted" ? (
          <button type="button" onClick={handleDisable} className="btn btn-ghost self-end">
            Deaktivieren
          </button>
        ) : (
          <button type="button" onClick={() => void handleEnable()} className="btn btn-primary self-end">
            Aktivieren
          </button>
        )}
        <span
          className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
            prefs.enabled && permission === "granted"
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
              : "border-white/15 bg-white/[0.03] text-faint"
          }`}
        >
          {prefs.enabled && permission === "granted" ? "Aktiv" : permission === "denied" ? "Blockiert" : "Inaktiv"}
        </span>
      </div>

      <p className="mt-3 text-[11px] text-faint">
        Aktive Tage: {activeDays.length ? activeDays.map((day) => DAY_LABELS[day]).join(", ") : "—"}
      </p>
      {permission === "denied" ? (
        <p className="mt-1 text-[11px] text-amber-200">
          Benachrichtigungen sind im Browser blockiert – aktiviere sie in den Browser-Einstellungen.
        </p>
      ) : null}
    </section>
  );
}
