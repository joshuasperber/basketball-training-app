/** Verhindert, dass Trainingsdaten von Account A an Account B in der Cloud landen (gleicher Browser / Inkognito-Fenster). */

export const ACTIVE_AUTH_EMAIL_KEY = "bt.active-auth-email.v1";

export type AuthMeResponse = {
  id: string;
  email: string;
  cloud: { sessionCount: number; workouts14d: number };
  supabaseConfigured: boolean;
};

export async function fetchAuthMe(): Promise<AuthMeResponse | null> {
  const response = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) return null;
  return (await response.json()) as AuthMeResponse;
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
