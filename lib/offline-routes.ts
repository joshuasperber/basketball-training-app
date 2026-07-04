/** App-Routen, die offline erreichbar sein sollen (nach einmaligem Online-Warmup). */
export const OFFLINE_APP_ROUTES = [
  "/dashboard",
  "/training",
  "/weekly-workout",
  "/workouts",
  "/stats",
  "/team",
  "/profile",
  "/tips",
  "/game-track",
  "/level",
  "/liga",
  "/review",
  "/create-exercise",
] as const;

export type OfflineAppRoute = (typeof OFFLINE_APP_ROUTES)[number];
