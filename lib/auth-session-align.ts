/** Verhindert, dass Trainingsdaten von Account A an Account B in der Cloud landen (gleicher Browser / Inkognito-Fenster). */

export const ACTIVE_AUTH_EMAIL_KEY = "bt.active-auth-email.v1";

export type AuthMeResponse = {
  authenticated?: true;
  id: string;
  email: string;
  cloud: { sessionCount: number; workouts14d: number };
  supabaseConfigured: boolean;
};

import { isAppOnline } from "@/lib/app-online";

const AUTH_ME_CACHE_MS = 60_000;
const AUTH_ME_FAILURE_CACHE_MS = 5_000;

export type AuthMeState =
  | { status: "authenticated"; user: AuthMeResponse }
  | { status: "unauthenticated"; user: null }
  | { status: "unavailable"; user: AuthMeResponse | null };

type AuthMeCacheEntry = {
  value: AuthMeState;
  expiresAt: number;
};

let authMeCache: AuthMeCacheEntry | null = null;
let authMeRequest: Promise<AuthMeState> | null = null;
let lastSuccessfulAuthMe: AuthMeResponse | null = null;

/** Verwirft den kurzlebigen Auth-Cache, z. B. nach Login oder Logout. */
export function resetAuthMeCache() {
  authMeCache = null;
  authMeRequest = null;
  lastSuccessfulAuthMe = null;
}

/**
 * Dedupliziert parallele /api/auth/me-Aufrufe und hält das Ergebnis kurz im
 * Browser-Speicher. Dadurch lösen Reiterwechsel keinen neuen Auth-Ladezustand aus.
 */
export async function fetchAuthMeState(options: { force?: boolean } = {}): Promise<AuthMeState> {
  if (!isAppOnline()) return { status: "unavailable", user: lastSuccessfulAuthMe };

  const now = Date.now();
  if (!options.force && authMeCache && authMeCache.expiresAt > now) {
    return authMeCache.value;
  }
  if (authMeRequest) return authMeRequest;

  const request = (async () => {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch("/api/auth/me?silent=1", {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      let value: AuthMeState;
      if (response.ok) {
        const payload = (await response.json()) as AuthMeResponse | { authenticated: false };
        if (payload.authenticated === false || !("id" in payload) || !payload.id) {
          lastSuccessfulAuthMe = null;
          value = { status: "unauthenticated", user: null };
        } else {
          const user = payload as AuthMeResponse;
          lastSuccessfulAuthMe = user;
          value = { status: "authenticated", user };
        }
      } else if (response.status === 401) {
        lastSuccessfulAuthMe = null;
        value = { status: "unauthenticated", user: null };
      } else {
        value = { status: "unavailable", user: lastSuccessfulAuthMe };
      }
      authMeCache = {
        value,
        expiresAt: Date.now() + (value.status === "authenticated" ? AUTH_ME_CACHE_MS : AUTH_ME_FAILURE_CACHE_MS),
      };
      return value;
    } catch {
      const value = { status: "unavailable", user: lastSuccessfulAuthMe } as const;
      authMeCache = { value, expiresAt: Date.now() + AUTH_ME_FAILURE_CACHE_MS };
      return value;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  })();

  authMeRequest = request;
  return request.finally(() => {
    if (authMeRequest === request) authMeRequest = null;
  });
}

/**
 * Compatibility helper. A temporary network/server failure keeps the last
 * confirmed user; only an explicit 401 is treated as signed out.
 */
export async function fetchAuthMe(options: { force?: boolean } = {}): Promise<AuthMeResponse | null> {
  const state = await fetchAuthMeState(options);
  return state.status === "unauthenticated" ? null : state.user;
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
