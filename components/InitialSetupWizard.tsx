"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CoachIntakeChat from "@/components/CoachIntakeChat";
import NumericInput from "@/components/ui/NumericInput";
import { applyWeekConfigToCalendar } from "@/lib/activity-calendar";
import {
  createBlankProfileCache,
  DAY_LABELS,
  hasConfiguredWeekRhythm,
  hasProfileBasics,
  markInitialSetupComplete,
  SETUP_DAY_KEYS,
  type ProfileCacheShape,
} from "@/lib/onboarding-gate";
import { pushProgressToCloudWithRetry } from "@/lib/progress-sync";
import { getEmptyWeekConfig, type DayKey, type DayMode, type WeekConfig } from "@/lib/planner";

const PROFILE_CACHE_KEY = "profile_cache_v4";
const PROFILE_USERNAME_KEY = "profile_username";
const PROFILE_WEEK_CONFIG_KEY = "bt.profile-week-config.v1";

const POSITIONS = [
  { id: "pg", label: "PG — Point Guard" },
  { id: "sg", label: "SG — Shooting Guard" },
  { id: "sf", label: "SF — Small Forward" },
  { id: "pf", label: "PF — Power Forward" },
  { id: "c", label: "C — Center" },
];

const PLAY_STYLES: Record<string, string[]> = {
  pg: ["Passer", "Floor General", "Pick-and-Roll Creator", "Tempo Controller"],
  sg: ["Shooter", "Slasher", "3&D", "Off-Ball Mover"],
  sf: ["Two-Way Wing", "Point Forward", "Cutting Wing", "Spot-Up Wing"],
  pf: ["Stretch Four", "Roll Man", "Post Finisher", "Rebounder"],
  c: ["Rim Protector", "Post Scorer", "Lob Threat", "High-Post Playmaker"],
};

const TRAINING_MODES: { value: DayMode; label: string; defaultMin: number; fixedUnit?: boolean }[] = [
  { value: "basketball_training", label: "Basketball-Training", defaultMin: 45 },
  { value: "gym", label: "Gym / Kraft", defaultMin: 60 },
  { value: "game_training", label: "Spieltraining", defaultMin: 45 },
  { value: "recovery", label: "Regeneration", defaultMin: 25 },
  { value: "game_day", label: "Spieltag", defaultMin: 0, fixedUnit: true },
];

type WizardStep = "profile" | "week" | "coach";
type UsernameStatus = "idle" | "checking" | "available" | "taken";
type ProfileSaveResult = "saved" | "taken" | "pending";

function isTrainingDay(cfg: WeekConfig[DayKey]) {
  if (cfg.mode === "unavailable" || cfg.mode === "rest") return false;
  if (cfg.mode === "game_day") return true;
  return cfg.minutes > 0;
}

function persistSetupCache(payload: ProfileCacheShape) {
  window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(payload));
  if (payload.profile?.username) {
    window.localStorage.setItem(PROFILE_USERNAME_KEY, payload.profile.username);
  }
  if (payload.weekConfig) {
    window.localStorage.setItem(PROFILE_WEEK_CONFIG_KEY, JSON.stringify(payload.weekConfig));
  }
}

type Props = {
  authEmail: string | null;
  onComplete: () => void;
};

