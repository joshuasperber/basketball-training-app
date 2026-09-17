import type { OpponentStyleTag } from "@/lib/opponent-styles";
import { normalizeOpponentStyles } from "@/lib/opponent-styles";
import { addManualGameForDate } from "@/lib/plan-day-actions";
import { findGameStatByDateAndContext, findGameStatByLeagueGameId, upsertGameStat } from "@/lib/game-stats";
import { markLocalProgressDirty } from "@/lib/sync-dirty";

export const LEAGUE_STORAGE_KEY = "bt.league.v1";
export const LEAGUE_UPDATED_EVENT = "bt:league-updated";
export const LEAGUE_OWN_TEAM_ID = "league-own-team";
export const LEAGUE_DEFAULT_ID = "league-default";

export type LeagueGameKind = "game" | "game_training";
export type LeagueGameStatus = "scheduled" | "live" | "postponed" | "cancelled" | "final";
export type LeagueAttendanceStatus = "pending" | "yes" | "maybe" | "no";

export type LeagueAttendanceResponse = {
  playerId: string;
  status: LeagueAttendanceStatus;
  expectedStarter?: boolean;
  note?: string;
};

export type LeagueLiveEvent = {
  id: string;
  type: "score" | "foul";
  teamId: string;
  playerId?: string;
  value: number;
  quarter: number;
  occurredAt: string;
};

export type LeagueLiveState = {
  quarter: number;
  clockSeconds: number;
  runningSince?: number;
  events: LeagueLiveEvent[];
};

export type LeagueDefinition = {
  id: string;
  name: string;
  region?: string;
  level?: string;
  notes?: string;
  createdAt: string;
};

export type LeagueSeason = {
  id: string;
  /** Optional for legacy in-memory fixtures; persisted data is normalized. */
  leagueId?: string;
  name: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
  createdAt: string;
};

export type LeagueOwnTeam = {
  id: string;
  name: string;
  /** Team-ID from the cloud-backed Team area. */
  sourceTeamId?: string;
  bestPlayerIds: string[];
};

export type LeagueOpponent = {
  id: string;
  /** Legacy-Zuordnung für bestehende lokale Daten. */
  seasonId?: string;
  seasonIds: string[];
  name: string;
  strengths: string;
  weaknesses: string;
  defenseNotes: string;
  opponentStyles: OpponentStyleTag[];
  bestPlayerIds: string[];
  notes?: string;
};

export type LeaguePlayer = {
  id: string;
  teamId: string;
  name: string;
  jerseyNumber?: string;
  position?: string;
  notes?: string;
};

export type LeaguePlayerStatLine = {
  playerId: string;
  minutes: number | null;
  points: number | null;
  assists: number | null;
  rebounds: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  fouls: number | null;
  threePointersMade: number | null;
};

export type LeagueScheduleEntry = {
  id: string;
  seasonId: string;
  date: string;
  startTime?: string;
  /** Legacy-Gegnerfeld für bereits gespeicherte Spiele. */
  opponentId?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  kind: LeagueGameKind;
  status?: LeagueGameStatus;
  homeAway?: "home" | "away" | "neutral";
  homeScore?: number | null;
  awayScore?: number | null;
  playerStats?: LeaguePlayerStatLine[];
  bestPlayerId?: string;
  awards?: string;
  notes?: string;
  venueName?: string;
  venueAddress?: string;
  meetingTime?: string;
  /** Lokale Wandzeit im Format YYYY-MM-DDTHH:mm. */
  attendanceDeadline?: string;
  travelMinutes?: number | null;
  attendance?: LeagueAttendanceResponse[];
  liveState?: LeagueLiveState;
  syncedAt?: string;
};

export type LeagueBundle = {
  activeLeagueId: string | null;
  activeSeasonId: string | null;
  leagues: LeagueDefinition[];
  seasons: LeagueSeason[];
  ownTeam: LeagueOwnTeam;
  opponents: LeagueOpponent[];
  players: LeaguePlayer[];
  schedule: LeagueScheduleEntry[];
};

export type LeagueTeamOption = {
  id: string;
  name: string;
  kind: "own" | "opponent";
};

export type LeagueStanding = {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  difference: number;
  tablePoints: number;
  headToHeadPoints: number;
  headToHeadDifference: number;
  position: number;
};

