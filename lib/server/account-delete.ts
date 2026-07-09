import { getSupabaseServiceConfig, supabaseRest } from "@/lib/server/supabase-admin";

const GAME_PHOTOS_BUCKET = "game-photos";

type StorageListRow = { name: string };

export async function deleteUserGamePhotos(userId: string): Promise<void> {
  const config = getSupabaseServiceConfig();
  if (!config) return;

  const prefix = `${userId}/`;
  const listResponse = await fetch(`${config.url}/storage/v1/object/list/${encodeURIComponent(GAME_PHOTOS_BUCKET)}`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
    cache: "no-store",
  });

  if (!listResponse.ok) return;

  const rows = (await listResponse.json()) as StorageListRow[];
  if (!Array.isArray(rows) || rows.length === 0) return;

  const paths = rows.map((row) => (row.name.startsWith(prefix) ? row.name : `${prefix}${row.name}`));
  if (paths.length === 0) return;

  await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(GAME_PHOTOS_BUCKET)}`, {
    method: "DELETE",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes: paths }),
    cache: "no-store",
  });
}

export async function deleteTeamsOwnedByUser(userId: string): Promise<void> {
  const owned = await supabaseRest<Array<{ team_id: string }>>(
    `team_members?user_id=eq.${userId}&role=eq.owner&select=team_id`,
  );
  if (!owned.ok || !owned.data?.length) return;

  for (const row of owned.data) {
    await supabaseRest(`teams?id=eq.${row.team_id}`, { method: "DELETE" });
  }
}

export async function deleteUserProgressRows(userId: string, email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  await supabaseRest(`user_progress?user_id=eq.${userId}`, { method: "DELETE" });
  if (normalizedEmail) {
    await supabaseRest(`user_progress?email=eq.${encodeURIComponent(normalizedEmail)}`, { method: "DELETE" });
  }
}
