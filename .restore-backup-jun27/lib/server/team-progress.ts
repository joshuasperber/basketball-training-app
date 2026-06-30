import type { GameStatEntry } from "@/lib/game-stats";
import { computeFormScore } from "@/lib/form-score";
import { normalizeOpponentStyles } from "@/lib/opponent-styles";
import type { WorkoutSessionEntry } from "@/lib/session-storage";
import type { TeamMemberView } from "@/lib/team-types";
import { parseWorkoutSessionsFromProgress } from "@/lib/server/parse-user-progress";

type UserProgressRow = {
  user_id?: string | null;
  email?: string | null;
  sessions?: unknown;
  workout_history?: string | null;
  game_stats?: string | null;
  profile_cache?: string | null;
  profile_username?: string | null;
};

function parseGameStats(raw: string | null | undefined): GameStatEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as GameStatEntry[];
    return Array.isArray(parsed)
      ? parsed.map((entry) => ({ ...entry, opponentStyles: normalizeOpponentStyles(entry.opponentStyles) }))
      : [];
  } catch {
    return [];
  }
}

function parseProfile(raw: string | null | undefined) {
  if (!raw) return { position: null as string | null, playStyle: null as string | null, displayName: null as string | null };
  try {
    const parsed = JSON.parse(raw) as {
      profile?: { favorite_position?: string | null; username?: string | null; full_name?: string | null };
      playStyle?: string;
    };
    return {
      position: parsed.profile?.favorite_position ?? null,
      playStyle: parsed.playStyle ?? null,
      displayName: parsed.profile?.username?.trim() || parsed.profile?.full_name?.trim() || null,
    };
  } catch {
    return { position: null, playStyle: null, displayName: null };
  }
}

function recentCount<T extends { dateISO?: string; date?: string }>(items: T[], days: number) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);
  return items.filter((item) => {
    const raw = item.dateISO ?? item.date;
    if (!raw) return false;
    return new Date(raw) >= cutoff;
  }).length;
}

export function buildMemberViewFromProgress(
  member: {
    id: string;
    user_id: string;
    role: TeamMemberView["role"];
    display_name: string | null;
    position: string | null;
    play_style: string | null;
    share_level: TeamMemberView["shareLevel"];
  },
  progress: UserProgressRow | null,
): TeamMemberView {
  const sessions = parseWorkoutSessionsFromProgress(progress?.sessions, progress?.workout_history);
  const games = parseGameStats(progress?.game_stats);
  const profile = parseProfile(progress?.profile_cache);
  const form = computeFormScore({ sessions, games });

  return {
    id: member.id,
    userId: member.user_id,
    role: member.role,
    displayName: member.display_name ?? profile.displayName ?? progress?.profile_username ?? "Spieler",
    position: member.position ?? profile.position,
    playStyle: member.play_style ?? profile.playStyle,
    shareLevel: member.share_level,
    form,
    recentGames: recentCount(games.map((game) => ({ date: game.date })), 14),
    recentWorkouts: recentCount(sessions.map((session) => ({ dateISO: session.dateISO })), 14),
  };
}

export function createInviteToken() {
  return `bt-${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}