export type LeagueStandingZone = "playoffs" | "stay" | "relegation" | "outside";

export type LeaguePlayerSeasonSummary = {
  playerId: string;
  appearances: number;
  minutes: number;
  points: number;
  assists: number;
  rebounds: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  threePointersMade: number;
  mvpAwards: number;
};

export function createEmptyLeagueBundle(): LeagueBundle {
  return {
    activeLeagueId: null,
    activeSeasonId: null,
    leagues: [],
    seasons: [],
    ownTeam: { id: LEAGUE_OWN_TEAM_ID, name: "Mein Team", bestPlayerIds: [] },
    opponents: [],
    players: [],
    schedule: [],
  };
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function normalizeLeagueStartTime(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(trimmed) ? trimmed : undefined;
}

function normalizeGameStatus(value: unknown, hasScore: boolean): LeagueGameStatus {
  if (value === "scheduled" || value === "live" || value === "postponed" || value === "cancelled" || value === "final") return value;
  return hasScore ? "final" : "scheduled";
}

function normalizeLiveState(value: unknown): LeagueLiveState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const state = value as Partial<LeagueLiveState>;
  const quarter = Number(state.quarter);
  const clockSeconds = Number(state.clockSeconds);
  return {
    quarter: Number.isInteger(quarter) && quarter >= 1 ? Math.min(quarter, 12) : 1,
    clockSeconds: Number.isFinite(clockSeconds) ? Math.max(0, Math.min(600, Math.round(clockSeconds))) : 600,
    runningSince: typeof state.runningSince === "number" && Number.isFinite(state.runningSince) ? state.runningSince : undefined,
    events: Array.isArray(state.events)
      ? state.events.filter((event): event is LeagueLiveEvent => Boolean(
          event && typeof event === "object" && typeof event.id === "string" &&
          (event.type === "score" || event.type === "foul") && typeof event.teamId === "string",
        )).slice(-500)
      : [],
  };
}

function normalizeAttendance(value: unknown): LeagueAttendanceResponse[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<LeagueAttendanceResponse>;
    if (typeof item.playerId !== "string") return [];
    const status: LeagueAttendanceStatus =
      item.status === "yes" || item.status === "maybe" || item.status === "no" ? item.status : "pending";
    return [{
      playerId: item.playerId,
      status,
      expectedStarter: Boolean(item.expectedStarter),
      note: typeof item.note === "string" ? item.note : undefined,
    }];
  });
}

