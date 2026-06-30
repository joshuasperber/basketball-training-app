import { getWorkoutSessions } from "@/lib/session-storage";

export type OnboardingStep = {
  id: "profile" | "week" | "first-workout";
  title: string;
  description: string;
  href: string;
  done: boolean;
};

type ProfileCache = {
  profile?: { username?: string | null; full_name?: string | null };
  weekConfig?: Record<string, { mode?: string; minutes?: number }>;
};

function readProfileCache(): ProfileCache | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("profile_cache_v4");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProfileCache;
  } catch {
    return null;
  }
}

function hasProfileBasics() {
  const cache = readProfileCache();
  const username =
    cache?.profile?.username?.trim() ||
    window.localStorage.getItem("profile_username")?.trim() ||
    "";
  const fullName = cache?.profile?.full_name?.trim() || "";
  return Boolean(username && fullName);
}

function hasWeekConfig() {
  const cache = readProfileCache();
  const weekConfig = cache?.weekConfig;
  if (!weekConfig) return false;
  return Object.values(weekConfig).some((day) => {
    if (!day || typeof day !== "object") return false;
    const mode = day.mode ?? "unavailable";
    const minutes = day.minutes ?? 0;
    return mode !== "unavailable" && mode !== "rest" && minutes > 0;
  });
}

function hasCompletedWorkout() {
  return getWorkoutSessions().some((session) => session.workoutId !== "single-exercise-session");
}

export function getOnboardingSteps(): OnboardingStep[] {
  if (typeof window === "undefined") return [];

  return [
    {
      id: "profile",
      title: "Profil anlegen",
      description: "Name und Username für Personalisierung.",
      href: "/profile?setup=1",
      done: hasProfileBasics(),
    },
    {
      id: "week",
      title: "Woche konfigurieren",
      description: "Trainingstage und Minuten pro Tag festlegen.",
      href: "/profile?setup=1#woche",
      done: hasWeekConfig(),
    },
    {
      id: "first-workout",
      title: "Erstes Workout abschließen",
      description: "Starte deine erste Einheit aus dem Wochenplan.",
      href: "/weekly-workout",
      done: hasCompletedWorkout(),
    },
  ];
}

export function isOnboardingComplete(steps: OnboardingStep[] = getOnboardingSteps()) {
  return steps.length > 0 && steps.every((step) => step.done);
}
