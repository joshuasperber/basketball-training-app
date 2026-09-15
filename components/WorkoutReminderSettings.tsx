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
  const [serverPushConfigured, setServerPushConfigured] = useState(false);
  const [serverPushActive, setServerPushActive] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setPrefs(loadReminderPrefs());
      if (typeof window !== "undefined" && "Notification" in window) {
        setSupportsNotifications(true);
        setPermission(Notification.permission);
        void Promise.all([
          fetch("/api/notifications/subscription", { credentials: "same-origin", cache: "no-store" }).then((response) => response.ok ? response.json() : null),
          "serviceWorker" in navigator ? navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).catch(() => null) : Promise.resolve(null),
        ]).then(([payload, subscription]) => {
          const data = payload as { configured?: boolean; subscriptions?: { endpoint?: string }[] } | null;
          setServerPushConfigured(Boolean(data?.configured));
          setServerPushActive(Boolean(subscription && data?.subscriptions?.some((entry) => entry.endpoint === subscription.endpoint)));
        });
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

  const enableServerPush = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const configResponse = await fetch("/api/notifications/subscription", { credentials: "same-origin", cache: "no-store" });
    if (!configResponse.ok) return false;
    const config = await configResponse.json() as { configured?: boolean; publicKey?: string | null };
    setServerPushConfigured(Boolean(config.configured));
    if (!config.configured || !config.publicKey) return false;
    const registration = await navigator.serviceWorker.ready;
    const padding = "=".repeat((4 - (config.publicKey.length % 4)) % 4);
    const decoded = atob((config.publicKey + padding).replace(/-/g, "+").replace(/_/g, "/"));
    const applicationServerKey = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
    const response = await fetch("/api/notifications/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        reminderMinutes: 120,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin",
      }),
    });
    if (!response.ok) return false;
    setServerPushActive(true);
    return true;
  }, []);

  const disableServerPush = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.ready.catch(() => null);
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await fetch("/api/notifications/subscription", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch(() => undefined);
      await subscription.unsubscribe().catch(() => false);
    }
    setServerPushActive(false);
  }, []);

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
    try {
      const serverEnabled = await enableServerPush();
      setPushMessage(serverEnabled ? "Zuverlässige Push-Erinnerungen sind aktiv." : "Lokaler Browser-Reminder ist aktiv.");
    } catch {
      setPushMessage("Lokaler Reminder ist aktiv; Server-Push konnte nicht aktiviert werden.");
    }
  }, [enableServerPush, permission, prefs, supportsNotifications, weekConfig]);

  const handleDisable = useCallback(() => {
    setPrefs((current) => {
      const next = { ...current, enabled: false };
      saveReminderPrefs(next);
      void syncReminderSchedule(weekConfig, next);
      void disableServerPush();
      return next;
    });
  }, [disableServerPush, weekConfig]);

  const handleAddServerPush = useCallback(async () => {
    try {
      const enabled = await enableServerPush();
      setPushMessage(enabled ? "Zuverlässige Push-Erinnerungen sind aktiv." : "Server-Push konnte nicht aktiviert werden.");
    } catch {
      setPushMessage("Server-Push konnte nicht aktiviert werden; der lokale Reminder bleibt aktiv.");
    }
  }, [enableServerPush]);

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
        An aktiven Tagen bekommst du eine Benachrichtigung. Mit Server-Push erhältst du zusätzlich Spielplanänderungen, Zusagefristen und Spiel-Erinnerungen. Details in der{" "}
        <a href="/datenschutz" className="text-link underline">
          Datenschutzerklärung
        </a>
        .
      </p>
      {!serverPushActive ? <p className="mt-1 text-[11px] text-faint">{serverPushConfigured ? "Aktiviere den Reminder, um zuverlässigen Server-Push einzurichten." : "Server-Push ist noch nicht konfiguriert; bei vollständig geschlossenem Browser bleibt der lokale Reminder unverbindlich."}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <ModernTimeInput value={prefs.time} onChange={handleTimeChange} label="Uhrzeit" className="w-40" controlClassName="app-unified-control" />
        {prefs.enabled && permission === "granted" ? (
          <>
            <button type="button" onClick={handleDisable} className="btn btn-ghost self-end">
              Deaktivieren
            </button>
            {serverPushConfigured && !serverPushActive ? (
              <button type="button" onClick={() => void handleAddServerPush()} className="btn btn-outline self-end">
                Push ergänzen
              </button>
            ) : null}
          </>
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
          {prefs.enabled && permission === "granted" ? serverPushActive ? "Push aktiv" : "Lokal aktiv" : permission === "denied" ? "Blockiert" : "Inaktiv"}
        </span>
      </div>

      {pushMessage ? <p className="mt-2 text-xs text-muted" role="status">{pushMessage}</p> : null}

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
