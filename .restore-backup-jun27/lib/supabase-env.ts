/** Hilft, häufige .env.local-Fehler (vertauschte Keys, falsche URL) früh zu erkennen. */

function stripEnvQuotes(value: string) {
  return value.trim().replace(/^["']|["']$/g, "");
}

/** Nur die Projekt-Basis-URL — ohne /rest/v1 oder /auth/v1. */
export function normalizeSupabaseProjectUrl(raw: string | undefined): string {
  let url = stripEnvQuotes(raw ?? "");
  if (!url) return "";

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  url = url.replace(/\/+$/, "");
  url = url.replace(/\/auth\/v1$/i, "");
  url = url.replace(/\/rest\/v1$/i, "");

  return url;
}

export function getSupabasePublicConfig() {
  const url = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = stripEnvQuotes(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
  const issues: string[] = [];

  if (!url) {
    issues.push("NEXT_PUBLIC_SUPABASE_URL fehlt.");
  } else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    issues.push(
      `NEXT_PUBLIC_SUPABASE_URL sieht falsch aus: "${url}". Erwartet: https://DEIN-PROJEKT-REF.supabase.co (ohne /rest/v1 oder /auth/v1).`,
    );
  }

  if (!anonKey) {
    issues.push("NEXT_PUBLIC_SUPABASE_ANON_KEY fehlt.");
  } else if (anonKey.startsWith("sb_secret_")) {
    issues.push(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY enthält den geheimen Key (sb_secret_…). Trage dort sb_publishable_… oder den anon JWT (eyJ…) ein.",
    );
  } else if (!anonKey.startsWith("eyJ") && !anonKey.startsWith("sb_publishable_")) {
    issues.push("NEXT_PUBLIC_SUPABASE_ANON_KEY: unbekanntes Format — nutze anon JWT (eyJ…) aus dem Dashboard.");
  }

  return {
    url,
    anonKey,
    issues,
    isValid: issues.length === 0 && Boolean(url && anonKey),
  };
}

export function getSupabaseServiceRoleKey() {
  const key = stripEnvQuotes(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  if (!key) return { key: "", issue: "SUPABASE_SERVICE_ROLE_KEY fehlt." };
  if (key.startsWith("sb_publishable_")) {
    return {
      key: "",
      issue: "SUPABASE_SERVICE_ROLE_KEY enthält den Publishable-Key — nutze sb_secret_… oder service_role JWT.",
    };
  }
  return { key, issue: null as string | null };
}
