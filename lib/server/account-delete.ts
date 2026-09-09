import { getSupabaseServiceConfig, supabaseRest } from "@/lib/server/supabase-admin";

const GAME_PHOTOS_BUCKET = "game-photos";

type StorageListRow = { name: string };

export async function deleteUserGamePhotos(userId: string): Promise<boolean> {
  const config = getSupabaseServiceConfig();
  if (!config) return false;

  const prefix = `${userId}/`;
  // Nach jedem Löschlauf wieder ab Offset 0 lesen. So überspringt die
  // Pagination keine Einträge, deren Index durch das Löschen nach vorne rückt.
  for (let batch = 0; batch < 100; batch += 1) {
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
    if (listResponse.status === 404) return true;
    if (!listResponse.ok) return false;
    const page = (await listResponse.json()) as StorageListRow[];
    if (!Array.isArray(page)) return false;
    if (page.length === 0) return true;

    const paths = page.map((row) => (row.name.startsWith(prefix) ? row.name : `${prefix}${row.name}`));
    const deleteResponse = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(GAME_PHOTOS_BUCKET)}`, {
      method: "DELETE",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: paths }),
      cache: "no-store",
    });
    if (!deleteResponse.ok) return false;
    if (page.length < 1000) return true;
  }
  return false;
}

/** Überträgt gemeinsame Teams bevorzugt an Captains, bevor ein Owner gelöscht wird. */
export async function transferOrDeleteTeamsOwnedByUser(userId: string): Promise<boolean> {
  const owned = await supabaseRest<Array<{ team_id: string }>>(
    `team_members?user_id=eq.${userId}&role=eq.owner&select=team_id`,
  );
  if (!owned.ok) return false;
  if (!owned.data?.length) return true;

  for (const row of owned.data) {
    const successors = await supabaseRest<Array<{ user_id: string; role: string; joined_at: string }>>(
      `team_members?team_id=eq.${row.team_id}&user_id=neq.${userId}&select=user_id,role,joined_at&order=joined_at.asc`,
    );
    if (!successors.ok) return false;
    const successor = [
      ...(successors.data?.filter((member) => member.role === "captain") ?? []),
      ...(successors.data?.filter((member) => member.role !== "captain") ?? []),
    ][0];
    if (successor) {
      const transfer = await supabaseRest(
        `team_members?team_id=eq.${row.team_id}&user_id=eq.${successor.user_id}`,
        { method: "PATCH", body: JSON.stringify({ role: "owner" }) },
      );
      if (!transfer.ok) return false;
    } else {
      const remove = await supabaseRest(`teams?id=eq.${row.team_id}`, { method: "DELETE" });
      if (!remove.ok) return false;
    }
  }
  return true;
}

export async function deleteUserProgressRows(userId: string, email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const byId = await supabaseRest(`user_progress?user_id=eq.${userId}`, { method: "DELETE" });
  if (!byId.ok) return false;
  if (normalizedEmail) {
    const byEmail = await supabaseRest(`user_progress?email=eq.${encodeURIComponent(normalizedEmail)}`, { method: "DELETE" });
    if (!byEmail.ok) return false;
  }
  return true;
}
