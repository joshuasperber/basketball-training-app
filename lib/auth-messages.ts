/** Nutzerfreundliche deutsche Meldungen für Supabase-Auth-Fehler. */

export function friendlyAuthErrorMessage(raw: string | undefined, context: "signin" | "signup" | "otp" = "signin"): string {
  const msg = (raw ?? "").toLowerCase();

  if (
    msg.includes("invalid login credentials") ||
    msg.includes("invalid_credentials") ||
    msg.includes("sign_in_failed")
  ) {
    return context === "signin"
      ? "Passwort oder E-Mail-Adresse sind falsch."
      : raw ?? "Anmeldung fehlgeschlagen.";
  }

  if (msg.includes("email not confirmed") || msg.includes("email_not_confirmed")) {
    return "Deine E-Mail-Adresse ist noch nicht bestätigt. Gib den Code aus der Bestätigungs-E-Mail ein oder fordere einen neuen Code an.";
  }

  if (msg.includes("invalid email") || msg.includes("unable to validate email")) {
    return "Bitte gib eine gültige E-Mail-Adresse ein.";
  }

  if (context === "signup" && (msg.includes("password") || msg.includes("weak"))) {
    return "Das Passwort erfüllt die Sicherheitsanforderungen noch nicht. Verwende mindestens 6 Zeichen.";
  }

  if (msg.includes("user already registered") || msg.includes("already been registered")) {
    return "Diese E-Mail ist schon registriert — nutze „Anmelden“ oder „Passwort vergessen?“.";
  }

  if (msg.includes("rate limit")) {
    return "Zu viele Versuche. Bitte etwa 60 Sekunden warten.";
  }

  if (msg.includes("invalid api key")) {
    return "Supabase API-Key ungültig — prüfe NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.";
  }

  return raw ?? "Ein Fehler ist aufgetreten.";
}
