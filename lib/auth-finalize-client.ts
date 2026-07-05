import { ACTIVE_AUTH_EMAIL_KEY } from "@/lib/auth-session-align";
import { clearLocalUserProgress, SYNC_USER_ID_KEY } from "@/lib/clear-local-user-data";
import { ensureInitialCloudSync } from "@/lib/progress-sync";

const LAST_LOGIN_EMAIL_KEY = "bt.last-login-email.v1";

export type AuthSessionPayload = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

function alignLocalStorage(email: string, userId: string | undefined, options?: { freshAccount?: boolean }) {
  const normalized = email.trim().toLowerCase();
  const previous = window.localStorage.getItem(ACTIVE_AUTH_EMAIL_KEY)?.trim().toLowerCase();

  if (options?.freshAccount || (previous && normalized && previous !== normalized)) {
    clearLocalUserProgress();
  }

  if (normalized) {
    window.localStorage.setItem(LAST_LOGIN_EMAIL_KEY, normalized);
    window.localStorage.setItem(ACTIVE_AUTH_EMAIL_KEY, normalized);
  }
  if (userId) {
    window.localStorage.setItem(SYNC_USER_ID_KEY, userId);
  }
}

async function restoreCloudProgressAfterAuth() {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    await ensureInitialCloudSync();
  } catch {
    /* Cloud optional — App startet trotzdem mit lokalen Daten */
  }
}

function redirectAfterAuth(destination: string) {
  window.location.assign(destination);
}

/** Session-Cookies wurden bereits serverseitig gesetzt (z. B. /api/auth/exchange). */
export async function alignLocalAuthAfterServerSession(options: {
  nextPath?: string | null;
  freshAccount?: boolean;
  emailHint?: string;
  userId?: string;
  skipCloudRestore?: boolean;
}): Promise<string | null> {
  let email = options.emailHint?.trim().toLowerCase() ?? "";
  let userId = options.userId;

  if (!email) {
    const meRes = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
    if (meRes.ok) {
      const me = (await meRes.json()) as { email?: string; id?: string };
      email = me.email?.trim().toLowerCase() ?? "";
      userId = me.id ?? userId;
    }
  }

  if (!email) {
    if (typeof navigator !== "undefined" && !navigator.onLine && options.emailHint) {
      email = options.emailHint.trim().toLowerCase();
    } else {
      return "Anmeldung konnte nicht abgeschlossen werden. Bitte erneut einloggen.";
    }
  }

  alignLocalStorage(email, userId, { freshAccount: options.freshAccount });

  if (!options.skipCloudRestore) {
    await restoreCloudProgressAfterAuth();
  }

  const destination = options.nextPath && options.nextPath.startsWith("/") ? options.nextPath : "/dashboard";
  redirectAfterAuth(destination);
  return null;
}

export async function finalizeClientAuthSession(
  session: AuthSessionPayload,
  options?: {
    nextPath?: string | null;
    freshAccount?: boolean;
    emailHint?: string;
    skipCloudRestore?: boolean;
  },
): Promise<string | null> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });

  const sessionRes = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
    }),
  });

  if (!sessionRes.ok) {
    const detail = (await sessionRes.json().catch(() => null)) as { error?: string } | null;
    if (detail?.error === "invalid_payload") {
      return "Anmeldung unvollständig — bitte erneut versuchen.";
    }
    return "Session konnte nicht gespeichert werden. Bitte versuche es erneut.";
  }

  const payload = (await sessionRes.json()) as {
    user?: { id?: string; email?: string } | null;
  };

  const email = payload.user?.email ?? options?.emailHint ?? "";
  alignLocalStorage(email, payload.user?.id, { freshAccount: options?.freshAccount });

  if (options?.nextPath === null) return null;

  if (!options?.skipCloudRestore) {
    await restoreCloudProgressAfterAuth();
  }

  const destination = options?.nextPath && options.nextPath.startsWith("/") ? options.nextPath : "/dashboard";
  redirectAfterAuth(destination);
  return null;
}
