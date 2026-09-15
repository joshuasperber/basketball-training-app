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

const REQUIRED_TABLES = [
  "user_progress",
  "profiles",
  "exercises",
  "teams",
  "team_members",
  "team_invites",
  "opponent_scouting",
  "team_league_data",
  "push_subscriptions",
  "calendar_feed_tokens",
  "team_videos",
] as const;

const PRIVATE_TABLES = [
  "user_progress",
  "profiles",
  "exercises",
  "teams",
  "team_members",
  "team_invites",
  "opponent_scouting",
  "team_league_data",
  "push_subscriptions",
  "calendar_feed_tokens",
  "team_videos",
] as const;

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

async function probeAnonymousRls(
  supabaseUrl: string,
  anonKey: string,
  table: string,
): Promise<SupabaseHealthCheck> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      cache: "no-store",
    });
    const data = await response.json().catch(() => null);
    const accessDenied = response.status === 401 || response.status === 403;
    const protectedAndHealthy = accessDenied || (response.ok && Array.isArray(data) && data.length === 0);
    return {
      id: `rls_anon_${table}`,
      ok: protectedAndHealthy,
      detail: protectedAndHealthy
        ? `RLS public.${table}: anonym geschützt`
        : `RLS public.${table}: HTTP ${response.status}${Array.isArray(data) && data.length ? " · Daten sichtbar" : ""}`,
    };
  } catch (error) {
    return {
      id: `rls_anon_${table}`,
      ok: false,
      detail: error instanceof Error ? error.message : `RLS public.${table}: Netzwerkfehler`,
    };
  }
}

async function probeLeagueDataColumn(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<SupabaseHealthCheck> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/user_progress?select=league_data,readiness_history&limit=0`, {
      method: "HEAD",
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      cache: "no-store",
    });
    return response.ok
      ? { id: "column_league_data", ok: true, detail: "Spalten user_progress.league_data/readiness_history erreichbar" }
      : { id: "column_league_data", ok: false, detail: `Cloud-Sync-Spalten — HTTP ${response.status}` };
  } catch (error) {
    return {
      id: "column_league_data",
      ok: false,
      detail: error instanceof Error ? error.message : "Liga-Cloudspalte nicht erreichbar",
    };
  }
}

async function probeTeamLeagueVersionColumns(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<SupabaseHealthCheck> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/team_league_data?select=version,change_log&limit=0`, {
      method: "HEAD",
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      cache: "no-store",
    });
    return response.ok
      ? { id: "columns_team_league_version", ok: true, detail: "Konfliktschutz team_league_data.version/change_log erreichbar" }
      : { id: "columns_team_league_version", ok: false, detail: `Konfliktschutz der Team-Liga — HTTP ${response.status}` };
  } catch (error) {
    return {
      id: "columns_team_league_version",
      ok: false,
      detail: error instanceof Error ? error.message : "Konfliktschutz der Team-Liga nicht erreichbar",
    };
  }
}

async function probeStorageBucket(
  supabaseUrl: string,
  serviceRoleKey: string,
  bucket: string,
): Promise<SupabaseHealthCheck> {
  try {
    const response = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucket}`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      cache: "no-store",
    });
    return response.ok
      ? { id: `bucket_${bucket.replaceAll("-", "_")}`, ok: true, detail: `Storage-Bucket ${bucket} erreichbar` }
      : { id: `bucket_${bucket.replaceAll("-", "_")}`, ok: false, detail: `Storage-Bucket ${bucket} — HTTP ${response.status}` };
  } catch (error) {
    return {
      id: `bucket_${bucket.replaceAll("-", "_")}`,
      ok: false,
      detail: error instanceof Error ? error.message : "Storage-Bucket nicht erreichbar",
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
  for (const table of PRIVATE_TABLES) {
    checks.push(await probeAnonymousRls(supabaseUrl, anonKey, table));
  }
  checks.push(await probeLeagueDataColumn(supabaseUrl, serviceRoleKey));
  checks.push(await probeTeamLeagueVersionColumns(supabaseUrl, serviceRoleKey));
  checks.push(await probeStorageBucket(supabaseUrl, serviceRoleKey, "game-photos"));
  checks.push(await probeStorageBucket(supabaseUrl, serviceRoleKey, "team-videos"));

  return {
    ok: checks.every((check) => check.ok),
    configured,
    checks,
  };
}
