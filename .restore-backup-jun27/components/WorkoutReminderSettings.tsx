"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DayKey, WeekConfig } from "@/lib/planner";

type ReminderPrefs = {
  enabled: boolean;
  /** "HH:MM" 24h. */
  time: string;
};

const REMINDER_KEY = "bt.workout-reminder.v1";
const SCHEDULED_FLAG_KEY = "bt.workout-reminder.scheduled-at";

const DAY_LABELS: Record<DayKey, string> = {
  monday: "Mo",
  tuesday: "Di",
  wednesday: "Mi",
  thursday: "Do",
  friday: "Fr",
  saturday: "Sa",
  sunday: "So",
};

function loadPrefs(): ReminderPrefs {
  if (typeof window === "undefined") return { enabled: false, time: "08:00" };
  try {
    const raw = window.localStorage.getItem(REMINDER_KEY);
    if (!raw) return { enabled: false, time: "08:00" };
    return JSON.parse(raw) as ReminderPrefs;
  } catch {
    return { enabled: false, time: "08:00" };
  }
}

function savePrefs(prefs: ReminderPrefs) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REMINDER_KEY, JSON.stringify(prefs));
}

function nextOccurrencesForActiveDays(weekConfig: WeekConfig, time: string): { dayKey: DayKey; fireAt: number }[] {
  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr ?? "8");
  const minute = Number(minuteStr ?? "0");
  if (Number.isNaN(hour) || Number.isNaN(minute)) return [];

  const dayIndexMap: Record<DayKey, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  const result: { dayKey: DayKey; fireAt: number }[] = [];
  const now = new Date();
  for (const [day, cfg] of Object.entries(weekConfig) as [DayKey, WeekConfig[DayKey]][]) {
    if (!cfg || cfg.mode === "unavailable" || cfg.mode === "rest") continue;
    const targetDow = dayIndexMap[day];
    const candidate = new Date(now);
    candidate.setHours(hour, minute, 0, 0);
    const diff = (targetDow + 7 - candidate.getDay()) % 7;
    candidate.setDate(candidate.getDate() + diff);
    if (candidate.getTime() <= now.getTime()) {
      candidate.setDate(candidate.getDate() + 7);
    }
    result.push({ dayKey: day, fireAt: candidate.getTime() });
  }
  return result.sort((a, b) => a.fireAt - b.fireAt);
}

async function scheduleReminders(weekConfig: WeekConfig, prefs: ReminderPrefs) {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker.ready;
  if (!registration.active) return;

  const occurrences = nextOccurrencesForActiveDays(weekConfig, prefs.time).slice(0, 7);
  for (const occurrence of occurrences) {
    registration.active.postMessage({
      type: "schedule-reminder",
      payload: {
        title: "Trainings-Reminder 🏀",
        body: "Heute steht ein Workout an. Los geht's!",
        tag: `workout-reminder-${occurrence.dayKey}`,
        fireAtTs: occurrence.fireAt,
      },
    });
  }
  window.localStorage.setItem(SCHEDULED_FLAG_KEY, String(Date.now()));
}

export default function WorkoutReminderSettings({ weekConfig }: { weekConfig: WeekConfig }) {
  const [prefs, setPrefs] = useState<ReminderPrefs>({ enabled: false, time: "08:00" });
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [supportsNotifications, setSupportsNotifications] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setPrefs(loadPrefs());
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
        savePrefs(next);
        return next;
      });
      return;
    }
    setPrefs((current) => {
      const next = { ...current, enabled: true };
      savePrefs(next);
      return next;
    });
    await scheduleReminders(weekConfig, { ...prefs, enabled: true });
  }, [permission, prefs, supportsNotifications, weekConfig]);

  const handleDisable = useCallback(() => {
    setPrefs((current) => {
      const next = { ...current, enabled: false };
      savePrefs(next);
      return next;
    });
  }, []);

  const handleTimeChange = useCallback(
    (value: string) => {
      setPrefs((current) => {
        const next = { ...current, time: value };
        savePrefs(next);
        if (next.enabled && permission === "granted") {
          void scheduleReminders(weekConfig, next);
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
        An aktiven Tagen bekommst du eine Browser-Notification.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-strong">
          <span>Uhrzeit</span>
          <input
            type="time"
            value={prefs.time}
            onChange={(event) => handleTimeChange(event.target.value)}
            className="input w-28"
          />
        </label>
        {prefs.enabled && permission === "granted" ? (
          <button type="button" onClick={handleDisable} className="btn btn-ghost btn-sm">
            Deaktivieren
          </button>
        ) : (
          <button type="button" onClick={() => void handleEnable()} className="btn btn-primary btn-sm">
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