/** Migriert auch den bisherigen Saisonstand ohne Team-/Spielerfelder. */
export function normalizeLeagueBundle(value: unknown): LeagueBundle {
  const empty = createEmptyLeagueBundle();
  if (!value || typeof value !== "object") return empty;
  const parsed = value as Partial<LeagueBundle>;
  const opponents = Array.isArray(parsed.opponents)
    ? parsed.opponents.map((raw) => {
        const opponent = raw as Partial<LeagueOpponent>;
        const legacySeasonId = typeof opponent.seasonId === "string" ? opponent.seasonId : undefined;
        const seasonIds = stringArray(opponent.seasonIds);
        if (legacySeasonId && !seasonIds.includes(legacySeasonId)) seasonIds.push(legacySeasonId);
        return {
          id: typeof opponent.id === "string" ? opponent.id : createId("opponent"),
          seasonId: legacySeasonId,
          seasonIds,
          name: typeof opponent.name === "string" ? opponent.name : "Unbenannter Gegner",
          strengths: typeof opponent.strengths === "string" ? opponent.strengths : "",
          weaknesses: typeof opponent.weaknesses === "string" ? opponent.weaknesses : "",
          defenseNotes: typeof opponent.defenseNotes === "string" ? opponent.defenseNotes : "",
          opponentStyles: normalizeOpponentStyles(opponent.opponentStyles),
          bestPlayerIds: stringArray(opponent.bestPlayerIds),
          notes: typeof opponent.notes === "string" ? opponent.notes : undefined,
        } satisfies LeagueOpponent;
      })
    : [];
  const ownTeam = parsed.ownTeam && typeof parsed.ownTeam === "object"
    ? {
        id: LEAGUE_OWN_TEAM_ID,
        name: typeof parsed.ownTeam.name === "string" && parsed.ownTeam.name.trim()
          ? parsed.ownTeam.name
          : empty.ownTeam.name,
        sourceTeamId: typeof parsed.ownTeam.sourceTeamId === "string" ? parsed.ownTeam.sourceTeamId : undefined,
        bestPlayerIds: stringArray(parsed.ownTeam.bestPlayerIds),
      }
    : empty.ownTeam;
  const schedule = Array.isArray(parsed.schedule)
    ? parsed.schedule.map((raw) => {
        const entry = raw as LeagueScheduleEntry;
        const hasScore = entry.homeScore != null && entry.awayScore != null;
        const travelMinutes = Number(entry.travelMinutes);
        const normalizedEntry = {
          ...entry,
          startTime: normalizeLeagueStartTime(entry.startTime),
          meetingTime: normalizeLeagueStartTime(entry.meetingTime),
          attendanceDeadline: typeof entry.attendanceDeadline === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(entry.attendanceDeadline)
            ? entry.attendanceDeadline
            : undefined,
          status: normalizeGameStatus(entry.status, hasScore),
          venueName: typeof entry.venueName === "string" ? entry.venueName : undefined,
          venueAddress: typeof entry.venueAddress === "string" ? entry.venueAddress : undefined,
          travelMinutes: Number.isFinite(travelMinutes) && travelMinutes >= 0 ? Math.round(travelMinutes) : null,
          attendance: normalizeAttendance(entry.attendance),
          liveState: normalizeLiveState(entry.liveState),
        };
        if (entry.homeTeamId && entry.awayTeamId) return normalizedEntry;
        if (!entry.opponentId) return normalizedEntry;
        return {
          ...normalizedEntry,
          homeTeamId: entry.homeAway === "away" ? entry.opponentId : LEAGUE_OWN_TEAM_ID,
          awayTeamId: entry.homeAway === "away" ? LEAGUE_OWN_TEAM_ID : entry.opponentId,
        };
      })
    : [];
  const rawSeasons = Array.isArray(parsed.seasons)
    ? parsed.seasons.filter((season): season is LeagueSeason => Boolean(
        season && typeof season === "object" && typeof season.id === "string" && typeof season.name === "string",
      ))
    : [];
  const rawLeagues = Array.isArray(parsed.leagues)
    ? parsed.leagues.filter((league): league is LeagueDefinition => Boolean(
        league && typeof league === "object" && typeof league.id === "string" && typeof league.name === "string",
      ))
    : [];
  const needsDefaultLeague = rawSeasons.some((season) => !season.leagueId) || (rawSeasons.length > 0 && rawLeagues.length === 0);
  const leagues: LeagueDefinition[] = [
    ...rawLeagues.map((league) => ({
      id: league.id,
      name: league.name.trim() || "Unbenannte Liga",
      region: typeof league.region === "string" ? league.region : undefined,
      level: typeof league.level === "string" ? league.level : undefined,
      notes: typeof league.notes === "string" ? league.notes : undefined,
      createdAt: typeof league.createdAt === "string" ? league.createdAt : new Date(0).toISOString(),
    })),
    ...(needsDefaultLeague && !rawLeagues.some((league) => league.id === LEAGUE_DEFAULT_ID)
      ? [{ id: LEAGUE_DEFAULT_ID, name: "Meine Liga", createdAt: new Date(0).toISOString() }]
      : []),
  ];
  const leagueIds = new Set(leagues.map((league) => league.id));
  const fallbackLeagueId = leagues[0]?.id;
  const seasons = rawSeasons.map((season) => ({
    ...season,
    leagueId: season.leagueId && leagueIds.has(season.leagueId) ? season.leagueId : fallbackLeagueId,
  }));
  const requestedSeasonId = typeof parsed.activeSeasonId === "string" ? parsed.activeSeasonId : null;
  const requestedLeagueId = typeof parsed.activeLeagueId === "string" && leagueIds.has(parsed.activeLeagueId)
    ? parsed.activeLeagueId
    : seasons.find((season) => season.id === requestedSeasonId)?.leagueId ?? fallbackLeagueId ?? null;
  const activeSeasonId = seasons.some((season) => season.id === requestedSeasonId && season.leagueId === requestedLeagueId)
    ? requestedSeasonId
    : seasons.find((season) => season.leagueId === requestedLeagueId)?.id ?? null;

  return {
    activeLeagueId: requestedLeagueId,
    activeSeasonId,
    leagues,
    seasons,
    ownTeam,
    opponents,
    players: Array.isArray(parsed.players) ? parsed.players : [],
    schedule,
  };
}

