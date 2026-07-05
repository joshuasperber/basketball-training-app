import { isAppOnline } from "@/lib/app-online";

function appendQueryParam(href: string, key: string, value: string) {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${key}=${encodeURIComponent(value)}`;
}

/** Nach Workout-Abschluss — offline nur gecachte Routen nutzen. */
export function getPostWorkoutCompletionHref(isCatalogWorkoutRun: boolean, returnTo?: string): string {
  if (isCatalogWorkoutRun) {
    return appendQueryParam(returnTo ?? "/training", "completed", "workout");
  }
  if (isAppOnline()) return "/stats";
  return "/training?completed=workout";
}

export function getPostExerciseCompletionHref(returnTo: string): string {
  return appendQueryParam(returnTo, "completed", "exercise");
}
