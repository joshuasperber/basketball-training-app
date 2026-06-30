/** Nutzerfreundliche deutsche Meldungen für Supabase-Auth-Fehler. */

export function friendlyAuthErrorMessage(raw: string | undefined, context: "signin" | "signup" | "otp" = "signin"): string {
  const msg = (raw ?? "").toLowerCase();

  if (msg.includes("invalid login credentials")) {
    return context === "signin"
      ? "Anmeldung fehlgeschlagen: Passwort falsch oder E-Mail noch nicht bestätigt. Bei „Confirm email“ in Supabase zuerst den Bestätigungslink in der Mail öffnen — oder Confirm email für lokale Tests ausschalten."
      : raw ?? "Anmeldung fehlgeschlagen.";
  }

  if (msg.includes("email not confirmed") || msg.includes("email_not_confirmed")) {
    return "Deine E-Mail ist noch nicht bestätigt. Öffne den Link in der Bestätigungs-Mail oder fordere unten eine neue an.";
  }

  if (msg.includes("user already registered") || msg.includes("already been registered")) {
    return "Diese E-Mail ist schon registriert — nutze „Anmelden“ oder „Passwort vergessen“ in Supabase.";
  }

  if (msg.includes("rate limit")) {
    return "Zu viele Versuche. Bitte etwa 60 Sekunden warten.";
  }

  if (msg.includes("invalid api key")) {
    return "Supabase API-Key ungültig — prüfe NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.";
  }

  return raw ?? "Ein Fehler ist aufgetreten.";
}
