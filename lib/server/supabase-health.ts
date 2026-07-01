import { normalizeSupabaseProjectUrl } from "@/lib/supabase-env";

export type SupabaseHealthCheck = {
  id: string;
  ok: boolean;
  detail: string;
};

export type SupabaseLaunchHealth = {
  ok: boolean;
  configured: boolean;
  checks: SupabaseHealthCheck[];
};

const REQUIRED_TABLES = ["user_progress", "profiles", "exercises", "teams", "team_members"] as const;

function envCheck(id: string, present: boolean, label: string): SupabaseHealthCheck {
  return {
    id,
    ok: present,
    detail: present ? `${label} gesetzt` : `${label} fehlt`,
  };
}

async function probeTable(
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string,
): Promise<SupabaseHealthCheck> {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  url.searchParams.set("select", "count");
  url.searchParams.set("limit", "0");

  try {
    const response = await fetch(url.toString(), {
      method: "HEAD",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "count=exact",
      },
      cache: "no-store",
    });

    if (response.status === 404 || response.status === 406) {
      return { id: `table_${table}`, ok: false, detail: `Tabelle public.${table} nicht gefunden` };
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        id: `table_${table}`,
        ok: false,
        detail: `Tabelle public.${table} — HTTP ${response.status}${body ? `: ${body.slice(0, 120)}` : ""}`,
      };
    }
    return { id: `table_${table}`, ok: true, detail: `Tabelle public.${table} erreichbar` };
  } catch (error) {
    return {
      id: `table_${table}`,
      ok: false,
      detail: `Tabelle public.${table} — ${error instanceof Error ? error.message : "Netzwerkfehler"}`,
    };
  }
}

async function probeAuth(supabaseUrl: string, anonKey: string): Promise<SupabaseHealthCheck> {
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return { id: "auth_api", ok: false, detail: `Auth-API HTTP ${response.status}` };
    }
    return { id: "auth_api", ok: true, detail: "Auth-API erreichbar" };
  } catch (error) {
    return {
      id: "auth_api",
      ok: false,
      detail: error instanceof Error ? error.message : "Auth-API nicht erreichbar",
    };
  }
}

/** Prüft Env-Vars, Auth-API und Pflicht-Tabellen für Launch. */
export async function runSupabaseLaunchHealthChecks(): Promise<SupabaseLaunchHealth> {
  const supabaseUrl = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  const checks: SupabaseHealthCheck[] = [
    envCheck("env_url", Boolean(supabaseUrl), "NEXT_PUBLIC_SUPABASE_URL"),
    envCheck("env_anon", Boolean(anonKey), "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    envCheck("env_service", Boolean(serviceRoleKey), "SUPABASE_SERVICE_ROLE_KEY"),
  ];

  const configured = checks.every((check) => check.ok);
  if (!configured || !supabaseUrl) {
    return { ok: false, configured, checks };
  }

  checks.push(await probeAuth(supabaseUrl, anonKey));

  for (const table of REQUIRED_TABLES) {
    checks.push(await probeTable(supabaseUrl, serviceRoleKey, table));
  }

  return {
    ok: checks.every((check) => check.ok),
    configured,
    checks,
  };
}
