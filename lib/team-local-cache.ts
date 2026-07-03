import type { TeamDetail, TeamSummary } from "@/lib/team-types";

export const TEAM_LIST_CACHE_KEY = "bt.team-list.v1";
const TEAM_DETAIL_PREFIX = "bt.team-detail.v1:";

export function loadCachedTeamList(): TeamSummary[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TEAM_LIST_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TeamSummary[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCachedTeamList(teams: TeamSummary[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEAM_LIST_CACHE_KEY, JSON.stringify(teams));
  } catch {
    /* quota */
  }
}

export function loadCachedTeamDetail(teamId: string): TeamDetail | null {
  if (typeof window === "undefined" || !teamId) return null;
  try {
    const raw = window.localStorage.getItem(`${TEAM_DETAIL_PREFIX}${teamId}`);
    if (!raw) return null;
    return JSON.parse(raw) as TeamDetail;
  } catch {
    return null;
  }
}

export function saveCachedTeamDetail(teamId: string, detail: TeamDetail) {
  if (typeof window === "undefined" || !teamId) return;
  try {
    window.localStorage.setItem(`${TEAM_DETAIL_PREFIX}${teamId}`, JSON.stringify(detail));
  } catch {
    /* quota */
  }
}

export function clearTeamLocalCache() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TEAM_LIST_CACHE_KEY);
  const detailKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(TEAM_DETAIL_PREFIX)) detailKeys.push(key);
  }
  for (const key of detailKeys) {
    window.localStorage.removeItem(key);
  }
}
