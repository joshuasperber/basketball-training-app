export const PROTECTED_APP_PREFIXES = [
  "/dashboard",
  "/training",
  "/weekly-workout",
  "/stats",
  "/level",
  "/profile",
  "/team",
  "/workouts",
  "/create-exercise",
  "/exercises",
  "/game-track",
  "/liga",
  "/review",
  "/tips",
] as const;

export function isProtectedAppPath(pathname: string) {
  return PROTECTED_APP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
