#!/usr/bin/env node
/**
 * Launch-Check: Env-Vars + Supabase-Tabellen.
 * Nutzung: node scripts/verify-supabase-launch.mjs
 * Optional: BASE_URL=https://deine-app.vercel.app node scripts/verify-supabase-launch.mjs --remote
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function normalizeUrl(raw) {
  if (!raw) return "";
  return raw.replace(/\/+(auth\/v1|rest\/v1)\/?$/i, "").replace(/\/+$/, "");
}

async function probeTable(supabaseUrl, serviceRoleKey, table) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  url.searchParams.set("select", "count");
  url.searchParams.set("limit", "0");
  const response = await fetch(url.toString(), {
    method: "HEAD",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: "count=exact",
    },
  });
  return { table, ok: response.ok && response.status !== 404, status: response.status };
}

async function runDirectChecks() {
  const supabaseUrl = normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const required = ["user_progress", "profiles", "exercises", "teams", "team_members"];

  const issues = [];
  if (!supabaseUrl) issues.push("NEXT_PUBLIC_SUPABASE_URL fehlt");
  if (!anonKey) issues.push("NEXT_PUBLIC_SUPABASE_ANON_KEY fehlt");
  if (!serviceRoleKey) issues.push("SUPABASE_SERVICE_ROLE_KEY fehlt");
  if (issues.length) {
    console.error("❌ Env:\n  - " + issues.join("\n  - "));
    process.exit(1);
  }

  const authRes = await fetch(`${supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  console.log(authRes.ok ? "✅ Auth-API erreichbar" : `❌ Auth-API HTTP ${authRes.status}`);

  let allOk = authRes.ok;
  for (const table of required) {
    const result = await probeTable(supabaseUrl, serviceRoleKey, table);
    const label = result.ok ? "✅" : "❌";
    console.log(`${label} Tabelle public.${table} (HTTP ${result.status})`);
    if (!result.ok) allOk = false;
  }

  if (!allOk) {
    console.error("\n→ SQL in Supabase SQL Editor ausführen: supabase/launch-bootstrap.sql");
    process.exit(1);
  }
  console.log("\n✅ Supabase Launch-Check bestanden.");
}

async function runRemoteCheck(baseUrl) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/health/supabase`, {
    cache: "no-store",
  });
  const json = await response.json();
  for (const check of json.checks ?? []) {
    console.log(`${check.ok ? "✅" : "❌"} ${check.id}: ${check.detail}`);
  }
  if (!response.ok || !json.ok) {
    process.exit(1);
  }
  console.log("\n✅ Remote Health-Check bestanden.");
}

loadEnvLocal();
const remote = process.argv.includes("--remote");
const baseUrl = process.env.BASE_URL ?? "http://localhost:3001";

if (remote) {
  await runRemoteCheck(baseUrl);
} else {
  await runDirectChecks();
}
