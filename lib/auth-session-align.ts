/** Verhindert, dass Trainingsdaten von Account A an Account B in der Cloud landen (gleicher Browser / Inkognito-Fenster). */

export const ACTIVE_AUTH_EMAIL_KEY = "bt.active-auth-email.v1";

export type AuthMeResponse = {
  id: string;
  email: string;
  cloud: { sessionCount: number; workouts14d: number };
  supabaseConfigured: boolean;
};

import { isAppOnline } from "@/lib/app-online";

const AUTH_ME_CACHE_MS = 60_000;
const AUTH_ME_FAILURE_CACHE_MS = 5_000;

type AuthMeCacheEntry = {
  value: AuthMeResponse | null;
  expiresAt: number;
};

let authMeCache: AuthMeCacheEntry | null = null;
let authMeRequest: Promise<AuthMeResponse | null> | null = null;

/** Verwirft den kurzlebigen Auth-Cache, z. B. nach Login oder Logout. */
export function resetAuthMeCache() {
  authMeCache = null;
  authMeRequest = null;
}

/**
 * Dedupliziert parallele /api/auth/me-Aufrufe und hält das Ergebnis kurz im
 * Browser-Speicher. Dadurch lösen Reiterwechsel keinen neuen Auth-Ladezustand aus.
 */
export async function fetchAuthMe(options: { force?: boolean } = {}): Promise<AuthMeResponse | null> {
  if (!isAppOnline()) return null;

  const now = Date.now();
  if (!options.force && authMeCache && authMeCache.expiresAt > now) {
    return authMeCache.value;
  }
  if (!options.force && authMeRequest) return authMeRequest;

  const request = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch("/api/auth/me", {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      const value = response.ok ? ((await response.json()) as AuthMeResponse) : null;
      authMeCache = {
        value,
        expiresAt: Date.now() + (value ? AUTH_ME_CACHE_MS : AUTH_ME_FAILURE_CACHE_MS),
      };
      return value;
    } catch {
      authMeCache = { value: null, expiresAt: Date.now() + AUTH_ME_FAILURE_CACHE_MS };
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  })();

  authMeRequest = request;
  return request.finally(() => {
    if (authMeRequest === request) authMeRequest = null;
  });
}

export async function checkAuthSession(): Promise<{ me: AuthMeResponse | null; accountSwitched: boolean }> {
  if (typeof window === "undefined") return { me: null, accountSwitched: false };

  const me = await fetchAuthMe();
  if (!me) return { me: null, accountSwitched: false };

  const previous = window.localStorage.getItem(ACTIVE_AUTH_EMAIL_KEY)?.trim().toLowerCase();
  const current = me.email.trim().toLowerCase();
  const accountSwitched = Boolean(previous && previous !== current);

  window.localStorage.setItem(ACTIVE_AUTH_EMAIL_KEY, current);
  return { me, accountSwitched };
}