function canUseStorage() {
  return typeof window !== "undefined";
}

export function loadLeagueBundle(): LeagueBundle {
  if (!canUseStorage()) return createEmptyLeagueBundle();
  const raw = window.localStorage.getItem(LEAGUE_STORAGE_KEY);
  if (!raw) return createEmptyLeagueBundle();
  try {
    return normalizeLeagueBundle(JSON.parse(raw));
  } catch {
    return createEmptyLeagueBundle();
  }
}

export function saveLeagueBundle(bundle: LeagueBundle) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(LEAGUE_STORAGE_KEY, JSON.stringify(bundle));
  markLocalProgressDirty();
  window.dispatchEvent(new CustomEvent(LEAGUE_UPDATED_EVENT, { detail: { source: "local" } }));
}

export function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getActiveSeason(bundle: LeagueBundle): LeagueSeason | null {
  const leagueId = getActiveLeague(bundle)?.id;
  const seasons = leagueId ? seasonsForLeague(bundle, leagueId) : bundle.seasons;
  if (!bundle.activeSeasonId) return seasons[0] ?? null;
  return seasons.find((season) => season.id === bundle.activeSeasonId) ?? seasons[0] ?? null;
}

export function getActiveLeague(bundle: LeagueBundle): LeagueDefinition | null {
  if (!bundle.activeLeagueId) return bundle.leagues[0] ?? null;
  return bundle.leagues.find((league) => league.id === bundle.activeLeagueId) ?? bundle.leagues[0] ?? null;
}

