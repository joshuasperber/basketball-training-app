import type { DayKey, WeekConfig } from "@/lib/planner";
import { toLocalDateKey } from "@/lib/workout";

export type ReminderPrefs = {
  enabled: boolean;
  /** "HH:MM" 24h. */
  time: string;
};

export type ReminderOccurrence = {
  dayKey: DayKey;
  fireAt: number;
  tag: string;
};

export const REMINDER_PREFS_KEY = "bt.workout-reminder.v1";
export const REMINDER_LAST_FIRED_KEY = "bt.workout-reminder.last-fired";

const DAY_KEYS_BY_DOW: DayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const DAY_INDEX: Record<DayKey, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function loadReminderPrefs(): ReminderPrefs {
  if (typeof window === "undefined") return { enabled: false, time: "08:00" };
  try {
    const raw = window.localStorage.getItem(REMINDER_PREFS_KEY);
    if (!raw) return { enabled: false, time: "08:00" };
    return JSON.parse(raw) as ReminderPrefs;
  } catch {
    return { enabled: false, time: "08:00" };
  }
}

export function saveReminderPrefs(prefs: ReminderPrefs) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REMINDER_PREFS_KEY, JSON.stringify(prefs));
}

export function loadWeekConfigFromProfileCache(): WeekConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("profile_cache_v4");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { weekConfig?: WeekConfig };
    return parsed.weekConfig ?? null;
  } catch {
    return null;
  }
}

export function isActiveTrainingDay(weekConfig: WeekConfig, date = new Date()): boolean {
  const dayKey = DAY_KEYS_BY_DOW[date.getDay()];
  const cfg = weekConfig[dayKey];
  return Boolean(cfg && cfg.mode !== "unavailable" && cfg.mode !== "rest");
}

export function parseReminderTime(time: string, date = new Date()): Date | null {
  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr ?? "8");
  const minute = Number(minuteStr ?? "0");
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const candidate = new Date(date);
  candidate.setHours(hour, minute, 0, 0);
  return candidate;
}

export function wasReminderFiredOnDate(dateKey: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(REMINDER_LAST_FIRED_KEY) === dateKey;
}

export function markReminderFired(date = new Date()) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REMINDER_LAST_FIRED_KEY, toLocalDateKey(date));
}

export function nextOccurrencesForActiveDays(weekConfig: WeekConfig, time: string, now = new Date()): ReminderOccurrence[] {
  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr ?? "8");
  const minute = Number(minuteStr ?? "0");
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return [];

  const result: ReminderOccurrence[] = [];
  for (const [day, cfg] of Object.entries(weekConfig) as [DayKey, WeekConfig[DayKey]][]) {
    if (!cfg || cfg.mode === "unavailable" || cfg.mode === "rest") continue;
    const targetDow = DAY_INDEX[day];
    const candidate = new Date(now);
    candidate.setHours(hour, minute, 0, 0);
    const diff = (targetDow + 7 - candidate.getDay()) % 7;
    candidate.setDate(candidate.getDate() + diff);
    if (candidate.getTime() <= now.getTime()) {
      candidate.setDate(candidate.getDate() + 7);
    }
    result.push({
      dayKey: day,
      fireAt: candidate.getTime(),
      tag: `workout-reminder-${day}`,
    });
  }
  return result.sort((a, b) => a.fireAt - b.fireAt);
}

export function isReminderDueNow(weekConfig: WeekConfig, prefs: ReminderPrefs, now = new Date()): boolean {
  if (!prefs.enabled) return false;
  if (!isActiveTrainingDay(weekConfig, now)) return false;
  const fireAt = parseReminderTime(prefs.time, now);
  if (!fireAt) return false;
  if (now.getTime() < fireAt.getTime()) return false;
  return !wasReminderFiredOnDate(toLocalDateKey(now));
}

export async function showWorkoutReminderNotification(registration?: ServiceWorkerRegistration | null) {
  const payload = {
    title: "Trainings-Reminder 🏀",
    body: "Heute steht ein Workout an. Los geht's!",
    tag: `workout-reminder-${toLocalDateKey(new Date())}`,
    icon: "/icon.png",
    badge: "/icon.png",
    data: { url: "/weekly-workout" },
  };

  if (registration?.showNotification) {
    await registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: payload.icon,
      badge: payload.badge,
      data: payload.data,
    });
    return;
  }

  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    new Notification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: payload.icon,
      data: payload.data,
    });
  }
}

function postMessageToServiceWorker(message: unknown) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const target = navigator.serviceWorker.controller;
  if (target) {
    target.postMessage(message);
    return;
  }
  void navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage(message);
  });
}

export async function syncReminderSchedule(weekConfig: WeekConfig, prefs: ReminderPrefs) {
  if (typeof window === "undefined") return;
  if (!prefs.enabled || !("Notification" in window) || Notification.permission !== "granted") {
    postMessageToServiceWorker({ type: "clear-reminders" });
    return;
  }

  const now = Date.now();
  const maxDelayMs = 48 * 60 * 60 * 1000;
  const items = nextOccurrencesForActiveDays(weekConfig, prefs.time)
    .filter((occurrence) => occurrence.fireAt - now <= maxDelayMs)
    .map((occurrence) => ({
      title: "Trainings-Reminder 🏀",
      body: "Heute steht ein Workout an. Los geht's!",
      tag: occurrence.tag,
      fireAtTs: occurrence.fireAt,
    }));

  postMessageToServiceWorker({ type: "sync-reminders", payload: { items } });
}

export async function checkAndFireDueReminder(weekConfig: WeekConfig | null, prefs: ReminderPrefs) {
  if (typeof window === "undefined") return;
  if (!weekConfig || !prefs.enabled || !("Notification" in window) || Notification.permission !== "granted") {
    return;
  }
  if (!isReminderDueNow(weekConfig, prefs)) return;

  const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.ready.catch(() => null) : null;
  await showWorkoutReminderNotification(registration);
  markReminderFired();
}

export async function runReminderMaintenance() {
  if (typeof window === "undefined") return;
  const prefs = loadReminderPrefs();
  const weekConfig = loadWeekConfigFromProfileCache();
  if (!weekConfig) return;
  await checkAndFireDueReminder(weekConfig, prefs);
  await syncReminderSchedule(weekConfig, prefs);
}