export default function InitialSetupWizard({ authEmail, onComplete }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [cache, setCache] = useState<ProfileCacheShape>(() => {
    const blank = createBlankProfileCache(authEmail);
    if (typeof window === "undefined") return blank;
    try {
      const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ProfileCacheShape;
        if (parsed.onboardingComplete) return parsed;
        if (hasProfileBasics(parsed) || hasConfiguredWeekRhythm(parsed)) {
          return {
            ...blank,
            ...parsed,
            profile: { ...blank.profile, ...parsed.profile },
            weekConfig: parsed.weekConfig ?? blank.weekConfig,
          };
        }
      }
    } catch {
      /* blank */
    }
    return blank;
  });
  const [step, setStep] = useState<WizardStep>(() => (hasProfileBasics(cache) ? "week" : "profile"));

  const profile = cache.profile ?? createBlankProfileCache(authEmail).profile!;
  const weekConfig = cache.weekConfig ?? getEmptyWeekConfig();
  const position = profile.favorite_position ?? "sg";
  const playStyles = PLAY_STYLES[position] ?? PLAY_STYLES.sg;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const checkUsernameAvailability = useCallback(async (candidate: string, signal?: AbortSignal) => {
    const username = candidate.trim().toLowerCase();
    if (username.length < 3) return "idle" as const;
    try {
      const response = await fetch(`/api/profile?username=${encodeURIComponent(username)}`, {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      if (!response.ok) return "idle" as const;
      const payload = (await response.json()) as { available?: boolean };
      return payload.available ? ("available" as const) : ("taken" as const);
    } catch {
      return "idle" as const;
    }
  }, []);

  useEffect(() => {
    if (step !== "profile") return;
    const username = profile.username?.trim().toLowerCase() ?? "";
    if (username.length < 3) {
      setUsernameStatus("idle");
      return;
    }

    const controller = new AbortController();
    setUsernameStatus("checking");
    const timer = window.setTimeout(() => {
      void checkUsernameAvailability(username, controller.signal).then((status) => {
        if (!controller.signal.aborted) setUsernameStatus(status);
      });
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [checkUsernameAvailability, profile.username, step]);

  const updateProfile = (patch: Partial<NonNullable<ProfileCacheShape["profile"]>>) => {
    setCache((prev) => ({
      ...prev,
      profile: { ...prev.profile!, ...patch },
    }));
  };

  const updateDay = (day: DayKey, patch: Partial<WeekConfig[DayKey]>) => {
    setCache((prev) => ({
      ...prev,
      weekConfig: {
        ...(prev.weekConfig ?? getEmptyWeekConfig()),
        [day]: { ...(prev.weekConfig ?? getEmptyWeekConfig())[day], ...patch },
      },
    }));
  };

  const saveProfileStep = async () => {
    const username = profile.username?.trim() ?? "";
    const fullName = profile.full_name?.trim() ?? "";
    if (!username || !fullName) {
      setMessage("Bitte Name und Username ausfüllen — beides ist Pflicht.");
      return;
    }
    if (username.length < 3) {
      setMessage("Der Username muss mindestens 3 Zeichen lang sein.");
      return;
    }
    setSaving(true);
    const availability = await checkUsernameAvailability(username);
    setUsernameStatus(availability);
    if (availability === "taken") {
      setMessage("Dieser Username ist bereits vergeben. Bitte wähle einen anderen.");
      setSaving(false);
      return;
    }
    const profileSave = await persistProfileToCloud();
    if (profileSave === "taken") {
      setUsernameStatus("taken");
      setMessage("Dieser Username ist bereits vergeben. Bitte wähle einen anderen.");
      setSaving(false);
      return;
    }
    const next: ProfileCacheShape = {
      ...cache,
      onboardingComplete: false,
      playStyle: cache.playStyle || playStyles[0] || "Shooter",
    };
    persistSetupCache(next);
    setCache(next);
    setMessage(null);
    setStep("week");
    setSaving(false);
  };

  const persistProfileToCloud = async (): Promise<ProfileSaveResult> => {
    const payload = {
      username: profile.username?.trim() ?? "",
      full_name: profile.full_name?.trim() || null,
      favorite_position: profile.favorite_position ?? null,
      height_cm: profile.height_cm ?? null,
      weight_kg: profile.weight_kg ?? null,
    };
    const save = () => fetch("/api/profile", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    try {
      let response = await save();
      if (response.status === 401) {
        const refreshed = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
        if (refreshed.ok) response = await save();
      }
      if (response.ok) return "saved";

      const detail = (await response.json().catch(() => null)) as { error?: string } | null;
      if (detail?.error === "username_taken") {
        return "taken";
      }
    } catch {
      // Treat transient network/auth outages as a background retry.
    }
    // The local setup remains usable during a transient auth/network outage.
    // Background sync and the next profile save will retry automatically.
    return "pending";
  };

  const saveWeekStep = async () => {
    const hasTraining = SETUP_DAY_KEYS.some((day) => isTrainingDay(weekConfig[day]));
    if (!hasTraining) {
      setMessage("Bitte mindestens einen Trainingstag oder Spieltag auswählen.");
      return;
    }
    const normalizedWeek = { ...weekConfig };
    for (const day of SETUP_DAY_KEYS) {
      if (normalizedWeek[day].mode === "game_day") {
        normalizedWeek[day] = { mode: "game_day", minutes: 0 };
      }
    }
    setSaving(true);
    setMessage(null);
    try {
      const profileSave = await persistProfileToCloud();
      if (profileSave === "taken") {
        setUsernameStatus("taken");
        setMessage("Dieser Username ist bereits vergeben. Bitte wähle einen anderen.");
        setStep("profile");
        return;
      }

      const next: ProfileCacheShape = { ...cache, weekConfig: normalizedWeek, onboardingComplete: false };
      persistSetupCache(next);
      applyWeekConfigToCalendar(normalizedWeek, 28);
      setCache(next);
      void pushProgressToCloudWithRetry({
        profileCache: JSON.stringify(next),
        profileUsername: profile.username ?? null,
        profileWeekConfig: JSON.stringify(normalizedWeek),
      });
      setStep("coach");
    } catch {
      // Local persistence already succeeded; cloud sync continues in the background.
      setStep("coach");
    } finally {
      setSaving(false);
    }
  };

  const finishCoachStep = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    const completed = { ...cache, onboardingComplete: true };
    try {
      markInitialSetupComplete(completed, { sync: false });
      void pushProgressToCloudWithRetry({ profileCache: JSON.stringify(completed) });
      onComplete();
    } finally {
      setSaving(false);
    }
  }, [cache, onComplete, saving]);

  if (step === "coach") {
    const coach = (
      <div className="fixed inset-0 z-[60] overflow-y-auto bg-[var(--bg-base)]">
        <div className="app-container max-w-lg py-4 pb-8">
          <header className="mb-3">
            <p className="page-eyebrow">Schritt 3 von 3</p>
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--fg-strong)]">KI-Coach Kennenlernen</h1>
            <p className="mt-1 text-sm text-muted">Kurz ausfüllen oder überspringen — danach startest du in der App.</p>
            {saving ? <p className="mt-2 text-sm text-muted">Ersteinrichtung wird sicher gespeichert …</p> : null}
            {message ? <p className="mt-2 text-sm text-rose-600" role="alert">{message}</p> : null}
          </header>
          <CoachIntakeChat embedded variant="light" mandatory onClose={finishCoachStep} />
        </div>
      </div>
    );
    if (typeof document === "undefined") return null;
    return createPortal(coach, document.body);
  }

  const shell = (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-y-contain bg-[var(--bg-base)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="initial-setup-title"
    >
      <div className="app-container mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col py-6 pb-10">
        <header className="mb-5">
          <p className="page-eyebrow">Ersteinrichtung · Pflicht</p>
          <h1 id="initial-setup-title" className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--fg-strong)]">
            {step === "profile" ? "Dein Spielerprofil" : "Dein Wochenrhythmus"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            Schritt {step === "profile" ? "1" : "2"} von 3 — bitte vollständig ausfüllen, um fortzufahren.
          </p>
          <div className="mt-3 flex gap-1">
            {(["profile", "week", "coach"] as WizardStep[]).map((item, index) => (
              <div
                key={item}
                className={`h-1.5 flex-1 rounded-full ${index <= (step === "profile" ? 0 : 1) ? "bg-[var(--brand-500)]" : "bg-[var(--bg-muted)]"}`}
              />
            ))}
          </div>
        </header>

        <div className="app-card space-y-4">
          {step === "profile" ? (
            <>
              <div>
                <label className="input-label" htmlFor="setup-full-name">
                  Vollständiger Name *
                </label>
                <input
                  id="setup-full-name"
                  className="input"
                  value={profile.full_name ?? ""}
                  onChange={(e) => updateProfile({ full_name: e.target.value })}
                  placeholder="z. B. Max Mustermann"
                  autoComplete="name"
                  required
                />
              </div>
              <div>
                <label className="input-label" htmlFor="setup-username">
                  Username *
                </label>
                <input
                  id="setup-username"
                  className="input"
                  value={profile.username ?? ""}
                  onChange={(e) => {
                    setMessage(null);
                    setUsernameStatus("idle");
                    updateProfile({ username: e.target.value.replace(/\s/g, "").toLowerCase() });
                  }}
                  placeholder="z. B. max_m"
                  autoComplete="username"
                  required
                />
                {usernameStatus === "checking" ? <p className="field-hint">Username wird geprüft …</p> : null}
                {usernameStatus === "available" ? <p className="field-success">Username ist verfügbar.</p> : null}
                {usernameStatus === "taken" ? <p className="field-error" role="alert">Dieser Username ist bereits vergeben.</p> : null}
              </div>
              {authEmail ? (
                <p className="text-xs text-faint">
                  E-Mail: <span className="text-muted">{authEmail}</span>
                </p>
              ) : null}
              <div>
                <label className="input-label" htmlFor="setup-position">
                  Position
                </label>
                <select
                  id="setup-position"
                  className="input"
                  value={position}
                  onChange={(e) => {
                    const nextPos = e.target.value;
                    const styles = PLAY_STYLES[nextPos] ?? PLAY_STYLES.sg;
                    setCache((prev) => ({
                      ...prev,
                      profile: { ...prev.profile!, favorite_position: nextPos },
                      playStyle: styles[0],
                    }));
                  }}
                >
                  {POSITIONS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="input-label" htmlFor="setup-play-style">
                  Spielstil
                </label>
                <select
                  id="setup-play-style"
                  className="input"
                  value={cache.playStyle ?? playStyles[0]}
                  onChange={(e) => setCache((prev) => ({ ...prev, playStyle: e.target.value }))}
                >
                  {playStyles.map((style) => (
                    <option key={style} value={style}>
                      {style}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label" htmlFor="setup-height">
                    Größe (cm)
                  </label>
                  <NumericInput
                    id="setup-height"
                    className="input"
                    value={profile.height_cm}
                    onValueChange={(height_cm) => updateProfile({ height_cm })}
                    min={100}
                    max={250}
                    placeholder="185"
                  />
                </div>
                <div>
                  <label className="input-label" htmlFor="setup-weight">
                    Gewicht (kg)
                  </label>
                  <NumericInput
                    id="setup-weight"
                    className="input"
                    value={profile.weight_kg}
                    onValueChange={(weight_kg) => updateProfile({ weight_kg })}
                    min={30}
                    max={200}
                    placeholder="80"
                  />
                </div>
              </div>
              <button type="button" className="btn btn-primary btn-block" disabled={saving || usernameStatus === "checking"} onClick={() => void saveProfileStep()}>
                {saving ? "Profil wird geprüft …" : "Weiter zum Wochenrhythmus"}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">An welchen Tagen hast du typischerweise Zeit?</p>
              {SETUP_DAY_KEYS.map((day) => {
                const cfg = weekConfig[day];
                const active = cfg.mode !== "unavailable" && cfg.mode !== "rest";
                const isGameDay = cfg.mode === "game_day";
                return (
                  <div key={day} className="list-card">
                    <label className="flex items-center gap-2 text-sm font-semibold text-strong">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) => {
                          if (e.target.checked) {
                            updateDay(day, { mode: "basketball_training", minutes: 45 });
                          } else {
                            updateDay(day, { mode: "unavailable", minutes: 0 });
                          }
                        }}
                      />
                      {DAY_LABELS[day]}
                    </label>
                    {active ? (
                      <div className="mt-2 space-y-2">
                        <select
                          className="input input-sm"
                          value={cfg.mode}
                          onChange={(e) => {
                            const mode = e.target.value as DayMode;
                            const preset = TRAINING_MODES.find((m) => m.value === mode);
                            if (preset?.fixedUnit) {
                              updateDay(day, { mode, minutes: 0 });
                            } else {
                              updateDay(day, { mode, minutes: preset?.defaultMin ?? (cfg.minutes || 45) });
                            }
                          }}
                        >
                          {TRAINING_MODES.map((mode) => (
                            <option key={mode.value} value={mode.value}>
                              {mode.label}
                            </option>
                          ))}
                        </select>
                        {isGameDay ? (
                          <p className="text-xs text-muted">Spieltag — feste Einheit, keine Minutenangabe nötig.</p>
                        ) : (
                          <div className="flex items-center gap-2">
                            <NumericInput
                              className="input input-sm w-24"
                              value={cfg.minutes}
                              onValueChange={(minutes) => updateDay(day, { minutes: minutes ?? 0 })}
                              min={15}
                              max={180}
                              aria-label={`Minuten ${DAY_LABELS[day]}`}
                            />
                            <span className="text-xs text-muted">Minuten</span>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <div className="flex gap-2 pt-1">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep("profile")}>
                  Zurück
                </button>
                <button type="button" className="btn btn-primary btn-block" disabled={saving} onClick={() => void saveWeekStep()}>
                  {saving ? "Wird gespeichert …" : "Weiter zum KI-Coach"}
                </button>
              </div>
            </>
          )}

          {message ? <p className="text-sm text-rose-600">{message}</p> : null}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(shell, document.body);
}
