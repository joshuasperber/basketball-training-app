import { ACTIVE_AUTH_EMAIL_KEY } from "@/lib/auth-session-align";
import { SYNC_USER_ID_KEY } from "@/lib/clear-local-user-data";

/** Lokale Hinweise, dass der Nutzer zuvor eingeloggt war — für Offline-Navigation. */
export function hasOfflineSessionHint(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.localStorage.getItem(ACTIVE_AUTH_EMAIL_KEY) ||
      window.localStorage.getItem(SYNC_USER_ID_KEY) ||
      window.localStorage.getItem("profile_cache_v4") ||
      window.localStorage.getItem("bt.workout-sessions.v1"),
  );
}