export function seasonsForLeague(bundle: LeagueBundle, leagueId: string) {
  return bundle.seasons
    .filter((season) => season.leagueId === leagueId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function connectLeagueOwnTeam(bundle: LeagueBundle, team: { id: string; name: string } | null): LeagueBundle {
  if (!team) return { ...bundle, ownTeam: { ...bundle.ownTeam, sourceTeamId: undefined } };
  const name = team.name.trim();
  if (!name) return bundle;
  return { ...bundle, ownTeam: { ...bundle.ownTeam, sourceTeamId: team.id, name } };
}

export function opponentsForSeason(bundle: LeagueBundle, seasonId: string) {
  return bundle.opponents.filter(
    (entry) => entry.seasonIds.includes(seasonId) || entry.seasonId === seasonId,
  );
}

export function teamsForSeason(bundle: LeagueBundle, seasonId: string): LeagueTeamOption[] {
  return [
    { id: bundle.ownTeam.id, name: bundle.ownTeam.name, kind: "own" },
    ...opponentsForSeason(bundle, seasonId).map((entry) => ({
      id: entry.id,
      name: entry.name,
      kind: "opponent" as const,
    })),
  ];
}

export function playersForTeam(bundle: LeagueBundle, teamId: string) {
  return bundle.players
    .filter((entry) => entry.teamId === teamId)
    .sort((left, right) => left.name.localeCompare(right.name, "de"));
}

export function scheduleForSeason(bundle: LeagueBundle, seasonId: string) {
  return bundle.schedule
    .filter((entry) => entry.seasonId === seasonId)
    .sort((left, right) => {
      const dateOrder = left.date.localeCompare(right.date);
      if (dateOrder !== 0) return dateOrder;
      const timeOrder = (left.startTime ?? "99:99").localeCompare(right.startTime ?? "99:99");
      return timeOrder !== 0 ? timeOrder : left.id.localeCompare(right.id);
    });
}

export function groupLeagueScheduleByDay(entries: LeagueScheduleEntry[]) {
  const groups = new Map<string, LeagueScheduleEntry[]>();
  for (const entry of entries) {
    const games = groups.get(entry.date) ?? [];
    games.push(entry);
    groups.set(entry.date, games);
  }
  return Array.from(groups, ([date, games]) => ({ date, games }));
}

export function getStandingZone(position: number): LeagueStandingZone {
  if (position >= 1 && position <= 8) return "playoffs";
  if (position === 9 || position === 10) return "stay";
  if (position === 11 || position === 12) return "relegation";
  return "outside";
}

export function isCompletedLeagueGame(entry: LeagueScheduleEntry) {
  if (entry.kind !== "game" || (entry.status && entry.status !== "final")) return false;
  if (!Number.isInteger(entry.homeScore) || !Number.isInteger(entry.awayScore)) return false;
  return entry.homeScore !== entry.awayScore;
}

export function findDuplicateLeagueGame(
  schedule: LeagueScheduleEntry[],
  candidate: Pick<LeagueScheduleEntry, "id" | "seasonId" | "date" | "startTime" | "homeTeamId" | "awayTeamId">,
) {
  return schedule.find((entry) =>
    entry.id !== candidate.id &&
    entry.seasonId === candidate.seasonId &&
    entry.date === candidate.date &&
    (entry.startTime ?? "") === (candidate.startTime ?? "") &&
    entry.homeTeamId === candidate.homeTeamId &&
    entry.awayTeamId === candidate.awayTeamId,
  );
}

export function validateLeagueGame(entry: LeagueScheduleEntry, players: LeaguePlayer[] = []) {
  const issues: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) issues.push("Datum fehlt oder ist ungültig.");
  if (entry.startTime && !normalizeLeagueStartTime(entry.startTime)) issues.push("Spielzeit ist ungültig.");
  if (!entry.homeTeamId || !entry.awayTeamId || entry.homeTeamId === entry.awayTeamId) {
    issues.push("Heim- und Auswärtsteam müssen unterschiedlich sein.");
  }
  const hasHomeScore = entry.homeScore != null;
  const hasAwayScore = entry.awayScore != null;
  if (hasHomeScore !== hasAwayScore) issues.push("Für ein Ergebnis müssen beide Punktestände ausgefüllt sein.");
  if (entry.status === "final" && (!hasHomeScore || !hasAwayScore)) issues.push("Ein finales Spiel benötigt ein vollständiges Ergebnis.");
  if (hasHomeScore && (!Number.isInteger(entry.homeScore) || (entry.homeScore ?? -1) < 0)) issues.push("Heimpunkte müssen eine ganze positive Zahl sein.");
  if (hasAwayScore && (!Number.isInteger(entry.awayScore) || (entry.awayScore ?? -1) < 0)) issues.push("Auswärtspunkte müssen eine ganze positive Zahl sein.");
  if (entry.kind === "game" && hasHomeScore && entry.homeScore === entry.awayScore) {
    issues.push("Ein Ligaspiel benötigt nach Verlängerung einen Sieger.");
  }
  if (entry.attendanceDeadline) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(entry.attendanceDeadline)) issues.push("Die Zusagefrist ist ungültig.");
    else if (entry.attendanceDeadline > `${entry.date}T${entry.startTime ?? "23:59"}`) issues.push("Die Zusagefrist muss vor dem Spielbeginn liegen.");
  }
  const playerIds = new Set(players.map((player) => player.id));
  for (const line of entry.playerStats ?? []) {
    if (players.length > 0 && !playerIds.has(line.playerId)) issues.push("Der Boxscore enthält einen nicht mehr vorhandenen Spieler.");
    if (line.minutes != null && line.minutes > 60) issues.push("Spielerminuten über 60 sind unplausibel.");
    if (line.points != null && line.threePointersMade != null && line.threePointersMade * 3 > line.points) {
      issues.push("Getroffene Dreier können nicht mehr Punkte ergeben als die Gesamtpunkte.");
    }
    if (Object.values(line).some((value) => typeof value === "number" && (!Number.isFinite(value) || value < 0))) {
      issues.push("Boxscore-Werte dürfen nicht negativ sein.");
    }
  }
  return [...new Set(issues)];
}

