import { getAuthUserEmailById, supabaseRest } from "@/lib/server/supabase-admin";

export type TeamProgressRow = {
  user_id?: string | null;
  email?: string | null;
  sessions?: unknown;
  workout_history?: string | null;
  game_stats?: string | null;
  profile_cache?: string | null;
  profile_username?: string | null;
};

const PROGRESS_SELECT =
  "user_id,email,sessions,workout_history,game_stats,profile_cache,profile_username";

function quoteEmailForPostgrest(email: string) {
  return `"${email.replace(/"/g, "")}"`;
}

/** Lädt Fortschritt für Team-Mitglieder (user_id + E-Mail-Fallback). */
export async function fetchProgressByUserIds(
  userIds: string[],
  emailByUserId?: Record<string, string | null | undefined>,
): Promise<Map<string, TeamProgressRow>> {
  const map = new Map<string, TeamProgressRow>();
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return map;

  const knownEmails = uniqueIds
    .map((id) => emailByUserId?.[id]?.trim().toLowerCase())
    .filter((email): email is string => Boolean(email));

  if (knownEmails.length > 0) {
    const emailList = [...new Set(knownEmails)].map(quoteEmailForPostgrest).join(",");
    const orFilter = `or=(user_id.in.(${uniqueIds.join(",")}),email.in.(${emailList}))`;
    const batch = await supabaseRest<TeamProgressRow[]>(
      `user_progress?${orFilter}&select=${PROGRESS_SELECT}`,
    );
    (batch.data ?? []).forEach((row) => {
      if (row.user_id) map.set(row.user_id, row);
      if (row.email) {
        const matchId = uniqueIds.find(
          (id) => emailByUserId?.[id]?.trim().toLowerCase() === row.email?.trim().toLowerCase(),
        );
        if (matchId) map.set(matchId, row);
      }
    });
  } else {
    const byUserId = await supabaseRest<TeamProgressRow[]>(
      `user_progress?user_id=in.(${uniqueIds.join(",")})&select=${PROGRESS_SELECT}`,
    );
    (byUserId.data ?? []).forEach((row) => {
      if (row.user_id) map.set(row.user_id, row);
    });
  }

  const missingIds = uniqueIds.filter((id) => !map.has(id));
  await Promise.all(
    missingIds.map(async (userId) => {
      const email = emailByUserId?.[userId]?.trim().toLowerCase() ?? (await getAuthUserEmailById(userId));
      if (!email) return;
      const byEmail = await supabaseRest<TeamProgressRow[]>(
        `user_progress?email=eq.${encodeURIComponent(email)}&select=${PROGRESS_SELECT}&limit=1`,
      );
      const row = byEmail.data?.[0];
      if (row) map.set(userId, row);
    }),
  );

  return map;
}
