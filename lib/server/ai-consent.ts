import { parseAiConsentAtFromProfileCache } from "@/lib/ai-consent";
import type { AuthedUser } from "@/lib/server/supabase-admin";
import { supabaseRest } from "@/lib/server/supabase-admin";

type ProgressConsentRow = { profile_cache: string | null };

export async function userHasAiConsent(user: AuthedUser): Promise<boolean> {
  const byUserId = await supabaseRest<ProgressConsentRow[]>(
    `user_progress?user_id=eq.${user.id}&select=profile_cache&limit=1`,
  );
  if (byUserId.ok && byUserId.data?.[0]) {
    if (parseAiConsentAtFromProfileCache(byUserId.data[0].profile_cache)) return true;
  }

  const email = user.email.trim().toLowerCase();
  if (!email) return false;

  const byEmail = await supabaseRest<ProgressConsentRow[]>(
    `user_progress?email=eq.${encodeURIComponent(email)}&select=profile_cache&limit=1`,
  );
  if (byEmail.ok && byEmail.data?.[0]) {
    return Boolean(parseAiConsentAtFromProfileCache(byEmail.data[0].profile_cache));
  }

  return false;
}
