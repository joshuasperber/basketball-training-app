import { getSupabaseServiceConfig } from "@/lib/server/supabase-admin";

type AdminUser = {
  id?: string;
  email?: string;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
};

export async function findAdminUserByEmail(email: string): Promise<AdminUser | null> {
  const config = getSupabaseServiceConfig();
  const normalized = email.trim().toLowerCase();
  if (!config || !normalized) return null;

  const response = await fetch(
    `${config.url}/auth/v1/admin/users?email=${encodeURIComponent(normalized)}`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) return null;
  const payload = (await response.json()) as { users?: AdminUser[] } | AdminUser[];
  const users = Array.isArray(payload) ? payload : (payload.users ?? []);
  return users[0] ?? null;
}

export async function confirmUserEmail(userId: string): Promise<boolean> {
  const config = getSupabaseServiceConfig();
  if (!config || !userId.trim()) return false;

  const response = await fetch(`${config.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email_confirm: true }),
    cache: "no-store",
  });

  return response.ok;
}

export async function ensureEmailConfirmed(email: string): Promise<boolean> {
  const user = await findAdminUserByEmail(email);
  if (!user?.id) return false;
  if (user.email_confirmed_at || user.confirmed_at) return true;
  return confirmUserEmail(user.id);
}

export async function createConfirmedUser(email: string, password: string): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const config = getSupabaseServiceConfig();
  const normalized = email.trim().toLowerCase();
  if (!config) {
    return { ok: false, error: "server_auth_unconfigured" };
  }

  const response = await fetch(`${config.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: normalized,
      password,
      email_confirm: true,
    }),
    cache: "no-store",
  });

  if (response.ok) {
    const user = (await response.json()) as { id?: string };
    if (!user.id) return { ok: false, error: "signup_failed" };
    return { ok: true, userId: user.id };
  }

  const body = (await response.json().catch(() => null)) as { msg?: string; message?: string; error_code?: string } | null;
  const message = (body?.msg ?? body?.message ?? "").toLowerCase();
  if (message.includes("already") || body?.error_code === "email_exists") {
    const ensured = await ensureEmailConfirmed(normalized);
    if (!ensured) return { ok: false, error: "email_exists" };
    const existing = await findAdminUserByEmail(normalized);
    if (!existing?.id) return { ok: false, error: "email_exists" };
    return { ok: true, userId: existing.id };
  }

  return { ok: false, error: body?.msg ?? body?.message ?? "signup_failed" };
}