export function buildLeagueStandings(bundle: LeagueBundle, seasonId: string): LeagueStanding[] {
  const teams = teamsForSeason(bundle, seasonId);
  const rows = new Map(
    teams.map((team) => [
      team.id,
      {
        teamId: team.id,
        teamName: team.name,
        played: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        difference: 0,
        tablePoints: 0,
        headToHeadPoints: 0,
        headToHeadDifference: 0,
        position: 0,
      } satisfies LeagueStanding,
    ]),
  );

  const completedGames = bundle.schedule.filter((game) => game.seasonId === seasonId && isCompletedLeagueGame(game));
  for (const game of completedGames) {
    if (!game.homeTeamId || !game.awayTeamId || game.homeTeamId === game.awayTeamId) continue;
    if (game.homeScore == null || game.awayScore == null) continue;
    const home = rows.get(game.homeTeamId);
    const away = rows.get(game.awayTeamId);
    if (!home || !away) continue;
    home.played += 1;
    away.played += 1;
    home.pointsFor += game.homeScore;
    home.pointsAgainst += game.awayScore;
    away.pointsFor += game.awayScore;
    away.pointsAgainst += game.homeScore;
    if (game.homeScore > game.awayScore) {
      home.wins += 1;
      away.losses += 1;
      home.tablePoints += 2;
      away.tablePoints += 1;
    } else if (game.awayScore > game.homeScore) {
      away.wins += 1;
      home.losses += 1;
      away.tablePoints += 2;
      home.tablePoints += 1;
    }
  }

  const result = [...rows.values()].map((row) => ({ ...row, difference: row.pointsFor - row.pointsAgainst }));
  const tiedGroups = new Map<number, LeagueStanding[]>();
  for (const row of result) {
    const group = tiedGroups.get(row.tablePoints) ?? [];
    group.push(row);
    tiedGroups.set(row.tablePoints, group);
  }
  for (const group of tiedGroups.values()) {
    if (group.length < 2) continue;
    const ids = new Set(group.map((row) => row.teamId));
    const groupRows = new Map(group.map((row) => [row.teamId, row]));
    for (const game of completedGames) {
      if (!game.homeTeamId || !game.awayTeamId || !ids.has(game.homeTeamId) || !ids.has(game.awayTeamId)) continue;
      const home = groupRows.get(game.homeTeamId);
      const away = groupRows.get(game.awayTeamId);
      if (!home || !away || game.homeScore == null || game.awayScore == null) continue;
      home.headToHeadDifference += game.homeScore - game.awayScore;
      away.headToHeadDifference += game.awayScore - game.homeScore;
      if (game.homeScore > game.awayScore) {
        home.headToHeadPoints += 2;
        away.headToHeadPoints += 1;
      } else {
        away.headToHeadPoints += 2;
        home.headToHeadPoints += 1;
      }
    }
  }

  return result
    .sort(
      (left, right) =>
        right.tablePoints - left.tablePoints ||
        right.headToHeadPoints - left.headToHeadPoints ||
        right.headToHeadDifference - left.headToHeadDifference ||
        right.difference - left.difference ||
        right.pointsFor - left.pointsFor ||
        left.teamName.localeCompare(right.teamName, "de"),
    )
    .map((row, index) => ({ ...row, position: index + 1 }));
}

export function buildPlayerSeasonSummaries(bundle: LeagueBundle, seasonId: string) {
  const teamIds = new Set(teamsForSeason(bundle, seasonId).map((team) => team.id));
  const summaries = new Map<string, LeaguePlayerSeasonSummary>();
  for (const player of bundle.players) {
    if (!teamIds.has(player.teamId)) continue;
    summaries.set(player.id, {
      playerId: player.id,
      appearances: 0,
      minutes: 0,
      points: 0,
      assists: 0,
      rebounds: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fouls: 0,
      threePointersMade: 0,
      mvpAwards: 0,
    });
  }
  for (const game of bundle.schedule) {
    if (game.seasonId !== seasonId || game.status === "cancelled" || game.status === "postponed") continue;
    if (game.bestPlayerId) {
      const mvp = summaries.get(game.bestPlayerId);
      if (mvp) mvp.mvpAwards += 1;
    }
    for (const line of game.playerStats ?? []) {
      const summary = summaries.get(line.playerId);
      if (!summary) continue;
      const hasValue = PLAYER_STAT_SUMMARY_KEYS.some((key) => line[key] != null);
      if (!hasValue) continue;
      summary.appearances += 1;
      for (const key of PLAYER_STAT_SUMMARY_KEYS) summary[key] += line[key] ?? 0;
    }
  }
  return summaries;
}

const PLAYER_STAT_SUMMARY_KEYS = [
  "minutes",
  "points",
  "assists",
  "rebounds",
  "steals",
  "blocks",
  "turnovers",
  "fouls",
  "threePointersMade",
] as const;

