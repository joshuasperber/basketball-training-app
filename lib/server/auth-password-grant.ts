import { ensureEmailConfirmed } from "@/lib/server/auth-admin";
import type { ExchangedSession } from "@/lib/server/auth-token-exchange";
import { normalizeSupabaseProjectUrl } from "@/lib/supabase-env";

const supabaseUrl = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function parseAuthError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const record = body as { msg?: string; error_description?: string; message?: string; error?: string };
  return record.error_description ?? record.msg ?? record.message ?? record.error ?? fallback;
}

export async function passwordGrant(
  email: string,
  password: string,
  options?: { autoConfirm?: boolean },
): Promise<{ session: ExchangedSession; user: { id: string; email: string } } | { error: string }> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: "server_auth_unconfigured" };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const attempt = async (): Promise<{ session: ExchangedSession; user: { id: string; email: string } } | { error: string }> => {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: normalizedEmail, password }),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return { error: parseAuthError(body, "Anmeldung fehlgeschlagen") };
    }

    const payload = (await response.json()) as ExchangedSession & { user?: { id?: string; email?: string } };
    if (!payload.access_token || !payload.refresh_token) {
      return { error: "Keine Session erhalten." };
    }

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${payload.access_token}`,
      },
      cache: "no-store",
    });

    if (!userResponse.ok) {
      return { error: "Benutzer konnte nicht geladen werden." };
    }

    const user = (await userResponse.json()) as { id?: string; email?: string };
    const id = user.id?.trim();
    const resolvedEmail = user.email?.trim().toLowerCase() ?? normalizedEmail;
    if (!id || !resolvedEmail) {
      return { error: "Benutzer konnte nicht geladen werden." };
    }

    return {
      session: {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        expires_in: payload.expires_in ?? 3600,
      },
      user: { id, email: resolvedEmail },
    };
  };

  const first = await attempt();
  if (!("error" in first)) return first;

  const lower = first.error.toLowerCase();
  const needsConfirm =
    options?.autoConfirm !== false &&
    (lower.includes("email not confirmed") || lower.includes("email_not_confirmed") || lower.includes("not confirmed"));

  if (!needsConfirm) return first;

  const confirmed = await ensureEmailConfirmed(normalizedEmail);
  if (!confirmed) return first;

  return attempt();
}
