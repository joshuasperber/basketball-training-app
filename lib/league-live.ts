import {
  createId,
  emptyPlayerStatLine,
  type LeagueLiveEvent,
  type LeagueLiveState,
  type LeaguePlayerStatLine,
  type LeagueScheduleEntry,
} from "@/lib/league";

export const LIVE_QUARTER_SECONDS = 10 * 60;

export function getLeagueLiveState(entry: LeagueScheduleEntry): LeagueLiveState {
  return entry.liveState ?? { quarter: 1, clockSeconds: LIVE_QUARTER_SECONDS, events: [] };
}

export function getLiveClockSeconds(state: LeagueLiveState, now = Date.now()) {
  if (!state.runningSince) return state.clockSeconds;
  if (now <= state.runningSince) return state.clockSeconds;
  const elapsed = Math.floor((now - state.runningSince) / 1000);
  return Math.max(0, state.clockSeconds - elapsed);
}

export function toggleLeagueLiveClock(entry: LeagueScheduleEntry, now = Date.now()): LeagueScheduleEntry {
  const state = getLeagueLiveState(entry);
  if (state.runningSince) {
    return { ...entry, status: "live", liveState: { ...state, clockSeconds: getLiveClockSeconds(state, now), runningSince: undefined } };
  }
  if (state.clockSeconds <= 0) return entry;
  return { ...entry, status: "live", liveState: { ...state, runningSince: now } };
}

export function setLeagueLiveQuarter(entry: LeagueScheduleEntry, quarter: number): LeagueScheduleEntry {
  const state = getLeagueLiveState(entry);
  return {
    ...entry,
    status: "live",
    liveState: {
      ...state,
      quarter: Math.max(1, Math.min(12, Math.round(quarter))),
      clockSeconds: LIVE_QUARTER_SECONDS,
      runningSince: undefined,
    },
  };
}

function updatePlayerStat(
  lines: LeaguePlayerStatLine[] | undefined,
  playerId: string | undefined,
  field: "points" | "fouls" | "threePointersMade",
  delta: number,
) {
  if (!playerId) return lines ?? [];
  const previous = lines?.find((line) => line.playerId === playerId) ?? emptyPlayerStatLine(playerId);
  const current = previous[field] ?? 0;
  const next = { ...previous, [field]: Math.max(0, current + delta) };
  return [...(lines?.filter((line) => line.playerId !== playerId) ?? []), next];
}

export function recordLeagueLiveEvent(
  entry: LeagueScheduleEntry,
  input: Pick<LeagueLiveEvent, "type" | "teamId" | "playerId" | "value">,
  now = new Date(),
  idFactory: (prefix: string) => string = createId,
): LeagueScheduleEntry {
  if (input.value <= 0 || !Number.isInteger(input.value)) return entry;
  const state = getLeagueLiveState(entry);
  const event: LeagueLiveEvent = {
    id: idFactory("live"),
    type: input.type,
    teamId: input.teamId,
    playerId: input.playerId,
    value: input.value,
    quarter: state.quarter,
    occurredAt: now.toISOString(),
  };
  const next: LeagueScheduleEntry = {
    ...entry,
    status: "live",
    liveState: { ...state, events: [...state.events, event].slice(-500) },
  };
  if (input.type === "score") {
    if (input.teamId === entry.homeTeamId) next.homeScore = (entry.homeScore ?? 0) + input.value;
    if (input.teamId === entry.awayTeamId) next.awayScore = (entry.awayScore ?? 0) + input.value;
    next.playerStats = updatePlayerStat(entry.playerStats, input.playerId, "points", input.value);
    if (input.value === 3) next.playerStats = updatePlayerStat(next.playerStats, input.playerId, "threePointersMade", 1);
  } else {
    next.playerStats = updatePlayerStat(entry.playerStats, input.playerId, "fouls", input.value);
  }
  return next;
}

export function undoLastLeagueLiveEvent(entry: LeagueScheduleEntry): LeagueScheduleEntry {
  const state = getLeagueLiveState(entry);
  const event = state.events.at(-1);
  if (!event) return entry;
  const next: LeagueScheduleEntry = { ...entry, liveState: { ...state, events: state.events.slice(0, -1) } };
  if (event.type === "score") {
    if (event.teamId === entry.homeTeamId) next.homeScore = Math.max(0, (entry.homeScore ?? 0) - event.value);
    if (event.teamId === entry.awayTeamId) next.awayScore = Math.max(0, (entry.awayScore ?? 0) - event.value);
    next.playerStats = updatePlayerStat(entry.playerStats, event.playerId, "points", -event.value);
    if (event.value === 3) next.playerStats = updatePlayerStat(next.playerStats, event.playerId, "threePointersMade", -1);
  } else {
    next.playerStats = updatePlayerStat(entry.playerStats, event.playerId, "fouls", -event.value);
  }
  return next;
}

export function getQuarterTeamFouls(entry: LeagueScheduleEntry, teamId: string) {
  const state = getLeagueLiveState(entry);
  return state.events
    .filter((event) => event.type === "foul" && event.teamId === teamId && event.quarter === state.quarter)
    .reduce((sum, event) => sum + event.value, 0);
}

export function formatLiveClock(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
