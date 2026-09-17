import { appendFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";

const mode = process.argv[2];
const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const githubEnv = process.env.GITHUB_ENV;

function appendGithubEnv(name, value) {
  if (!githubEnv) throw new Error("GITHUB_ENV fehlt – dieses Script ist für GitHub Actions gedacht.");
  appendFileSync(githubEnv, `${name}=${value}\n`, "utf8");
}

function requireAdminConfig() {
  if (!projectUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY werden benötigt.");
  }
}

async function createUser() {
  const configuredEmail = process.env.E2E_EMAIL?.trim();
  const configuredPassword = process.env.E2E_PASSWORD;
  if (configuredEmail && configuredPassword) {
    appendGithubEnv("E2E_EMAIL", configuredEmail);
    appendGithubEnv("E2E_PASSWORD", configuredPassword);
    console.log("✅ Vorhandener E2E-Testaccount wird verwendet.");
    return;
  }

  requireAdminConfig();
  const email = `e2e-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
  const password = `E2e!${randomBytes(24).toString("base64url")}`;
  const response = await fetch(`${projectUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { purpose: "ci-e2e", disposable: true },
    }),
  });
  const payload = await response.json().catch(() => null);
  const id = payload?.id;
  if (!response.ok || typeof id !== "string") {
    throw new Error(`E2E-Testaccount konnte nicht erstellt werden (HTTP ${response.status}).`);
  }

  appendGithubEnv("E2E_EMAIL", email);
  appendGithubEnv("E2E_PASSWORD", password);
  appendGithubEnv("E2E_USER_ID", id);
  console.log("✅ Kurzlebiger bestätigter E2E-Testaccount erstellt.");
}

async function deleteUser() {
  const id = process.env.E2E_USER_ID?.trim();
  if (!id) {
    console.log("ℹ️ Kein kurzlebiger E2E-Testaccount zu entfernen.");
    return;
  }
  requireAdminConfig();
  const response = await fetch(`${projectUrl}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`E2E-Testaccount konnte nicht entfernt werden (HTTP ${response.status}).`);
  }
  console.log("✅ Kurzlebiger E2E-Testaccount entfernt.");
}

if (mode === "create") await createUser();
else if (mode === "delete") await deleteUser();
else throw new Error("Aufruf: node scripts/manage-e2e-user.mjs create|delete");
