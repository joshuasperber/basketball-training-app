"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TopSubTabs from "@/components/TopSubTabs";
import PageHeader from "@/components/PageHeader";
import GradientFadeList from "@/components/GradientFadeList";
import ModernDateInput from "@/components/ui/ModernDateInput";
import ModernTimeInput from "@/components/ui/ModernTimeInput";
import { useAppDialog } from "@/components/ui/AppDialogProvider";
import {
  OPPONENT_STYLE_LABELS,
  OPPONENT_STYLE_TAGS,
  toggleOpponentStyle,
  type OpponentStyleTag,
} from "@/lib/opponent-styles";
import {
  LEAGUE_OWN_TEAM_ID,
  buildLeagueStandings,
  buildPlayerSeasonSummaries,
  createEmptyLeagueBundle,
  createId,
  emptyPlayerStatLine,
  gameInvolvesOwnTeam,
  getActiveSeason,
  getStandingZone,
  groupLeagueScheduleByDay,
  findDuplicateLeagueGame,
  isCompletedLeagueGame,
  loadLeagueBundle,
  opponentsForSeason,
  playersForTeam,
  saveLeagueBundle,
  scheduleForSeason,
  syncLeagueEntryToPlan,
  syncUpcomingLeagueSchedule,
  teamsForSeason,
  validateLeagueGame,
  type LeagueAttendanceStatus,
  type LeagueBundle,
  type LeagueGameKind,
  type LeagueGameStatus,
  type LeagueOpponent,
  type LeaguePlayer,
  type LeaguePlayerStatLine,
  type LeagueScheduleEntry,
  type LeagueSeason,
} from "@/lib/league";
import { deleteGameStatForLeagueGame } from "@/lib/game-stats";
import { removeManualGameForDate } from "@/lib/plan-day-actions";
import {
  buildGoogleCalendarUrl,
  buildLeagueCalendarIcs,
  downloadLeagueCalendar,
} from "@/lib/league-calendar";
import {
  applyLeagueScheduleCsv,
  LEAGUE_CSV_TEMPLATE,
  parseLeagueScheduleCsv,
  type LeagueCsvImportPlan,
} from "@/lib/league-csv";
import { getTodayDateKey } from "@/lib/workout";
import { loadLigaTab, persistLigaTab, type LigaTab } from "@/lib/ui-navigation-state";
import { useT } from "@/lib/i18n/I18nProvider";
import { normalizeTeamOpponentName } from "@/lib/team-league-opponents";

type Tab = LigaTab;
type NumericStatKey = Exclude<keyof LeaguePlayerStatLine, "playerId">;

const PLAYER_STAT_COLUMNS: { key: NumericStatKey; label: string; title: string }[] = [
  { key: "minutes", label: "MIN", title: "Minuten" },
  { key: "points", label: "PTS", title: "Punkte" },
  { key: "assists", label: "AST", title: "Assists" },
  { key: "rebounds", label: "REB", title: "Rebounds" },
  { key: "steals", label: "STL", title: "Steals" },
  { key: "blocks", label: "BLK", title: "Blocks" },
  { key: "turnovers", label: "TO", title: "Turnovers" },
  { key: "fouls", label: "F", title: "Fouls" },
  { key: "threePointersMade", label: "3PM", title: "Dreier getroffen" },
];

const SCHEDULE_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("de-DE", { weekday: "short" });
const SCHEDULE_DAY_FORMATTER = new Intl.DateTimeFormat("de-DE", { day: "2-digit" });
const SCHEDULE_MONTH_FORMATTER = new Intl.DateTimeFormat("de-DE", { month: "short" });

