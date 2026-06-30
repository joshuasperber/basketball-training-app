import type { NextRequest } from "next/server";
import { normalizeSupabaseProjectUrl } from "@/lib/supabase-env";

const supabaseUrl = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type AuthedUser = { id: string; email: string };

export async function getRequestUser(request: NextRequest): Promise<AuthedUser | null> {
  const accessToken = request.cookies.get("sb-access-token")?.value;
  if (!accessToken || !supabaseUrl || !supabaseAnonKey) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) return null;
  const user = (await response.json()) as { id?: string; email?: string };
  const id = user.id?.trim();
  const email = user.email?.trim().toLowerCase();
  if (!id || !email) return null;
  return { id, email };
}

export function getSupabaseServiceConfig() {
  const url = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

export async function getAuthUserEmailById(userId: string): Promise<string | null> {
  const config = getSupabaseServiceConfig();
  if (!config || !userId.trim()) return null;

  const response = await fetch(`${config.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) return null;
  const user = (await response.json()) as { email?: string };
  return user.email?.trim().toLowerCase() ?? null;
}

export async function supabaseRest<T>(
  path: string,
  init?: RequestInit & { prefer?: string },
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const config = getSupabaseServiceConfig();
  if (!config) {
    return { ok: false, status: 503, data: null, error: "SUPABASE_SERVICE_ROLE_KEY fehlt" };
  }

  const headers: Record<string, string> = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.prefer) headers.Prefer = init.prefer;

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return { ok: false, status: response.status, data: null, error: errorText.slice(0, 400) };
  }

  const text = await response.text();
  if (!text) return { ok: true, status: response.status, data: null };
  return { ok: true, status: response.status, data: JSON.parse(text) as T };
}