export function emptyPlayerStatLine(playerId: string): LeaguePlayerStatLine {
  return {
    playerId,
    minutes: null,
    points: null,
    assists: null,
    rebounds: null,
    steals: null,
    blocks: null,
    turnovers: null,
    fouls: null,
    threePointersMade: null,
  };
}

export function gameInvolvesOwnTeam(entry: LeagueScheduleEntry) {
  if (!entry.homeTeamId && !entry.awayTeamId) return Boolean(entry.opponentId);
  return entry.homeTeamId === LEAGUE_OWN_TEAM_ID || entry.awayTeamId === LEAGUE_OWN_TEAM_ID;
}

function opponentPrepNotes(opponent: LeagueOpponent | undefined) {
  if (!opponent) return undefined;
  const parts = [
    opponent.strengths.trim() ? `Stärken: ${opponent.strengths.trim()}` : null,
    opponent.weaknesses.trim() ? `Schwächen: ${opponent.weaknesses.trim()}` : null,
    opponent.defenseNotes.trim() ? `Verteidigung: ${opponent.defenseNotes.trim()}` : null,
    opponent.notes?.trim() ? opponent.notes.trim() : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : undefined;
}

/** Schreibt nur Spiele des eigenen Teams in Tagesplan und persönliche Spiel-Stats. */
export function syncLeagueEntryToPlan(entry: LeagueScheduleEntry, opponent?: LeagueOpponent) {
  if (!gameInvolvesOwnTeam(entry) || entry.status === "cancelled" || entry.status === "postponed") return entry;
  addManualGameForDate(entry.date, entry.kind === "game_training" ? "game_training" : "game");

  const context = entry.kind === "game_training" ? "game_training" : "game";
  const existing = findGameStatByLeagueGameId(entry.id) ?? (entry.syncedAt ? findGameStatByDateAndContext(entry.date, context) : undefined);
  const prepNotes = [
    entry.startTime ? `Spielbeginn: ${entry.startTime} Uhr` : null,
    entry.meetingTime ? `Treffpunkt: ${entry.meetingTime} Uhr` : null,
    entry.venueName?.trim() ? `Spielort: ${entry.venueName.trim()}` : null,
    entry.venueAddress?.trim() ? `Adresse: ${entry.venueAddress.trim()}` : null,
    entry.travelMinutes != null ? `Anfahrt: ca. ${entry.travelMinutes} Min.` : null,
    opponentPrepNotes(opponent),
    entry.notes?.trim(),
    entry.awards?.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

  upsertGameStat({
    id: existing?.id,
    leagueGameId: entry.id,
    date: entry.date,
    context,
    opponentLabel: opponent?.name?.trim() || existing?.opponentLabel || null,
    opponentStyles:
      opponent && opponent.opponentStyles.length > 0
        ? opponent.opponentStyles
        : (existing?.opponentStyles ?? []),
    notes: prepNotes || existing?.notes || undefined,
    minutes: existing?.minutes ?? null,
    points: existing?.points ?? null,
    assists: existing?.assists ?? null,
    rebounds: existing?.rebounds ?? null,
    steals: existing?.steals ?? null,
  });

  return { ...entry, syncedAt: new Date().toISOString() };
}

export function syncUpcomingLeagueSchedule(seasonId: string, fromDate: string) {
  const bundle = loadLeagueBundle();
  const opponentsById = new Map(bundle.opponents.map((entry) => [entry.id, entry]));
  let count = 0;
  const nextSchedule = bundle.schedule.map((entry) => {
    if (
      entry.seasonId !== seasonId ||
      entry.date < fromDate ||
      !gameInvolvesOwnTeam(entry) ||
      entry.status === "cancelled" ||
      entry.status === "postponed"
    ) return entry;
    const opponentId = entry.homeTeamId === LEAGUE_OWN_TEAM_ID ? entry.awayTeamId : entry.homeTeamId;
    const opponent = opponentsById.get(opponentId ?? entry.opponentId ?? "");
    count += 1;
    return syncLeagueEntryToPlan(entry, opponent);
  });
  saveLeagueBundle({ ...bundle, schedule: nextSchedule });
  return count;
}