function formatDateLabel(dateKey: string) {
  const parsed = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatGameDateTimeLabel(dateKey: string, startTime?: string) {
  return `${formatDateLabel(dateKey)} · ${startTime ? `${startTime} Uhr` : "Zeit offen"}`;
}

function formatScheduleDateParts(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  return {
    weekday: SCHEDULE_WEEKDAY_FORMATTER.format(date),
    day: SCHEDULE_DAY_FORMATTER.format(date),
    month: SCHEDULE_MONTH_FORMATTER.format(date),
  };
}

function nullableNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function nullableInteger(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function gameStatusLabel(status: LeagueGameStatus | undefined) {
  if (status === "final") return "Final";
  if (status === "live") return "Live";
  if (status === "postponed") return "Verschoben";
  if (status === "cancelled") return "Abgesagt";
  return "Geplant";
}

function zoneLabel(position: number) {
  const zone = getStandingZone(position);
  if (zone === "playoffs") return "Playoffs";
  if (zone === "stay") return "Liga";
  if (zone === "relegation") return "Abstieg";
  return "Offen";
}

export default function LigaPage() {
  const t = useT();
  const appDialog = useAppDialog();
  const [bundle, setBundle] = useState<LeagueBundle>(() => createEmptyLeagueBundle());
  const [tab, setTab] = useState<Tab>("schedule");
  const [seasonName, setSeasonName] = useState("");
  const [seasonStartDate, setSeasonStartDate] = useState("");
  const [seasonEndDate, setSeasonEndDate] = useState("");
  const [seasonNotes, setSeasonNotes] = useState("");
  const [opponentEditId, setOpponentEditId] = useState<string | null>(null);
  const [opponentName, setOpponentName] = useState("");
  const [opponentStrengths, setOpponentStrengths] = useState("");
  const [opponentWeaknesses, setOpponentWeaknesses] = useState("");
  const [opponentDefense, setOpponentDefense] = useState("");
  const [opponentNotes, setOpponentNotes] = useState("");
  const [opponentStyles, setOpponentStyles] = useState<OpponentStyleTag[]>([]);
  const [attachOpponentId, setAttachOpponentId] = useState("");
  const [playerEditId, setPlayerEditId] = useState<string | null>(null);
  const [playerTeamId, setPlayerTeamId] = useState(LEAGUE_OWN_TEAM_ID);
  const [playerName, setPlayerName] = useState("");
  const [playerNumber, setPlayerNumber] = useState("");
  const [playerPosition, setPlayerPosition] = useState("");
  const [playerNotes, setPlayerNotes] = useState("");
  const [playerIsBest, setPlayerIsBest] = useState(false);
  const [gameDate, setGameDate] = useState("");
  const [gameTime, setGameTime] = useState("18:00");
  const [gameKind, setGameKind] = useState<LeagueGameKind>("game");
  const [homeTeamId, setHomeTeamId] = useState(LEAGUE_OWN_TEAM_ID);
  const [awayTeamId, setAwayTeamId] = useState("");
  const [gameNotes, setGameNotes] = useState("");
  const [gameVenue, setGameVenue] = useState("");
  const [gameAddress, setGameAddress] = useState("");
  const [gameMeetingTime, setGameMeetingTime] = useState("");
  const [gameTravelMinutes, setGameTravelMinutes] = useState("");
  const [csvPreview, setCsvPreview] = useState<LeagueCsvImportPlan | null>(null);
  const [csvFileName, setCsvFileName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => setBundle(loadLeagueBundle()), []);

  useEffect(() => {
    const stored = loadLigaTab() as string | null;
    if (stored === "opponents") setTab("teams");
    else if (stored === "schedule" || stored === "standings" || stored === "teams" || stored === "players" || stored === "season") setTab(stored);
    const onUpdate = () => refresh();
    refresh();
    window.addEventListener("bt:league-updated", onUpdate);
    return () => window.removeEventListener("bt:league-updated", onUpdate);
  }, [refresh]);

  const activeSeason = useMemo(() => getActiveSeason(bundle), [bundle]);
  const opponents = useMemo(
    () => (activeSeason ? opponentsForSeason(bundle, activeSeason.id) : []),
    [activeSeason, bundle],
  );
  const teams = useMemo(
    () => (activeSeason ? teamsForSeason(bundle, activeSeason.id) : [{ id: bundle.ownTeam.id, name: bundle.ownTeam.name, kind: "own" as const }]),
    [activeSeason, bundle],
  );
  const schedule = useMemo(
    () => (activeSeason ? scheduleForSeason(bundle, activeSeason.id) : []),
    [activeSeason, bundle],
  );
  const scheduleDays = useMemo(() => groupLeagueScheduleByDay(schedule), [schedule]);
  const standings = useMemo(
    () => (activeSeason ? buildLeagueStandings(bundle, activeSeason.id) : []),
    [activeSeason, bundle],
  );
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const ownTeamPlayers = useMemo(() => playersForTeam(bundle, LEAGUE_OWN_TEAM_ID), [bundle]);
  const ownSchedule = useMemo(() => schedule.filter(gameInvolvesOwnTeam), [schedule]);
  const playerById = useMemo(() => new Map(bundle.players.map((player) => [player.id, player])), [bundle.players]);
  const playerSeasonSummaries = useMemo(
    () => activeSeason ? buildPlayerSeasonSummaries(bundle, activeSeason.id) : new Map(),
    [activeSeason, bundle],
  );
  const unassignedOpponents = useMemo(
    () => bundle.opponents.filter((opponent) => !activeSeason || !opponent.seasonIds.includes(activeSeason.id)),
    [activeSeason, bundle.opponents],
  );

  useEffect(() => {
    if (!teams.some((team) => team.id === playerTeamId)) setPlayerTeamId(teams[0]?.id ?? LEAGUE_OWN_TEAM_ID);
    if (!teams.some((team) => team.id === homeTeamId)) setHomeTeamId(teams[0]?.id ?? LEAGUE_OWN_TEAM_ID);
    if (!teams.some((team) => team.id === awayTeamId)) setAwayTeamId(teams[1]?.id ?? "");
  }, [awayTeamId, homeTeamId, playerTeamId, teams]);

  function persist(next: LeagueBundle) {
    saveLeagueBundle(next);
    setBundle(next);
  }

  function handleTabChange(next: Tab) {
    setTab(next);
    persistLigaTab(next);
  }

  function resetOpponentForm() {
    setOpponentEditId(null);
    setOpponentName("");
    setOpponentStrengths("");
    setOpponentWeaknesses("");
    setOpponentDefense("");
    setOpponentNotes("");
    setOpponentStyles([]);
  }

  function beginOpponentEdit(opponent: LeagueOpponent) {
    setOpponentEditId(opponent.id);
    setOpponentName(opponent.name);
    setOpponentStrengths(opponent.strengths);
    setOpponentWeaknesses(opponent.weaknesses);
    setOpponentDefense(opponent.defenseNotes);
    setOpponentNotes(opponent.notes ?? "");
    setOpponentStyles(opponent.opponentStyles);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetPlayerForm() {
    setPlayerEditId(null);
    setPlayerName("");
    setPlayerNumber("");
    setPlayerPosition("");
    setPlayerNotes("");
    setPlayerIsBest(false);
  }

  function playerIsMarkedBest(player: LeaguePlayer) {
    if (player.teamId === LEAGUE_OWN_TEAM_ID) return bundle.ownTeam.bestPlayerIds.includes(player.id);
    return bundle.opponents.find((team) => team.id === player.teamId)?.bestPlayerIds.includes(player.id) ?? false;
  }

  function beginPlayerEdit(player: LeaguePlayer) {
    setPlayerEditId(player.id);
    setPlayerTeamId(player.teamId);
    setPlayerName(player.name);
    setPlayerNumber(player.jerseyNumber ?? "");
    setPlayerPosition(player.position ?? "");
    setPlayerNotes(player.notes ?? "");
    setPlayerIsBest(playerIsMarkedBest(player));
  }

  function applyBestPlayer(next: LeagueBundle, playerId: string, teamId: string, marked: boolean) {
    if (teamId === LEAGUE_OWN_TEAM_ID) {
      const ids = next.ownTeam.bestPlayerIds.filter((id) => id !== playerId);
      return { ...next, ownTeam: { ...next.ownTeam, bestPlayerIds: marked ? [...ids, playerId] : ids } };
    }
    return {
      ...next,
      opponents: next.opponents.map((opponent) => {
        if (opponent.id !== teamId) return opponent;
        const ids = opponent.bestPlayerIds.filter((id) => id !== playerId);
        return { ...opponent, bestPlayerIds: marked ? [...ids, playerId] : ids };
      }),
    };
  }

  function handleCreateSeason(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = seasonName.trim();
    if (!name) return;
    if (bundle.seasons.some((season) => season.name.trim().toLocaleLowerCase("de-DE") === name.toLocaleLowerCase("de-DE"))) {
      return setMessage("Eine Saison mit diesem Namen ist bereits vorhanden.");
    }
    if (seasonStartDate && seasonEndDate && seasonEndDate < seasonStartDate) {
      return setMessage("Das Saisonende darf nicht vor dem Saisonstart liegen.");
    }
    const season: LeagueSeason = {
      id: createId("season"),
      name,
      startDate: seasonStartDate || undefined,
      endDate: seasonEndDate || undefined,
      notes: seasonNotes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    persist({ ...bundle, activeSeasonId: season.id, seasons: [season, ...bundle.seasons] });
    setSeasonName("");
    setSeasonStartDate("");
    setSeasonEndDate("");
    setSeasonNotes("");
    setMessage(`Saison „${name}“ angelegt.`);
  }

  function handleSaveOpponent(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeSeason) return setMessage("Bitte zuerst eine Saison anlegen.");
    const name = opponentName.trim();
    if (!name) return;
    const duplicate = bundle.opponents.find((opponent) =>
      opponent.id !== opponentEditId && normalizeTeamOpponentName(opponent.name) === normalizeTeamOpponentName(name),
    );
    if (duplicate) {
      if (!opponentEditId && !duplicate.seasonIds.includes(activeSeason.id)) {
        persist({
          ...bundle,
          opponents: bundle.opponents.map((opponent) => opponent.id === duplicate.id
            ? { ...opponent, seasonIds: [...opponent.seasonIds, activeSeason.id] }
            : opponent),
        });
        setMessage(`Der vorhandene Gegner „${duplicate.name}“ wurde dieser Saison zugeordnet.`);
        resetOpponentForm();
        return;
      }
      return setMessage(`Ein Gegner namens „${duplicate.name}“ ist bereits vorhanden.`);
    }
    if (opponentEditId) {
      persist({
        ...bundle,
        opponents: bundle.opponents.map((opponent) =>
          opponent.id === opponentEditId
            ? {
                ...opponent,
                name,
                strengths: opponentStrengths.trim(),
                weaknesses: opponentWeaknesses.trim(),
                defenseNotes: opponentDefense.trim(),
                opponentStyles,
                notes: opponentNotes.trim() || undefined,
              }
            : opponent,
        ),
      });
      setMessage(`Gegner „${name}“ aktualisiert.`);
    } else {
      const opponent: LeagueOpponent = {
        id: createId("opponent"),
        seasonIds: [activeSeason.id],
        name,
        strengths: opponentStrengths.trim(),
        weaknesses: opponentWeaknesses.trim(),
        defenseNotes: opponentDefense.trim(),
        opponentStyles,
        bestPlayerIds: [],
        notes: opponentNotes.trim() || undefined,
      };
      persist({ ...bundle, opponents: [opponent, ...bundle.opponents] });
      setMessage(`Gegner „${name}“ gespeichert und der Saison zugeordnet.`);
    }
    resetOpponentForm();
  }

  function attachOpponent() {
    if (!activeSeason || !attachOpponentId) return;
    const opponent = bundle.opponents.find((entry) => entry.id === attachOpponentId);
    if (!opponent) return;
    persist({
      ...bundle,
      opponents: bundle.opponents.map((entry) =>
        entry.id === opponent.id
          ? { ...entry, seasonIds: [...new Set([...entry.seasonIds, activeSeason.id])] }
          : entry,
      ),
    });
    setAttachOpponentId("");
    setMessage(`„${opponent.name}“ dieser Saison hinzugefügt.`);
  }

  function detachOpponent(opponent: LeagueOpponent) {
    if (!activeSeason) return;
    const usedInSchedule = bundle.schedule.some((game) =>
      game.seasonId === activeSeason.id && (game.homeTeamId === opponent.id || game.awayTeamId === opponent.id),
    );
    if (usedInSchedule) {
      setMessage("Das Team ist noch im Saison-Spielplan eingetragen und kann deshalb nicht aus der Saison entfernt werden.");
      return;
    }
    persist({
      ...bundle,
      opponents: bundle.opponents.map((entry) =>
        entry.id === opponent.id
          ? { ...entry, seasonId: entry.seasonId === activeSeason.id ? undefined : entry.seasonId, seasonIds: entry.seasonIds.filter((id) => id !== activeSeason.id) }
          : entry,
      ),
    });
    setMessage(`„${opponent.name}“ aus dieser Saison entfernt. Das Team bleibt im Archiv.`);
  }

  async function deleteOpponentGlobally(opponent: LeagueOpponent) {
    const confirmed = await appDialog.confirm({
      message: `„${opponent.name}“ dauerhaft löschen? Zugehörige Spieler und Spiele werden ebenfalls entfernt.`,
      confirmLabel: "Dauerhaft löschen",
      tone: "danger",
    });
    if (!confirmed) return;
    const affectedGames = bundle.schedule.filter((game) =>
      game.homeTeamId === opponent.id || game.awayTeamId === opponent.id || game.opponentId === opponent.id,
    );
    const affectedIds = new Set(affectedGames.map((game) => game.id));
    for (const game of affectedGames) {
      if (game.syncedAt) cleanupSyncedGame(game, affectedIds);
    }
    persist({
      ...bundle,
      opponents: bundle.opponents.filter((entry) => entry.id !== opponent.id),
      players: bundle.players.filter((player) => player.teamId !== opponent.id),
      schedule: bundle.schedule.filter((game) => game.homeTeamId !== opponent.id && game.awayTeamId !== opponent.id && game.opponentId !== opponent.id),
    });
  }

  function handleSavePlayer(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = playerName.trim();
    if (!name || !playerTeamId) return;
    const duplicate = bundle.players.find((player) =>
      player.id !== playerEditId &&
      player.teamId === playerTeamId &&
      player.name.trim().toLocaleLowerCase("de-DE") === name.toLocaleLowerCase("de-DE"),
    );
    if (duplicate) return setMessage(`${duplicate.name} ist in diesem Kader bereits vorhanden.`);
    const playerId = playerEditId ?? createId("player");
    const previous = playerEditId ? bundle.players.find((player) => player.id === playerEditId) : undefined;
    const player: LeaguePlayer = {
      id: playerId,
      teamId: playerTeamId,
      name,
      jerseyNumber: playerNumber.trim() || undefined,
      position: playerPosition.trim() || undefined,
      notes: playerNotes.trim() || undefined,
    };
    let next: LeagueBundle = {
      ...bundle,
      players: playerEditId
        ? bundle.players.map((entry) => (entry.id === playerEditId ? player : entry))
        : [...bundle.players, player],
    };
    if (previous && previous.teamId !== playerTeamId) next = applyBestPlayer(next, playerId, previous.teamId, false);
    next = applyBestPlayer(next, playerId, playerTeamId, playerIsBest);
    persist(next);
    setMessage(`${name} ${playerEditId ? "aktualisiert" : "zum Team hinzugefügt"}.`);
    resetPlayerForm();
  }

  async function deletePlayer(player: LeaguePlayer) {
    const confirmed = await appDialog.confirm({ message: `${player.name} löschen?`, confirmLabel: "Löschen", tone: "danger" });
    if (!confirmed) return;
    let next: LeagueBundle = {
      ...bundle,
      players: bundle.players.filter((entry) => entry.id !== player.id),
      schedule: bundle.schedule.map((game) => ({
        ...game,
        bestPlayerId: game.bestPlayerId === player.id ? undefined : game.bestPlayerId,
        playerStats: game.playerStats?.filter((line) => line.playerId !== player.id),
        attendance: game.attendance?.filter((response) => response.playerId !== player.id),
      })),
    };
    next = applyBestPlayer(next, player.id, player.teamId, false);
    persist(next);
  }

  function handleAddGame(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeSeason) return setMessage("Bitte zuerst eine Saison anlegen.");
    if (!gameDate || !gameTime || !homeTeamId || !awayTeamId) return setMessage("Bitte Datum, Spielzeit und beide Teams vollständig auswählen.");
    if (homeTeamId === awayTeamId) return setMessage("Heim- und Auswärtsteam müssen unterschiedlich sein.");
    if ((activeSeason.startDate && gameDate < activeSeason.startDate) || (activeSeason.endDate && gameDate > activeSeason.endDate)) {
      return setMessage("Das Spieldatum liegt außerhalb des eingetragenen Saisonzeitraums.");
    }
    const duplicate = findDuplicateLeagueGame(bundle.schedule, {
      id: "new-game",
      seasonId: activeSeason.id,
      date: gameDate,
      startTime: gameTime,
      homeTeamId,
      awayTeamId,
    });
    if (duplicate) return setMessage("Dieses Spiel ist mit denselben Teams, Datum und Uhrzeit bereits vorhanden.");
    const opponentId = homeTeamId === LEAGUE_OWN_TEAM_ID ? awayTeamId : awayTeamId === LEAGUE_OWN_TEAM_ID ? homeTeamId : undefined;
    const entry: LeagueScheduleEntry = {
      id: createId("game"),
      seasonId: activeSeason.id,
      date: gameDate,
      startTime: gameTime,
      kind: gameKind,
      status: "scheduled",
      homeTeamId,
      awayTeamId,
      opponentId,
      notes: gameNotes.trim() || undefined,
      venueName: gameVenue.trim() || undefined,
      venueAddress: gameAddress.trim() || undefined,
      meetingTime: gameMeetingTime || undefined,
      travelMinutes: nullableInteger(gameTravelMinutes),
      homeScore: null,
      awayScore: null,
      playerStats: [],
      attendance: [],
    };
    persist({ ...bundle, schedule: [...bundle.schedule, entry] });
    setGameDate("");
    setGameTime("18:00");
    setGameNotes("");
    setGameVenue("");
    setGameAddress("");
    setGameMeetingTime("");
    setGameTravelMinutes("");
    setMessage("Spiel zum Saisonplan hinzugefügt.");
  }

  function updateGame(gameId: string, patch: Partial<LeagueScheduleEntry>) {
    const previous = bundle.schedule.find((entry) => entry.id === gameId);
    if (!previous) return;
    let updated = { ...previous, ...patch };
    const becomesUnavailable = updated.status === "cancelled" || updated.status === "postponed";
    const moved = previous.date !== updated.date || previous.kind !== updated.kind;
    if (previous.syncedAt && (moved || becomesUnavailable)) {
      cleanupSyncedGame(previous);
      updated = { ...updated, syncedAt: undefined };
      if (!becomesUnavailable) {
        const opponentId = updated.homeTeamId === LEAGUE_OWN_TEAM_ID ? updated.awayTeamId : updated.homeTeamId;
        const opponent = bundle.opponents.find((team) => team.id === opponentId);
        updated = syncLeagueEntryToPlan(updated, opponent);
      }
    } else if (previous.syncedAt && Object.keys(patch).some((key) => ["startTime", "notes", "awards", "venueName", "venueAddress", "meetingTime", "travelMinutes"].includes(key))) {
      const opponentId = updated.homeTeamId === LEAGUE_OWN_TEAM_ID ? updated.awayTeamId : updated.homeTeamId;
      const opponent = bundle.opponents.find((team) => team.id === opponentId);
      updated = syncLeagueEntryToPlan(updated, opponent);
    }
    persist({ ...bundle, schedule: bundle.schedule.map((entry) => entry.id === gameId ? updated : entry) });
  }

  function updateGameScore(entry: LeagueScheduleEntry, side: "home" | "away", rawValue: string) {
    const value = nullableInteger(rawValue);
    const otherValue = side === "home" ? entry.awayScore : entry.homeScore;
    updateGame(entry.id, {
      [side === "home" ? "homeScore" : "awayScore"]: value,
      status: value != null && otherValue != null ? "final" : entry.status === "final" ? "scheduled" : entry.status,
    });
  }

  function updatePlayerStat(game: LeagueScheduleEntry, playerId: string, key: NumericStatKey, value: string) {
    const existing = game.playerStats?.find((line) => line.playerId === playerId) ?? emptyPlayerStatLine(playerId);
    const nextLine = { ...existing, [key]: key === "minutes" ? nullableNumber(value) : nullableInteger(value) };
    const nextLines = [...(game.playerStats?.filter((line) => line.playerId !== playerId) ?? []), nextLine];
    updateGame(game.id, { playerStats: nextLines });
  }

  function updateAttendance(entry: LeagueScheduleEntry, playerId: string, patch: { status?: LeagueAttendanceStatus; expectedStarter?: boolean }) {
    const previous = entry.attendance?.find((item) => item.playerId === playerId) ?? { playerId, status: "pending" as const };
    const next = { ...previous, ...patch };
    updateGame(entry.id, {
      attendance: [...(entry.attendance?.filter((item) => item.playerId !== playerId) ?? []), next],
    });
  }

  function cleanupSyncedGame(entry: LeagueScheduleEntry, removedIds = new Set([entry.id])) {
    deleteGameStatForLeagueGame(entry.id, entry.date, entry.kind);
    const hasReplacement = bundle.schedule.some((candidate) =>
      !removedIds.has(candidate.id) &&
      candidate.syncedAt &&
      candidate.date === entry.date &&
      candidate.kind === entry.kind,
    );
    if (!hasReplacement) removeManualGameForDate(entry.date, entry.kind);
  }

  function handleSyncEntry(entry: LeagueScheduleEntry) {
    if (!gameInvolvesOwnTeam(entry)) return setMessage("Nur Spiele des eigenen Teams werden in den persönlichen Wochenplan übernommen.");
    if (entry.status === "cancelled" || entry.status === "postponed") return setMessage("Abgesagte oder verschobene Spiele können nicht synchronisiert werden.");
    const opponentId = entry.homeTeamId === LEAGUE_OWN_TEAM_ID ? entry.awayTeamId : entry.homeTeamId;
    const opponent = bundle.opponents.find((team) => team.id === opponentId);
    const synced = syncLeagueEntryToPlan(entry, opponent);
    updateGame(entry.id, synced);
    setMessage(`${formatDateLabel(entry.date)} in den Wochenplan übernommen.`);
  }

  function handleSyncAllUpcoming() {
    if (!activeSeason) return;
    const count = syncUpcomingLeagueSchedule(activeSeason.id, getTodayDateKey());
    refresh();
    setMessage(count > 0 ? `${count} eigene Spiele in den Wochenplan übernommen.` : "Keine anstehenden eigenen Spiele.");
  }

  async function deleteGame(gameId: string) {
    const confirmed = await appDialog.confirm({ message: "Spiel aus dem Saisonplan entfernen?", confirmLabel: "Entfernen", tone: "danger" });
    if (!confirmed) return;
    const entry = bundle.schedule.find((game) => game.id === gameId);
    if (entry?.syncedAt) cleanupSyncedGame(entry);
    persist({ ...bundle, schedule: bundle.schedule.filter((entry) => entry.id !== gameId) });
  }

  async function readCsvFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage("Die CSV-Datei darf maximal 2 MB groß sein.");
      return;
    }
    const preview = parseLeagueScheduleCsv(await file.text());
    setCsvPreview(preview);
    setCsvFileName(file.name);
    setMessage(preview.rows.length > 0 ? `${preview.rows.length} gültige CSV-Zeilen erkannt.` : preview.errors[0] ?? "Keine Spiele erkannt.");
  }

  function confirmCsvImport() {
    if (!activeSeason || !csvPreview || csvPreview.rows.length === 0) return;
    const result = applyLeagueScheduleCsv(bundle, activeSeason.id, csvPreview);
    persist(result.bundle);
    setCsvPreview(null);
    setCsvFileName("");
    setMessage(`${result.imported} Spiele importiert${result.createdOpponentNames.length ? ` · ${result.createdOpponentNames.length} neue Teams angelegt` : ""}${result.skippedLines.length ? ` · ${result.skippedLines.length} Dubletten übersprungen` : ""}.`);
  }

  function exportCalendar() {
    if (!activeSeason || ownSchedule.length === 0) return setMessage("Keine eigenen Saisonspiele für den Kalender vorhanden.");
    const resolveTeamName = (id: string | undefined) => teamById.get(id ?? "")?.name ?? "";
    const content = buildLeagueCalendarIcs(ownSchedule, resolveTeamName);
    const filename = `${activeSeason.name.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "saison"}-spielplan.ics`;
    downloadLeagueCalendar(filename, content);
    setMessage(`${ownSchedule.length} eigene Spiele als iCal exportiert.`);
  }

  function downloadCsvTemplate() {
    const content = LEAGUE_CSV_TEMPLATE.replaceAll("Mein Team", bundle.ownTeam.name);
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "liga-spielplan-vorlage.csv";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <main className="app-container animate-in">
      <PageHeader eyebrow={t("liga.eyebrow")} eyebrowTone="brand" title={t("liga.title")} subtitle="Saisons, Teams, Spieler, Ergebnisse und Playoff-Rennen an einem Ort." />

      <div className="mt-3">
        <TopSubTabs variant="team-liga" items={[{ labelKey: "tabs.team", href: "/team" }, { labelKey: "tabs.liga", href: "/liga" }]} />
      </div>

      {message ? (
        <div className="mt-3 app-card--accent-cyan flex items-center justify-between gap-2" role="status">
          <p className="text-sm text-strong">{message}</p>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setMessage(null)}>{t("common.close")}</button>
        </div>
      ) : null}

      <div className="segmented-wrap mt-4 overflow-x-auto">
        <div className="segmented min-w-max">
          {([
            ["schedule", "Spiele"],
            ["standings", "Tabelle"],
            ["teams", "Teams"],
            ["players", "Spieler"],
            ["season", "Saison"],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" className={`segmented__btn ${tab === id ? "segmented__btn--active" : ""}`} aria-pressed={tab === id} onClick={() => handleTabChange(id)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>Aktive Saison:</span>
        <strong className="text-strong">{activeSeason?.name ?? "Noch keine Saison"}</strong>
        {activeSeason ? <span className="chip">{teams.length} Teams</span> : null}
      </div>

      {tab === "season" ? (
        <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <form className="app-card space-y-3" onSubmit={handleCreateSeason}>
            <p className="section-eyebrow">Neue Saison</p>
            <input value={seasonName} onChange={(event) => setSeasonName(event.target.value)} placeholder="z. B. Regionalliga 2026/27" className="input" required />
            <div className="grid gap-3 sm:grid-cols-2">
              <ModernDateInput value={seasonStartDate} onChange={setSeasonStartDate} label="Saisonstart" max={seasonEndDate || undefined} />
              <ModernDateInput value={seasonEndDate} onChange={setSeasonEndDate} label="Saisonende" min={seasonStartDate || undefined} />
            </div>
            <textarea value={seasonNotes} onChange={(event) => setSeasonNotes(event.target.value)} placeholder="Ziele, Modus und Saisonnotizen" rows={3} className="textarea" />
            <button type="submit" className="btn btn-primary btn-sm">Saison anlegen</button>
          </form>
          <div className="app-card">
            <p className="section-eyebrow">Saisons</p>
            {bundle.seasons.length === 0 ? <p className="mt-3 text-sm text-muted">Lege deine erste Saison an.</p> : (
              <GradientFadeList className="mt-3" items={bundle.seasons} listClassName="space-y-2" getKey={(season) => season.id} renderItem={(season) => (
                <div className="list-card flex items-center justify-between gap-2">
                  <div><p className="list-card__title">{season.name}</p>{season.startDate || season.endDate ? <p className="list-card__meta">{season.startDate ? formatDateLabel(season.startDate) : "Start offen"} – {season.endDate ? formatDateLabel(season.endDate) : "Ende offen"}</p> : null}{season.notes ? <p className="list-card__meta">{season.notes}</p> : null}</div>
                  <button type="button" className={`btn btn-xs ${bundle.activeSeasonId === season.id ? "btn-primary" : "btn-outline"}`} onClick={() => persist({ ...bundle, activeSeasonId: season.id })}>{bundle.activeSeasonId === season.id ? "Aktiv" : "Aktivieren"}</button>
                </div>
              )} />
            )}
          </div>
        </section>
      ) : null}

      {tab === "teams" ? (
        <section className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <form className="app-card space-y-3" onSubmit={(event) => { event.preventDefault(); const name = bundle.ownTeam.name.trim(); if (name) persist({ ...bundle, ownTeam: { ...bundle.ownTeam, name } }); setMessage("Name des eigenen Teams gespeichert."); }}>
              <p className="section-eyebrow">Eigenes Team</p>
              <label className="block"><span className="input-label">Teamname</span><input value={bundle.ownTeam.name} onChange={(event) => setBundle({ ...bundle, ownTeam: { ...bundle.ownTeam, name: event.target.value } })} className="input" /></label>
              <button type="submit" className="btn btn-outline btn-sm">Teamname speichern</button>
            </form>
            <div className="app-card">
              <p className="section-eyebrow">Team wiederverwenden</p>
              <p className="mt-1 text-sm text-muted">Ein bestehender Gegner kann mehreren Saisons zugeordnet werden.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <select value={attachOpponentId} onChange={(event) => setAttachOpponentId(event.target.value)} className="select flex-1"><option value="">Gespeicherten Gegner wählen</option>{unassignedOpponents.map((opponent) => <option key={opponent.id} value={opponent.id}>{opponent.name}</option>)}</select>
                <button type="button" className="btn btn-cyan btn-sm" disabled={!activeSeason || !attachOpponentId} onClick={attachOpponent}>Zur Saison</button>
              </div>
            </div>
          </div>

          <form className="app-card space-y-3" onSubmit={handleSaveOpponent}>
            <div className="flex items-center justify-between gap-2"><p className="section-eyebrow">{opponentEditId ? "Gegner bearbeiten" : "Neuen Gegner anlegen"}</p>{opponentEditId ? <button type="button" className="btn btn-ghost btn-xs" onClick={resetOpponentForm}>Abbrechen</button> : null}</div>
            <div className="grid gap-3 md:grid-cols-2">
              <label><span className="input-label">Teamname</span><input value={opponentName} onChange={(event) => setOpponentName(event.target.value)} placeholder="Teamname" className="input" required /></label>
              <label><span className="input-label">Verteidigung</span><input value={opponentDefense} onChange={(event) => setOpponentDefense(event.target.value)} placeholder="Zone, Press, Man-to-Man …" className="input" /></label>
              <label><span className="input-label">Stärken</span><textarea value={opponentStrengths} onChange={(event) => setOpponentStrengths(event.target.value)} rows={2} className="textarea" /></label>
              <label><span className="input-label">Schwächen</span><textarea value={opponentWeaknesses} onChange={(event) => setOpponentWeaknesses(event.target.value)} rows={2} className="textarea" /></label>
            </div>
            <div className="flex flex-wrap gap-2">{OPPONENT_STYLE_TAGS.map((tag) => <button key={tag} type="button" className={`chip ${opponentStyles.includes(tag) ? "chip-active" : ""}`} onClick={() => setOpponentStyles((current) => toggleOpponentStyle(current, tag))}>{OPPONENT_STYLE_LABELS[tag]}</button>)}</div>
            <textarea value={opponentNotes} onChange={(event) => setOpponentNotes(event.target.value)} placeholder="Scouting-Notizen" rows={2} className="textarea" />
            <button type="submit" className="btn btn-primary btn-sm">{opponentEditId ? "Änderungen speichern" : "Gegner speichern"}</button>
          </form>

          <div className="app-card">
            <p className="section-eyebrow">Teams dieser Saison</p>
            {opponents.length === 0 ? <p className="mt-3 text-sm text-muted">Noch keine Gegner zugeordnet.</p> : (
              <GradientFadeList className="mt-3" items={opponents} listClassName="grid gap-2 md:grid-cols-2" getKey={(opponent) => opponent.id} renderItem={(opponent) => (
                <article className="list-card">
                  <div className="flex items-start justify-between gap-2"><div><p className="list-card__title">{opponent.name}</p><p className="list-card__meta">In {opponent.seasonIds.length} Saison{opponent.seasonIds.length === 1 ? "" : "s"}</p></div><span className="chip">{playersForTeam(bundle, opponent.id).length} Spieler</span></div>
                  {opponent.strengths ? <p className="list-card__meta mt-2">Stärken: {opponent.strengths}</p> : null}
                  {opponent.bestPlayerIds.length > 0 ? <p className="list-card__meta">Top-Spieler: {opponent.bestPlayerIds.map((id) => playerById.get(id)?.name).filter(Boolean).join(", ")}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-1.5"><button type="button" className="btn btn-outline btn-xs" onClick={() => beginOpponentEdit(opponent)}>Bearbeiten</button><button type="button" className="btn btn-ghost btn-xs" onClick={() => detachOpponent(opponent)}>Aus Saison</button><button type="button" className="btn btn-danger-outline btn-xs" onClick={() => void deleteOpponentGlobally(opponent)}>Dauerhaft löschen</button></div>
                </article>
              )} />
            )}
          </div>
        </section>
      ) : null}

      {tab === "players" ? (
        <section className="mt-4 space-y-4">
          <form className="app-card league-game-form space-y-3" onSubmit={handleSavePlayer}>
            <div className="flex items-center justify-between gap-2"><div><p className="section-eyebrow">Kader</p><h2 className="section-title mt-1">{playerEditId ? "Spieler bearbeiten" : "Spieler hinzufügen"}</h2></div>{playerEditId ? <button type="button" className="btn btn-ghost btn-xs" onClick={resetPlayerForm}>Abbrechen</button> : null}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="league-game-field"><span className="input-label">Team</span><select value={playerTeamId} onChange={(event) => setPlayerTeamId(event.target.value)} className="select league-game-control league-roster-team-select">{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
              <label className="league-game-field"><span className="input-label">Name</span><input value={playerName} onChange={(event) => setPlayerName(event.target.value)} className="input league-game-control" required /></label>
              <label className="league-game-field"><span className="input-label">Trikotnummer</span><input value={playerNumber} onChange={(event) => setPlayerNumber(event.target.value)} className="input league-game-control" placeholder="z. B. 23" /></label>
              <label className="league-game-field"><span className="input-label">Position</span><input value={playerPosition} onChange={(event) => setPlayerPosition(event.target.value)} className="input league-game-control" placeholder="PG, SG, SF …" /></label>
            </div>
            <textarea value={playerNotes} onChange={(event) => setPlayerNotes(event.target.value)} className="textarea" rows={2} placeholder="Rolle, Stärken, Matchup …" />
            <label className="flex items-center gap-2 text-sm text-strong"><input type="checkbox" checked={playerIsBest} onChange={(event) => setPlayerIsBest(event.target.checked)} /> Als einen der besten Spieler markieren</label>
            <button type="submit" className="btn btn-primary btn-sm">{playerEditId ? "Spieler speichern" : "Zum Kader hinzufügen"}</button>
          </form>

          <div className="grid gap-4 lg:grid-cols-2">{teams.map((team) => {
            const roster = playersForTeam(bundle, team.id);
            return <section key={team.id} className="app-card"><div className="flex items-center justify-between gap-2"><h2 className="section-title">{team.name}</h2><span className="chip">{roster.length} Spieler</span></div>{roster.length === 0 ? <p className="mt-3 text-sm text-muted">Noch kein Spieler im Kader.</p> : <div className="mt-3 space-y-2">{roster.map((player) => { const totals = playerSeasonSummaries.get(player.id); return <article key={player.id} className="list-card"><div className="flex items-start justify-between gap-2"><div><p className="list-card__title">{player.jerseyNumber ? `#${player.jerseyNumber} · ` : ""}{player.name} {playerIsMarkedBest(player) ? <span title="Top-Spieler">⭐</span> : null}</p><p className="list-card__meta">{player.position || "Position offen"}{player.notes ? ` · ${player.notes}` : ""}</p></div><div className="flex gap-1"><button type="button" className="btn btn-outline btn-xs" onClick={() => beginPlayerEdit(player)}>Bearbeiten</button><button type="button" className="btn btn-danger-outline btn-xs" onClick={() => void deletePlayer(player)}>Löschen</button></div></div>{totals && totals.appearances > 0 ? <div className="mt-3 flex flex-wrap gap-1.5"><span className="chip">{totals.appearances} SP</span><span className="chip">{totals.points} PTS</span><span className="chip">{totals.minutes} MIN</span><span className="chip">{totals.assists} AST</span><span className="chip">{totals.rebounds} REB</span><span className="chip">{totals.steals} STL</span>{totals.mvpAwards > 0 ? <span className="chip chip-active">{totals.mvpAwards}× MVP</span> : null}</div> : <p className="mt-2 text-xs text-faint">Noch keine Spielwerte in dieser Saison.</p>}</article>; })}</div>}</section>;
          })}</div>
        </section>
      ) : null}

      {tab === "standings" ? (
        <section className="mt-4 app-card overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="section-eyebrow">Live-Tabelle</p><h2 className="section-title mt-1">{activeSeason?.name ?? "Saison"}</h2><p className="mt-1 text-xs text-muted">Sieg = 2 Punkte · Niederlage = 1 Punkt · Bei Gleichstand zählen direkter Vergleich, Korbdifferenz und erzielte Punkte.</p></div><div className="flex flex-wrap gap-1.5 text-xs"><span className="league-legend league-legend--playoffs">1–8 Playoffs</span><span className="league-legend league-legend--stay">9–10 Liga</span><span className="league-legend league-legend--relegation">11–12 Abstieg</span></div></div>
          <div className="league-table-wrap mt-4"><table className="league-table"><thead><tr><th>#</th><th>Team</th><th>SP</th><th>S</th><th>N</th><th>PF</th><th>PA</th><th>Diff</th><th>PKT</th><th>Status</th></tr></thead><tbody>{standings.map((row) => <tr key={row.teamId} className={`league-row league-row--${getStandingZone(row.position)} ${row.teamId === LEAGUE_OWN_TEAM_ID ? "league-row--own" : ""}`}><td className="font-extrabold">{row.position}</td><td><span className="font-semibold text-strong">{row.teamName}</span>{row.teamId === LEAGUE_OWN_TEAM_ID ? <span className="ml-2 text-xs text-brand">Dein Team</span> : null}</td><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.pointsFor}</td><td>{row.pointsAgainst}</td><td>{row.difference > 0 ? `+${row.difference}` : row.difference}</td><td className="font-extrabold">{row.tablePoints}</td><td><span className={`league-status league-status--${getStandingZone(row.position)}`}>{zoneLabel(row.position)}</span></td></tr>)}</tbody></table></div>
          {standings.length < 12 ? <p className="mt-3 text-xs text-muted">Die Zonen 9–12 werden sichtbar, sobald mindestens zwölf Teams in der Saison sind.</p> : null}
        </section>
      ) : null}

      {tab === "schedule" ? (
        <section className="mt-4 space-y-4">
          <form className="app-card league-game-form space-y-3" onSubmit={handleAddGame}>
            <div><p className="section-eyebrow">Neues Spiel</p><h2 className="section-title mt-1">Alle Saisonspiele erfassen</h2><p className="mt-1 text-sm text-muted">Auch Partien zwischen Gegnern fließen in die Tabelle ein. Nur eigene Spiele werden in deinen Wochenplan synchronisiert.</p></div>
            <div className="league-game-form__controls grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <ModernDateInput value={gameDate} onChange={setGameDate} label="Datum" required className="league-game-field" controlClassName="league-game-control" />
              <ModernTimeInput value={gameTime} onChange={setGameTime} label="Spielzeit" required className="league-game-field" controlClassName="league-game-control" />
              <label className="league-game-field"><span className="input-label">Art</span><select value={gameKind} onChange={(event) => setGameKind(event.target.value as LeagueGameKind)} className="select league-game-control"><option value="game">Ligaspiel</option><option value="game_training">Test-/Trainingsspiel</option></select></label>
              <label className="league-game-field"><span className="input-label">Heimteam</span><select value={homeTeamId} onChange={(event) => setHomeTeamId(event.target.value)} className="select league-game-control" required>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
              <label className="league-game-field"><span className="input-label">Auswärtsteam</span><select value={awayTeamId} onChange={(event) => setAwayTeamId(event.target.value)} className="select league-game-control" required><option value="">Team wählen</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
            </div>
            <div className="league-game-form__controls grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="league-game-field"><span className="input-label">Spielort / Halle</span><input value={gameVenue} onChange={(event) => setGameVenue(event.target.value)} className="input league-game-control" placeholder="z. B. Sporthalle Mitte" /></label>
              <label className="league-game-field md:col-span-2"><span className="input-label">Hallenadresse</span><input value={gameAddress} onChange={(event) => setGameAddress(event.target.value)} className="input league-game-control" placeholder="Straße, PLZ, Ort" /></label>
              <ModernTimeInput value={gameMeetingTime} onChange={setGameMeetingTime} label="Treffpunkt" className="league-game-field" controlClassName="league-game-control" />
              <label className="league-game-field"><span className="input-label">Anfahrt (Min.)</span><input type="number" min="0" step="1" value={gameTravelMinutes} onChange={(event) => setGameTravelMinutes(event.target.value)} className="input league-game-control" placeholder="z. B. 35" /></label>
            </div>
            <textarea value={gameNotes} onChange={(event) => setGameNotes(event.target.value)} placeholder="Vorbereitung oder Spielnotiz" rows={2} className="textarea" />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <button type="submit" className="btn btn-primary league-game-action" disabled={!activeSeason || teams.length < 2}>Spiel hinzufügen</button>
            </div>
          </form>

          <div className="app-card league-import-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="section-eyebrow">Spielplan importieren</p>
                <h2 className="section-title mt-1">CSV mit Vorschau</h2>
                <p className="mt-1 text-xs text-muted">Erkannte, noch nicht vorhandene Teams werden als wiederverwendbare Gegner angelegt. Dubletten werden übersprungen.</p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={downloadCsvTemplate}>CSV-Vorlage</button>
            </div>
            <label className="league-file-picker mt-4">
              <span className="league-file-picker__icon" aria-hidden>CSV</span>
              <span><strong>{csvFileName || "Spielplan-Datei auswählen"}</strong><small>CSV, maximal 2 MB · Komma oder Semikolon</small></span>
              <input type="file" accept=".csv,text/csv" onChange={(event) => void readCsvFile(event.target.files?.[0])} />
            </label>
            {csvPreview ? (
              <div className="league-import-preview mt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-strong">{csvPreview.rows.length} gültige Spiele</p>
                  <button type="button" className="btn btn-primary btn-sm" disabled={!activeSeason || csvPreview.rows.length === 0} onClick={confirmCsvImport}>Jetzt importieren</button>
                </div>
                {csvPreview.rows.length > 0 ? <div className="mt-2 space-y-1">{csvPreview.rows.slice(0, 5).map((row) => <p key={row.line} className="text-xs text-muted">Zeile {row.line}: {row.date} · {row.startTime} · {row.homeTeam} – {row.awayTeam}</p>)}</div> : null}
                {csvPreview.rows.length > 5 ? <p className="mt-1 text-xs text-faint">… und {csvPreview.rows.length - 5} weitere</p> : null}
                {csvPreview.errors.length > 0 ? <div className="mt-2 hint-warning">{csvPreview.errors.slice(0, 4).map((error) => <p key={error}>{error}</p>)}</div> : null}
              </div>
            ) : null}
          </div>

          <div className="app-card">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="section-eyebrow">Saison-Spielplan</p><h2 className="section-title mt-1">Chronologischer Spielplan</h2><p className="mt-1 text-xs text-muted">{schedule.length} Spiele · {schedule.filter(isCompletedLeagueGame).length} gültige Ergebnisse</p></div><div className="flex flex-wrap gap-2"><button type="button" className="btn btn-cyan btn-sm" onClick={exportCalendar}>iCal exportieren</button><button type="button" className="btn btn-outline btn-sm" onClick={handleSyncAllUpcoming}>Eigene anstehende → Wochenplan</button></div></div>
            {schedule.length === 0 ? <p className="mt-3 text-sm text-muted">Noch keine Spiele geplant.</p> : (
              <div className="league-fixture-board mt-4">{scheduleDays.map((day) => {
                const dateParts = formatScheduleDateParts(day.date);
                return <section key={day.date} className="league-fixture-day">
                  <div className="league-fixture-day__date">
                    <span>{dateParts.weekday}</span>
                    <strong>{dateParts.day}</strong>
                    <span>{dateParts.month}</span>
                  </div>
                  <div className="league-fixture-day__games">{day.games.map((entry) => {
                    const home = teamById.get(entry.homeTeamId ?? "");
                    const away = teamById.get(entry.awayTeamId ?? "");
                    const finished = isCompletedLeagueGame(entry);
                    const attendance = entry.attendance ?? [];
                    return <article key={entry.id} className={`league-fixture league-fixture--${entry.status ?? "scheduled"}`}><div className="league-fixture__time"><strong>{entry.startTime ?? "–:–"}</strong><span>{entry.meetingTime ? `Treffen ${entry.meetingTime}` : entry.startTime ? "Uhr" : "Zeit offen"}</span></div><div className="league-fixture__teams"><span>{home?.name ?? "Heimteam"}</span><span>{away?.name ?? "Auswärtsteam"}</span>{entry.venueName ? <small>{entry.venueName}{entry.travelMinutes != null ? ` · ${entry.travelMinutes} Min. Anfahrt` : ""}</small> : null}</div><div className={`league-fixture__result ${finished ? "league-fixture__result--final" : ""}`}><strong>{finished ? `${entry.homeScore} : ${entry.awayScore}` : gameStatusLabel(entry.status)}</strong><span>{entry.kind === "game" ? "Liga" : "Testspiel"}{attendance.length ? ` · ${attendance.filter((item) => item.status === "yes").length} Zusagen` : ""}</span></div></article>;
                  })}</div>
                </section>;
              })}</div>
            )}
          </div>

          <div className="app-card">
            <div><p className="section-eyebrow">Spiele verwalten</p><p className="mt-1 text-xs text-muted">Ergebnisse, Auszeichnungen und Spielerwerte je Partie ergänzen.</p></div>
            {schedule.length === 0 ? <p className="mt-3 text-sm text-muted">Noch keine Spiele zum Bearbeiten vorhanden.</p> : (
              <div className="mt-4 space-y-3">{schedule.map((entry) => {
                const home = teamById.get(entry.homeTeamId ?? "");
                const away = teamById.get(entry.awayTeamId ?? "");
                const gamePlayers = bundle.players.filter((player) => player.teamId === entry.homeTeamId || player.teamId === entry.awayTeamId);
                const validationIssues = validateLeagueGame(entry, gamePlayers);
                const googleCalendarUrl = buildGoogleCalendarUrl(entry, (id) => teamById.get(id ?? "")?.name ?? "");
                return <details key={entry.id} className="league-game-card"><summary className="league-game-card__summary"><div><p className="font-bold text-strong">{home?.name ?? "Heimteam"} <span className="league-score">{entry.homeScore ?? "–"} : {entry.awayScore ?? "–"}</span> {away?.name ?? "Auswärtsteam"}</p><p className="mt-1 text-xs text-muted">{formatGameDateTimeLabel(entry.date, entry.startTime)} · {entry.kind === "game" ? "Ligaspiel" : "Test-/Trainingsspiel"} · {gameStatusLabel(entry.status)}{entry.syncedAt ? " · Im Wochenplan" : ""}</p></div><span className={`chip ${validationIssues.length ? "chip-warning" : ""}`}>{validationIssues.length ? `${validationIssues.length} Hinweise` : "Details"}</span></summary>
                  <div className="league-game-card__body league-game-form">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                      <ModernDateInput value={entry.date} onChange={(value) => updateGame(entry.id, { date: value })} label="Datum" className="league-game-field" controlClassName="league-game-control" />
                      <ModernTimeInput value={entry.startTime ?? ""} onChange={(value) => updateGame(entry.id, { startTime: value || undefined })} label="Spielzeit" className="league-game-field" controlClassName="league-game-control" />
                      <label className="league-game-field"><span className="input-label">Status</span><select value={entry.status ?? "scheduled"} onChange={(event) => updateGame(entry.id, { status: event.target.value as LeagueGameStatus })} className="select league-game-control"><option value="scheduled">Geplant</option><option value="live">Live</option><option value="postponed">Verschoben</option><option value="cancelled">Abgesagt</option><option value="final">Final</option></select></label>
                      <label className="league-game-field"><span className="input-label">Heimteam Punkte</span><input type="number" min="0" step="1" value={entry.homeScore ?? ""} onChange={(event) => updateGameScore(entry, "home", event.target.value)} className="input league-game-control" /></label>
                      <label className="league-game-field"><span className="input-label">Auswärtsteam Punkte</span><input type="number" min="0" step="1" value={entry.awayScore ?? ""} onChange={(event) => updateGameScore(entry, "away", event.target.value)} className="input league-game-control" /></label>
                      <label className="league-game-field"><span className="input-label">Bester Spieler / MVP</span><select value={entry.bestPlayerId ?? ""} onChange={(event) => updateGame(entry.id, { bestPlayerId: event.target.value || undefined })} className="select league-game-control"><option value="">Nicht gewählt</option>{gamePlayers.map((player) => <option key={player.id} value={player.id}>{player.name} · {teamById.get(player.teamId)?.name}</option>)}</select></label>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <label className="league-game-field"><span className="input-label">Spielort / Halle</span><input value={entry.venueName ?? ""} onChange={(event) => updateGame(entry.id, { venueName: event.target.value })} className="input league-game-control" /></label>
                      <label className="league-game-field sm:col-span-2"><span className="input-label">Adresse</span><input value={entry.venueAddress ?? ""} onChange={(event) => updateGame(entry.id, { venueAddress: event.target.value })} className="input league-game-control" /></label>
                      <ModernTimeInput value={entry.meetingTime ?? ""} onChange={(value) => updateGame(entry.id, { meetingTime: value || undefined })} label="Treffpunkt" className="league-game-field" controlClassName="league-game-control" />
                      <label className="league-game-field"><span className="input-label">Anfahrt (Min.)</span><input type="number" min="0" step="1" value={entry.travelMinutes ?? ""} onChange={(event) => updateGame(entry.id, { travelMinutes: nullableInteger(event.target.value) })} className="input league-game-control" /></label>
                    </div>
                    {validationIssues.length > 0 ? <div className="hint-warning mt-3" role="status"><strong>Bitte prüfen:</strong>{validationIssues.map((issue) => <p key={issue}>{issue}</p>)}</div> : null}
                    <div className="mt-3 grid gap-3 md:grid-cols-2"><label><span className="input-label">Sonstiges / Auszeichnungen</span><textarea value={entry.awards ?? ""} onChange={(event) => updateGame(entry.id, { awards: event.target.value })} rows={2} className="textarea" placeholder="Viele Dreier, Game-Winner, Career High …" /></label><label><span className="input-label">Spielnotiz</span><textarea value={entry.notes ?? ""} onChange={(event) => updateGame(entry.id, { notes: event.target.value })} rows={2} className="textarea" /></label></div>
                    {gameInvolvesOwnTeam(entry) && ownTeamPlayers.length > 0 ? <div className="league-attendance mt-4"><div><p className="section-eyebrow">Kaderstatus</p><h3 className="section-title mt-1">Zu-/Absagen & erwartete Start-Five</h3></div><div className="mt-3 grid gap-2 md:grid-cols-2">{ownTeamPlayers.map((player) => { const response = entry.attendance?.find((item) => item.playerId === player.id) ?? { playerId: player.id, status: "pending" as LeagueAttendanceStatus }; return <div key={player.id} className="league-attendance-row"><div><strong>{player.jerseyNumber ? `#${player.jerseyNumber} · ` : ""}{player.name}</strong><small>{player.position || "Position offen"}</small></div><select aria-label={`Teilnahme ${player.name}`} value={response.status} onChange={(event) => updateAttendance(entry, player.id, { status: event.target.value as LeagueAttendanceStatus })} className="select app-unified-control"><option value="pending">Offen</option><option value="yes">Zusage</option><option value="maybe">Vielleicht</option><option value="no">Absage</option></select><label className="league-starter-check"><input type="checkbox" checked={Boolean(response.expectedStarter)} disabled={response.status === "no"} onChange={(event) => updateAttendance(entry, player.id, { expectedStarter: event.target.checked })} /><span>Starter</span></label></div>; })}</div><p className="mt-2 text-xs text-muted">{entry.attendance?.filter((item) => item.status === "yes").length ?? 0} Zusagen · {entry.attendance?.filter((item) => item.status === "maybe").length ?? 0} vielleicht · {entry.attendance?.filter((item) => item.expectedStarter && item.status !== "no").length ?? 0} Starter</p></div> : null}
                    {gamePlayers.length > 0 ? <div className="mt-4"><div className="flex items-center justify-between gap-2"><p className="section-eyebrow">Spieler-Boxscore</p><p className="text-xs text-muted">Werte werden beim Verlassen des Feldes gespeichert</p></div><div className="league-table-wrap mt-2"><table className="league-table league-player-table"><thead><tr><th>Spieler</th>{PLAYER_STAT_COLUMNS.map((column) => <th key={column.key} title={column.title}>{column.label}</th>)}</tr></thead><tbody>{gamePlayers.map((player) => { const line = entry.playerStats?.find((item) => item.playerId === player.id) ?? emptyPlayerStatLine(player.id); return <tr key={player.id}><td><span className="font-semibold text-strong">{player.name}</span><span className="block text-[10px] text-muted">{teamById.get(player.teamId)?.name}</span></td>{PLAYER_STAT_COLUMNS.map((column) => <td key={column.key}><input aria-label={`${player.name} ${column.title}`} type="number" min="0" step={column.key === "minutes" ? "0.1" : "1"} defaultValue={line[column.key] ?? ""} onBlur={(event) => updatePlayerStat(entry, player.id, column.key, event.target.value)} className="league-stat-input" /></td>)}</tr>; })}</tbody></table></div></div> : <p className="mt-4 hint-warning">Füge unter „Spieler“ Kader hinzu, um individuelle Punkte, Minuten und weitere Stats einzutragen.</p>}
                    <div className="mt-4 flex flex-wrap gap-2">{entry.status !== "cancelled" && entry.status !== "postponed" ? <Link href={`/liga/live/${encodeURIComponent(entry.id)}`} className="btn btn-primary btn-xs">{entry.status === "live" ? "Live fortsetzen" : entry.status === "final" ? "Live-Feed ansehen" : "Live-Modus starten"}</Link> : null}{gameInvolvesOwnTeam(entry) ? <><button type="button" className="btn btn-outline btn-xs" onClick={() => handleSyncEntry(entry)}>→ Wochenplan</button><Link href={`/game-track?date=${encodeURIComponent(entry.date)}&context=${entry.kind}`} className="btn btn-violet btn-xs">Persönliche Stats</Link><a href={googleCalendarUrl} target="_blank" rel="noreferrer" className="btn btn-cyan btn-xs">Google Kalender</a></> : null}<button type="button" className="btn btn-danger-outline btn-xs" onClick={() => void deleteGame(entry.id)}>Spiel entfernen</button></div>
                  </div>
                </details>;
              })}</div>
            )}
          </div>
        </section>
      ) : null}

      <section className="mt-5 app-card--accent-violet">
        <p className="section-eyebrow">Nächste sinnvolle Ausbaustufe</p>
        <p className="mt-2 text-sm text-muted">Import eines kompletten Spielplans, direkter Vergleich zweier Teams, Spieler-Saisonmittel, Verletzungsstatus und automatische Head-to-Head-Tiebreaker.</p>
      </section>
    </main>
  );
}
