/** Redirect-Ziel für Supabase Passwort-Reset — Tokens landen direkt auf der Reset-Seite. */
export function buildPasswordResetRedirectUrl(email?: string) {
  if (typeof window === "undefined") return undefined;
  const url = new URL(`${window.location.origin}/auth/reset-password`);
  const normalizedEmail = email?.trim().toLowerCase();
  if (normalizedEmail) {
    url.searchParams.set("email", normalizedEmail);
  }
  return url.toString();
}

/** @deprecated Nur noch für Signup/E-Mail-Bestätigung — Reset nutzt buildPasswordResetRedirectUrl. */
export function buildAuthConfirmUrl(nextPath = "/dashboard", email?: string) {
  if (typeof window === "undefined") return undefined;
  const next = nextPath.startsWith("/") ? nextPath : "/dashboard";
  const url = new URL(`${window.location.origin}/auth/confirm`);
  url.searchParams.set("next", next);
  const normalizedEmail = email?.trim().toLowerCase();
  if (normalizedEmail) {
    url.searchParams.set("email", normalizedEmail);
  }
  return url.toString();
}

export function buildPasswordResetConfirmUrl(email?: string) {
  return buildPasswordResetRedirectUrl(email);
}
