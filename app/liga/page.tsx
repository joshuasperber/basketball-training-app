"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  connectLeagueOwnTeam,
  createEmptyLeagueBundle,
  createId,
  emptyPlayerStatLine,
  gameInvolvesOwnTeam,
  getActiveLeague,
  getActiveSeason,
  getStandingZone,
  groupLeagueScheduleByDay,
  findDuplicateLeagueGame,
  isCompletedLeagueGame,
  loadLeagueBundle,
  normalizeLeagueBundle,
  opponentsForSeason,
  playersForTeam,
  saveLeagueBundle,
  scheduleForSeason,
  seasonsForLeague,
  syncLeagueEntryToPlan,
  syncUpcomingLeagueSchedule,
  teamsForSeason,
  validateLeagueGame,
  type LeagueAttendanceStatus,
  type LeagueBundle,
  type LeagueGameKind,
  type LeagueGameStatus,
  type LeagueDefinition,
  type LeagueOpponent,
  type LeaguePlayer,
  type LeaguePlayerStatLine,
  type LeagueScheduleEntry,
  type LeagueSeason,
} from "@/lib/league";
import { loadCachedTeamList, saveCachedTeamList } from "@/lib/team-local-cache";
import type { TeamSummary } from "@/lib/team-types";
import { deleteGameStatForLeagueGame } from "@/lib/game-stats";
import { removeManualGameForDate } from "@/lib/plan-day-actions";
import {
  buildGoogleCalendarUrl,
  buildLeagueCalendarIcs,
  downloadLeagueCalendar,
} from "@/lib/league-calendar";
import {
  applyLeagueScheduleCsv,
  buildLeagueScheduleCsv,
  LEAGUE_CSV_TEMPLATE,
  parseLeagueScheduleCsv,
  type LeagueCsvImportPlan,
} from "@/lib/league-csv";
import { getTodayDateKey } from "@/lib/workout";
import { loadLigaTab, persistLigaTab, type LigaTab } from "@/lib/ui-navigation-state";
import { useT } from "@/lib/i18n/I18nProvider";
import { normalizeTeamOpponentName } from "@/lib/team-league-opponents";
import {
  formatLeagueHistoryDate,
  normalizeLeagueHistory,
  summarizeLeagueChange,
  type LeagueChangeEntry,
  type SharedLeagueConflict,
} from "@/lib/team-league-version";
import {
  chooseTeamLeagueDiscoveryCandidate,
  type TeamLeagueDiscoveryCandidate,
} from "@/lib/team-league-discovery";

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
  const [leagueEditId, setLeagueEditId] = useState<string | null>(null);
  const [leagueName, setLeagueName] = useState("");
  const [leagueRegion, setLeagueRegion] = useState("");
  const [leagueLevel, setLeagueLevel] = useState("");
  const [leagueNotes, setLeagueNotes] = useState("");
  const [seasonEditId, setSeasonEditId] = useState<string | null>(null);
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
  const [gameDeadlineDate, setGameDeadlineDate] = useState("");
  const [gameDeadlineTime, setGameDeadlineTime] = useState("");
  const [gameCenterId, setGameCenterId] = useState("");
  const [csvPreview, setCsvPreview] = useState<LeagueCsvImportPlan | null>(null);
  const [csvFileName, setCsvFileName] = useState("");
  const [exportTeamId, setExportTeamId] = useState<string>(LEAGUE_OWN_TEAM_ID);
  const [teamAreaTeams, setTeamAreaTeams] = useState<TeamSummary[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [sharedLeagueCanEdit, setSharedLeagueCanEdit] = useState(false);
  const [sharedLeagueStatus, setSharedLeagueStatus] = useState<string | null>(null);
  const [sharedLeagueVersion, setSharedLeagueVersion] = useState(0);
  const [sharedLeagueHistory, setSharedLeagueHistory] = useState<LeagueChangeEntry[]>([]);
  const [sharedLeagueConflict, setSharedLeagueConflict] = useState<SharedLeagueConflict | null>(null);
  const [calendarFeedUrl, setCalendarFeedUrl] = useState<string | null>(null);
  const sharedLeagueLoadedRef = useRef<string | null>(null);
  const sharedLeagueVersionRef = useRef(0);
  const sharedLeagueConflictRef = useRef(false);
  const sharedLeagueSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sharedLeagueDiscoveryCompletedRef = useRef<string | null>(null);
  const sharedLeagueDiscoveryInFlightRef = useRef<string | null>(null);

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

  useEffect(() => {
    let active = true;
    const cached = loadCachedTeamList() ?? [];
    setTeamAreaTeams(cached);
    void fetch("/api/team", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => response.ok ? (await response.json()) as { teams?: TeamSummary[] } : null)
      .then((payload) => {
        if (!active || !payload?.teams) return;
        setTeamAreaTeams(payload.teams);
        saveCachedTeamList(payload.teams);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (
      bundle.ownTeam.sourceTeamId ||
      teamAreaTeams.length === 0
    ) return;

    const discoveryKey = teamAreaTeams.map((team) => team.id).sort().join(",");
    if (
      sharedLeagueDiscoveryCompletedRef.current === discoveryKey ||
      sharedLeagueDiscoveryInFlightRef.current === discoveryKey
    ) return;

    let active = true;
    sharedLeagueDiscoveryInFlightRef.current = discoveryKey;
    void Promise.all(teamAreaTeams.map(async (team): Promise<TeamLeagueDiscoveryCandidate | null> => {
      const response = await fetch(`/api/team/league?teamId=${encodeURIComponent(team.id)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) return null;
      const payload = await response.json() as {
        bundle?: unknown;
        updatedAt?: string | null;
        version?: number;
        history?: unknown;
        canEdit?: boolean;
      };
      return {
        team: { id: team.id, name: team.name },
        bundle: payload.bundle && typeof payload.bundle === "object" ? payload.bundle : null,
        updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : null,
        version: Number.isInteger(payload.version) ? Math.max(0, payload.version ?? 0) : 0,
        history: payload.history,
        canEdit: Boolean(payload.canEdit),
      };
    }))
      .then((responses) => {
        if (!active) return;
        const candidates = responses.filter(
          (candidate): candidate is TeamLeagueDiscoveryCandidate => candidate !== null,
        );
        if (candidates.length === 0) return;
        sharedLeagueDiscoveryCompletedRef.current = discoveryKey;
        const candidate = chooseTeamLeagueDiscoveryCandidate(candidates);
        if (!candidate) return;

        const connected = candidate.bundle
          ? connectLeagueOwnTeam(normalizeLeagueBundle(candidate.bundle), candidate.team)
          : connectLeagueOwnTeam(bundle, candidate.team);
        sharedLeagueConflictRef.current = false;
        setSharedLeagueConflict(null);
        saveLeagueBundle(connected);
        setBundle(connected);

        if (candidate.bundle) {
          sharedLeagueLoadedRef.current = candidate.team.id;
          sharedLeagueVersionRef.current = candidate.version;
          setSharedLeagueVersion(candidate.version);
          setSharedLeagueHistory(normalizeLeagueHistory(candidate.history));
          setSharedLeagueCanEdit(candidate.canEdit);
          setSharedLeagueStatus(
            candidate.canEdit
              ? `Team-Liga „${candidate.team.name}“ automatisch synchronisiert.`
              : `Team-Liga „${candidate.team.name}“ automatisch geladen · nur Lesen.`,
          );
        } else {
          // Der regulaere Team-Liga-Effekt legt fuer diese eine Mitgliedschaft
          // anschliessend die noch fehlende gemeinsame Zeile an.
          sharedLeagueLoadedRef.current = null;
          setSharedLeagueStatus(`Team „${candidate.team.name}“ automatisch verbunden.`);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (sharedLeagueDiscoveryInFlightRef.current === discoveryKey) {
          sharedLeagueDiscoveryInFlightRef.current = null;
        }
      });

    return () => {
      active = false;
      if (sharedLeagueDiscoveryInFlightRef.current === discoveryKey) {
        sharedLeagueDiscoveryInFlightRef.current = null;
      }
    };
  }, [bundle, teamAreaTeams]);

  useEffect(() => {
    const teamId = bundle.ownTeam.sourceTeamId;
    if (!teamId) {
      sharedLeagueLoadedRef.current = null;
      sharedLeagueVersionRef.current = 0;
      sharedLeagueConflictRef.current = false;
      setSharedLeagueCanEdit(false);
      setSharedLeagueStatus(null);
      setSharedLeagueVersion(0);
      setSharedLeagueHistory([]);
      setSharedLeagueConflict(null);
      return;
    }
    if (sharedLeagueLoadedRef.current === teamId) return;
    sharedLeagueLoadedRef.current = teamId;
    let active = true;
    setSharedLeagueStatus("Gemeinsame Team-Liga wird geladen …");

    void fetch(`/api/team/league?teamId=${encodeURIComponent(teamId)}`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("shared_league_load_failed");
        return await response.json() as { bundle?: unknown; canEdit?: boolean; version?: number; history?: unknown };
      })
      .then((payload) => {
        if (!active) return;
        const canEdit = Boolean(payload.canEdit);
        const version = Number.isInteger(payload.version) ? Math.max(0, payload.version ?? 0) : 0;
        const history = normalizeLeagueHistory(payload.history);
        sharedLeagueVersionRef.current = version;
        setSharedLeagueVersion(version);
        setSharedLeagueHistory(history);
        setSharedLeagueCanEdit(canEdit);
        if (payload.bundle && typeof payload.bundle === "object") {
          const remote = normalizeLeagueBundle(payload.bundle);
          const connectedTeam = teamAreaTeams.find((team) => team.id === teamId);
          const next = connectLeagueOwnTeam(remote, connectedTeam ?? { id: teamId, name: bundle.ownTeam.name });
          saveLeagueBundle(next);
          setBundle(next);
          setSharedLeagueStatus(canEdit ? "Mit dem Team synchronisiert." : "Team-Liga geladen · nur Lesen.");
          return;
        }
        setSharedLeagueStatus(canEdit ? "Team-Liga verbunden." : "Team-Liga verbunden · nur Lesen.");
        if (canEdit) {
          void fetch("/api/team/league", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ teamId, bundle, expectedVersion: 0, summary: "Team-Liga verbunden" }),
          }).then(async (response) => {
            const result = await response.json().catch(() => null) as { version?: number; history?: unknown } | null;
            if (!active || !response.ok || !result) return;
            const nextVersion = Number(result.version) || 1;
            sharedLeagueVersionRef.current = nextVersion;
            setSharedLeagueVersion(nextVersion);
            setSharedLeagueHistory(normalizeLeagueHistory(result.history));
          });
        }
      })
      .catch(() => {
        if (!active) return;
        setSharedLeagueCanEdit(false);
        setSharedLeagueStatus("Team-Liga konnte nicht geladen werden · lokale Daten bleiben erhalten.");
      });

    return () => { active = false; };
  }, [bundle, teamAreaTeams]);

  const activeLeague = useMemo(() => getActiveLeague(bundle), [bundle]);
  const activeSeason = useMemo(() => getActiveSeason(bundle), [bundle]);
  const leagueSeasons = useMemo(
    () => activeLeague ? seasonsForLeague(bundle, activeLeague.id) : [],
    [activeLeague, bundle],
  );
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
  const exportSchedule = useMemo(
    () => exportTeamId === "all"
      ? schedule
      : schedule.filter((entry) => entry.homeTeamId === exportTeamId || entry.awayTeamId === exportTeamId),
    [exportTeamId, schedule],
  );
  const exportTeamName = useMemo(
    () => exportTeamId === "all" ? "Alle Teams" : teams.find((team) => team.id === exportTeamId)?.name ?? "Team",
    [exportTeamId, teams],
  );
  const gameCenterEntry = useMemo(() => {
    const selected = ownSchedule.find((entry) => entry.id === gameCenterId);
    if (selected) return selected;
    const today = getTodayDateKey();
    return ownSchedule.find((entry) => entry.date >= today && entry.status !== "cancelled") ?? ownSchedule.at(-1) ?? null;
  }, [gameCenterId, ownSchedule]);
  const gameCenterOpponent = useMemo(() => {
    if (!gameCenterEntry) return null;
    const opponentId = gameCenterEntry.homeTeamId === LEAGUE_OWN_TEAM_ID
      ? gameCenterEntry.awayTeamId
      : gameCenterEntry.homeTeamId;
    return bundle.opponents.find((entry) => entry.id === opponentId) ?? null;
  }, [bundle.opponents, gameCenterEntry]);
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
    if (exportTeamId !== "all" && !teams.some((team) => team.id === exportTeamId)) setExportTeamId(LEAGUE_OWN_TEAM_ID);
  }, [exportTeamId, teams]);

  useEffect(() => {
    if (!teams.some((team) => team.id === playerTeamId)) setPlayerTeamId(teams[0]?.id ?? LEAGUE_OWN_TEAM_ID);
    if (!teams.some((team) => team.id === homeTeamId)) setHomeTeamId(teams[0]?.id ?? LEAGUE_OWN_TEAM_ID);
    if (!teams.some((team) => team.id === awayTeamId)) setAwayTeamId(teams[1]?.id ?? "");
  }, [awayTeamId, homeTeamId, playerTeamId, teams]);

  function persist(next: LeagueBundle, explicitSummary?: string) {
    const summary = explicitSummary ?? summarizeLeagueChange(bundle, next);
    saveLeagueBundle(next);
    setBundle(next);
    const teamId = next.ownTeam.sourceTeamId;
    if (teamId && sharedLeagueCanEdit) {
      if (sharedLeagueConflictRef.current) {
        setSharedLeagueConflict((current) => current ? { ...current, localBundle: next } : current);
        setSharedLeagueStatus("Lokale Änderungen warten auf die Konfliktauflösung.");
        return;
      }
      sharedLeagueSyncQueueRef.current = sharedLeagueSyncQueueRef.current.then(async () => {
        const expectedVersion = sharedLeagueVersionRef.current;
        setSharedLeagueStatus("Team-Liga wird synchronisiert …");
        const response = await fetch("/api/team/league", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ teamId, bundle: next, expectedVersion, summary }),
        });
        const payload = await response.json().catch(() => null) as {
          bundle?: unknown;
          updatedAt?: string | null;
          version?: number;
          history?: unknown;
        } | null;
        if (response.status === 409) {
          const remoteVersion = Number(payload?.version) || expectedVersion + 1;
          const remoteBundle = payload?.bundle && typeof payload.bundle === "object"
            ? connectLeagueOwnTeam(normalizeLeagueBundle(payload.bundle), { id: teamId, name: next.ownTeam.name })
            : null;
          const conflict: SharedLeagueConflict = {
            localBundle: next,
            remoteBundle,
            remoteVersion,
            remoteUpdatedAt: payload?.updatedAt ?? null,
            history: normalizeLeagueHistory(payload?.history),
          };
          sharedLeagueConflictRef.current = true;
          setSharedLeagueConflict(conflict);
          setSharedLeagueStatus("Konflikt erkannt · es wurde nichts überschrieben.");
          return;
        }
        if (!response.ok) throw new Error("shared_league_write_failed");
        const version = Number(payload?.version) || expectedVersion + 1;
        sharedLeagueVersionRef.current = version;
        setSharedLeagueVersion(version);
        setSharedLeagueHistory(normalizeLeagueHistory(payload?.history));
        setSharedLeagueStatus("Mit dem Team synchronisiert.");
      }).catch(() => setSharedLeagueStatus("Team-Sync fehlgeschlagen · lokal gespeichert."));
    }
  }

  function acceptRemoteLeagueVersion() {
    if (!sharedLeagueConflict?.remoteBundle) {
      setSharedLeagueStatus("Der aktuelle Teamstand muss erneut geladen werden.");
      sharedLeagueLoadedRef.current = null;
      window.location.reload();
      return;
    }
    saveLeagueBundle(sharedLeagueConflict.remoteBundle);
    setBundle(sharedLeagueConflict.remoteBundle);
    sharedLeagueVersionRef.current = sharedLeagueConflict.remoteVersion;
    sharedLeagueConflictRef.current = false;
    setSharedLeagueVersion(sharedLeagueConflict.remoteVersion);
    setSharedLeagueHistory(sharedLeagueConflict.history);
    setSharedLeagueConflict(null);
    setSharedLeagueStatus("Aktueller Teamstand wurde geladen.");
  }

  async function overwriteRemoteLeagueVersion() {
    const conflict = sharedLeagueConflict;
    const teamId = conflict?.localBundle.ownTeam.sourceTeamId;
    if (!conflict || !teamId) return;
    setSharedLeagueStatus("Lokale Änderungen werden übernommen …");
    const response = await fetch("/api/team/league", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        teamId,
        bundle: conflict.localBundle,
        expectedVersion: conflict.remoteVersion,
        summary: "Konflikt gelöst · lokale Änderungen übernommen",
      }),
    });
    const payload = await response.json().catch(() => null) as { version?: number; history?: unknown } | null;
    if (!response.ok) {
      setSharedLeagueStatus(response.status === 409 ? "Der Teamstand wurde erneut geändert · bitte neu laden." : "Konflikt konnte nicht aufgelöst werden.");
      return;
    }
    const version = Number(payload?.version) || conflict.remoteVersion + 1;
    sharedLeagueVersionRef.current = version;
    sharedLeagueConflictRef.current = false;
    setSharedLeagueVersion(version);
    setSharedLeagueHistory(normalizeLeagueHistory(payload?.history));
    setSharedLeagueConflict(null);
    setSharedLeagueStatus("Lokale Änderungen wurden konfliktfrei übernommen.");
  }

  function handleTabChange(next: Tab) {
    setTab(next);
    persistLigaTab(next);
  }

  function openGameDetails(gameId: string) {
    setGameCenterId(gameId);
    window.requestAnimationFrame(() => {
      const details = document.getElementById(`league-game-${gameId}`) as HTMLDetailsElement | null;
      if (details) details.open = true;
      details?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function resetLeagueForm() {
    setLeagueEditId(null);
    setLeagueName("");
    setLeagueRegion("");
    setLeagueLevel("");
    setLeagueNotes("");
  }

  function beginLeagueEdit(league: LeagueDefinition) {
    setLeagueEditId(league.id);
    setLeagueName(league.name);
    setLeagueRegion(league.region ?? "");
    setLeagueLevel(league.level ?? "");
    setLeagueNotes(league.notes ?? "");
  }

  function activateLeague(leagueId: string) {
    const firstSeason = seasonsForLeague(bundle, leagueId)[0] ?? null;
    persist({ ...bundle, activeLeagueId: leagueId, activeSeasonId: firstSeason?.id ?? null });
    resetLeagueForm();
    resetSeasonForm();
  }

  function handleSaveLeague(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = leagueName.trim();
    if (!name) return;
    const duplicate = bundle.leagues.find((league) =>
      league.id !== leagueEditId && league.name.trim().toLocaleLowerCase("de-DE") === name.toLocaleLowerCase("de-DE"),
    );
    if (duplicate) return setMessage(`Die Liga „${duplicate.name}“ ist bereits vorhanden.`);
    if (leagueEditId) {
      persist({
        ...bundle,
        leagues: bundle.leagues.map((league) => league.id === leagueEditId ? {
          ...league,
          name,
          region: leagueRegion.trim() || undefined,
          level: leagueLevel.trim() || undefined,
          notes: leagueNotes.trim() || undefined,
        } : league),
      });
      setMessage(`Liga „${name}“ aktualisiert.`);
    } else {
      const league: LeagueDefinition = {
        id: createId("league"),
        name,
        region: leagueRegion.trim() || undefined,
        level: leagueLevel.trim() || undefined,
        notes: leagueNotes.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      persist({ ...bundle, activeLeagueId: league.id, activeSeasonId: null, leagues: [league, ...bundle.leagues] });
      setMessage(`Liga „${name}“ angelegt.`);
    }
    resetLeagueForm();
  }

  /** Games of removed seasons must also disappear from the personal week plan. */
  function detachSeasonGames(seasonIds: Set<string>) {
    const affected = bundle.schedule.filter((game) => seasonIds.has(game.seasonId));
    const affectedIds = new Set(affected.map((game) => game.id));
    for (const game of affected) {
      if (game.syncedAt) cleanupSyncedGame(game, affectedIds);
    }
    return affected;
  }

  function withoutSeasonReferences(next: LeagueBundle, seasonIds: Set<string>): LeagueBundle {
    return {
      ...next,
      seasons: next.seasons.filter((season) => !seasonIds.has(season.id)),
      schedule: next.schedule.filter((game) => !seasonIds.has(game.seasonId)),
      opponents: next.opponents.map((opponent) => ({
        ...opponent,
        seasonId: opponent.seasonId && seasonIds.has(opponent.seasonId) ? undefined : opponent.seasonId,
        seasonIds: opponent.seasonIds.filter((id) => !seasonIds.has(id)),
      })),
    };
  }

  async function deleteLeague(league: LeagueDefinition) {
    const affectedSeasons = seasonsForLeague(bundle, league.id);
    const seasonIds = new Set(affectedSeasons.map((season) => season.id));
    const affectedGames = bundle.schedule.filter((game) => seasonIds.has(game.seasonId));
    const confirmed = await appDialog.confirm({
      message: `Liga „${league.name}“ mit ${affectedSeasons.length} Saison${affectedSeasons.length === 1 ? "" : "s"} und ${affectedGames.length} Spiel${affectedGames.length === 1 ? "" : "en"} löschen? Teams und Spieler bleiben erhalten.`,
      confirmLabel: "Liga löschen",
      tone: "danger",
    });
    if (!confirmed) return;
    detachSeasonGames(seasonIds);
    const cleaned = withoutSeasonReferences(bundle, seasonIds);
    const remainingLeagues = cleaned.leagues.filter((entry) => entry.id !== league.id);
    const nextLeagueId = bundle.activeLeagueId === league.id ? remainingLeagues[0]?.id ?? null : bundle.activeLeagueId;
    const nextSeasonId = cleaned.seasons.find((season) => season.leagueId === nextLeagueId)?.id ?? null;
    persist({
      ...cleaned,
      leagues: remainingLeagues,
      activeLeagueId: nextLeagueId,
      activeSeasonId: bundle.activeSeasonId && !seasonIds.has(bundle.activeSeasonId) && nextLeagueId === bundle.activeLeagueId
        ? bundle.activeSeasonId
        : nextSeasonId,
    }, `Liga „${league.name}“ gelöscht`);
    if (leagueEditId === league.id) resetLeagueForm();
    resetSeasonForm();
    setMessage(`Liga „${league.name}“ gelöscht.`);
  }

  async function deleteSeason(season: LeagueSeason) {
    const affectedGames = bundle.schedule.filter((game) => game.seasonId === season.id);
    const confirmed = await appDialog.confirm({
      message: `Saison „${season.name}“ mit ${affectedGames.length} Spiel${affectedGames.length === 1 ? "" : "en"} löschen? Teams und Spieler bleiben erhalten.`,
      confirmLabel: "Saison löschen",
      tone: "danger",
    });
    if (!confirmed) return;
    const seasonIds = new Set([season.id]);
    detachSeasonGames(seasonIds);
    const cleaned = withoutSeasonReferences(bundle, seasonIds);
    const fallbackSeasonId = cleaned.seasons.find(
      (entry) => entry.leagueId === (season.leagueId ?? bundle.activeLeagueId),
    )?.id ?? null;
    persist({
      ...cleaned,
      activeSeasonId: bundle.activeSeasonId === season.id ? fallbackSeasonId : bundle.activeSeasonId,
    }, `Saison „${season.name}“ gelöscht`);
    if (seasonEditId === season.id) resetSeasonForm();
    setMessage(`Saison „${season.name}“ gelöscht.`);
  }

  function resetSeasonForm() {
    setSeasonEditId(null);
    setSeasonName("");
    setSeasonStartDate("");
    setSeasonEndDate("");
    setSeasonNotes("");
  }

  function beginSeasonEdit(season: LeagueSeason) {
    if (season.leagueId) {
      persist({ ...bundle, activeLeagueId: season.leagueId, activeSeasonId: season.id });
    } else {
      persist({ ...bundle, activeSeasonId: season.id });
    }
    setSeasonEditId(season.id);
    setSeasonName(season.name);
    setSeasonStartDate(season.startDate ?? "");
    setSeasonEndDate(season.endDate ?? "");
    setSeasonNotes(season.notes ?? "");
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

  function handleSaveSeason(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeLeague) return setMessage("Bitte zuerst eine Liga anlegen.");
    const name = seasonName.trim();
    if (!name) return;
    if (bundle.seasons.some((season) => season.id !== seasonEditId && season.leagueId === activeLeague.id && season.name.trim().toLocaleLowerCase("de-DE") === name.toLocaleLowerCase("de-DE"))) {
      return setMessage("In dieser Liga ist bereits eine Saison mit diesem Namen vorhanden.");
    }
    if (seasonStartDate && seasonEndDate && seasonEndDate < seasonStartDate) {
      return setMessage("Das Saisonende darf nicht vor dem Saisonstart liegen.");
    }
    if (seasonEditId) {
      const outsideGames = bundle.schedule.filter((game) =>
        game.seasonId === seasonEditId && (
          (seasonStartDate && game.date < seasonStartDate) ||
          (seasonEndDate && game.date > seasonEndDate)
        ),
      );
      if (outsideGames.length > 0) {
        return setMessage(`${outsideGames.length} vorhandene${outsideGames.length === 1 ? "s Spiel liegt" : " Spiele liegen"} außerhalb des neuen Saisonzeitraums.`);
      }
      persist({
        ...bundle,
        activeSeasonId: seasonEditId,
        seasons: bundle.seasons.map((season) => season.id === seasonEditId ? {
          ...season,
          name,
          startDate: seasonStartDate || undefined,
          endDate: seasonEndDate || undefined,
          notes: seasonNotes.trim() || undefined,
        } : season),
      });
      setMessage(`Saison „${name}“ aktualisiert.`);
    } else {
      const season: LeagueSeason = {
        id: createId("season"),
        leagueId: activeLeague.id,
        name,
        startDate: seasonStartDate || undefined,
        endDate: seasonEndDate || undefined,
        notes: seasonNotes.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      persist({ ...bundle, activeSeasonId: season.id, seasons: [season, ...bundle.seasons] });
      setMessage(`Saison „${name}“ angelegt.`);
    }
    resetSeasonForm();
  }

  function connectOwnTeam(teamId: string) {
    const team = teamAreaTeams.find((entry) => entry.id === teamId) ?? null;
    persist(connectLeagueOwnTeam(bundle, team));
    setMessage(team ? `„${team.name}“ ist jetzt dein Team in der Liga.` : "Verbindung zum Team-Bereich gelöst.");
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

  function toggleSeasonOpponent(seasonId: string, opponent: LeagueOpponent) {
    const assigned = opponent.seasonIds.includes(seasonId) || opponent.seasonId === seasonId;
    if (assigned) {
      const usedInSchedule = bundle.schedule.some((game) =>
        game.seasonId === seasonId && (game.homeTeamId === opponent.id || game.awayTeamId === opponent.id),
      );
      if (usedInSchedule) {
        setMessage(`„${opponent.name}“ ist noch in Saisonspielen eingetragen und kann nicht entfernt werden.`);
        return;
      }
    }
    persist({
      ...bundle,
      opponents: bundle.opponents.map((entry) => entry.id === opponent.id ? {
        ...entry,
        seasonId: assigned && entry.seasonId === seasonId ? undefined : entry.seasonId,
        seasonIds: assigned
          ? entry.seasonIds.filter((id) => id !== seasonId)
          : [...new Set([...entry.seasonIds, seasonId])],
      } : entry),
    });
    setMessage(`„${opponent.name}“ ${assigned ? "aus der Saison entfernt" : "zur Saison hinzugefügt"}.`);
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
    if (Boolean(gameDeadlineDate) !== Boolean(gameDeadlineTime)) return setMessage("Bitte Datum und Uhrzeit der Zusagefrist vollständig angeben.");
    if (gameDeadlineDate && `${gameDeadlineDate}T${gameDeadlineTime}` > `${gameDate}T${gameTime}`) return setMessage("Die Zusagefrist muss vor dem Spielbeginn liegen.");
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
      attendanceDeadline: gameDeadlineDate && gameDeadlineTime ? `${gameDeadlineDate}T${gameDeadlineTime}` : undefined,
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
    setGameDeadlineDate("");
    setGameDeadlineTime("");
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

  function updateAttendanceDeadline(entry: LeagueScheduleEntry, part: "date" | "time", value: string) {
    const [currentDate = "", currentTime = ""] = (entry.attendanceDeadline ?? "").split("T");
    const date = part === "date" ? value : currentDate || entry.date;
    const time = part === "time" ? value : currentTime || (value ? "18:00" : "");
    updateGame(entry.id, { attendanceDeadline: date && time ? `${date}T${time}` : undefined });
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

  function exportFileName(extension: string) {
    const slug = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return [slug(activeSeason?.name ?? "saison") || "saison", slug(exportTeamName) || "team", `spielplan.${extension}`]
      .join("-");
  }

  function exportCalendar() {
    if (!activeSeason) return setMessage("Bitte zuerst eine Saison anlegen.");
    if (exportSchedule.length === 0) return setMessage(`Keine Saisonspiele für „${exportTeamName}“ vorhanden.`);
    const resolveTeamName = (id: string | undefined) => teamById.get(id ?? "")?.name ?? "";
    const content = buildLeagueCalendarIcs(exportSchedule, resolveTeamName);
    downloadLeagueCalendar(exportFileName("ics"), content);
    setMessage(`${exportSchedule.length} Spiele von „${exportTeamName}“ als iCal exportiert.`);
  }

  function exportScheduleCsv() {
    if (!activeSeason) return setMessage("Bitte zuerst eine Saison anlegen.");
    if (exportSchedule.length === 0) return setMessage(`Keine Saisonspiele für „${exportTeamName}“ vorhanden.`);
    const content = buildLeagueScheduleCsv(exportSchedule, (id) => teamById.get(id ?? "")?.name ?? "");
    const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportFileName("csv");
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setMessage(`${exportSchedule.length} Spiele von „${exportTeamName}“ als CSV exportiert.`);
  }

  async function createCalendarSubscription() {
    const teamId = bundle.ownTeam.sourceTeamId;
    if (!teamId) return setMessage("Verbinde zuerst dein Liga-Team mit einem Team aus dem Team-Reiter.");
    const response = await fetch("/api/calendar/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ teamId }),
    });
    const payload = await response.json().catch(() => null) as { url?: string } | null;
    if (!response.ok || !payload?.url) return setMessage("Kalender-Abo konnte nicht erstellt werden.");
    setCalendarFeedUrl(payload.url);
    setMessage("Kalender-Abo ist bereit. Änderungen am Team-Spielplan werden automatisch übernommen.");
  }

  async function revokeCalendarSubscription() {
    const teamId = bundle.ownTeam.sourceTeamId;
    if (!teamId) return;
    const response = await fetch("/api/calendar/feed", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ teamId }),
    });
    if (!response.ok) return setMessage("Kalender-Abo konnte nicht widerrufen werden.");
    setCalendarFeedUrl(null);
    setMessage("Kalender-Abo wurde widerrufen.");
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

      {message ? (
        <div className="mt-3 app-card--accent-cyan flex items-center justify-between gap-2" role="status">
          <p className="text-sm text-strong">{message}</p>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setMessage(null)}>{t("common.close")}</button>
        </div>
      ) : null}

      <section className="league-context-bar mt-3" aria-label="Aktive Liga und Saison">
        <label className="league-context-bar__select">
          <span className="input-label">Liga auswählen</span>
          <select
            value={activeLeague?.id ?? ""}
            onChange={(event) => activateLeague(event.target.value)}
            className="select app-modern-select"
            disabled={bundle.leagues.length === 0}
          >
            {bundle.leagues.length === 0 ? <option value="">Noch keine Liga</option> : null}
            {bundle.leagues.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}
          </select>
        </label>
        <div className="league-context-bar__summary">
          <span>Aktive Saison</span>
          <strong>{activeSeason?.name ?? "Noch keine Saison"}</strong>
          {activeSeason ? <span className="chip">{teams.length} Teams</span> : null}
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => handleTabChange("season")}>Liga & Saison bearbeiten</button>
      </section>

      {sharedLeagueConflict ? (
        <section className="league-conflict-card mt-3" role="alert" aria-labelledby="league-conflict-title">
          <div>
            <p className="section-eyebrow">Synchronisierung angehalten</p>
            <h2 id="league-conflict-title" className="section-title mt-1">Ein Teammitglied war schneller</h2>
            <p className="mt-1 text-sm text-muted">Deine lokale Version wurde nicht überschrieben. Wähle bewusst, welcher Stand weiterverwendet werden soll.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-outline btn-sm" onClick={acceptRemoteLeagueVersion}>Teamstand laden</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void overwriteRemoteLeagueVersion()}>Meine Änderungen übernehmen</button>
          </div>
        </section>
      ) : null}

      {tab === "season" ? (
        <section className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <form className="app-card space-y-3" onSubmit={handleSaveLeague}>
              <div className="flex items-start justify-between gap-2">
                <div><p className="section-eyebrow">{leagueEditId ? "Liga bearbeiten" : "Neue Liga"}</p><h2 className="section-title mt-1">{leagueEditId ? leagueName || "Liga" : "Wettbewerb anlegen"}</h2></div>
                {leagueEditId ? <button type="button" className="btn btn-ghost btn-xs" onClick={resetLeagueForm}>Abbrechen</button> : null}
              </div>
              <label><span className="input-label">Liganame</span><input value={leagueName} onChange={(event) => setLeagueName(event.target.value)} placeholder="z. B. Regionalliga Nord" className="input" required /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label><span className="input-label">Region / Verband</span><input value={leagueRegion} onChange={(event) => setLeagueRegion(event.target.value)} placeholder="z. B. Berlin" className="input" /></label>
                <label><span className="input-label">Spielklasse</span><input value={leagueLevel} onChange={(event) => setLeagueLevel(event.target.value)} placeholder="z. B. Herren I" className="input" /></label>
              </div>
              <textarea value={leagueNotes} onChange={(event) => setLeagueNotes(event.target.value)} placeholder="Modus, Verband oder weitere Liga-Notizen" rows={2} className="textarea" />
              <button type="submit" className="btn btn-primary btn-sm">{leagueEditId ? "Liga speichern" : "Liga anlegen"}</button>
            </form>
            <div className="app-card">
              <p className="section-eyebrow">Deine Ligen</p>
              <h2 className="section-title mt-1">Auswählen und bearbeiten</h2>
              {bundle.leagues.length === 0 ? <p className="mt-3 text-sm text-muted">Lege zuerst eine Liga an. Danach kannst du darin Saisons erstellen.</p> : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">{bundle.leagues.map((league) => {
                  const seasonCount = seasonsForLeague(bundle, league.id).length;
                  const selected = activeLeague?.id === league.id;
                  return <div key={league.id} className="grid gap-1.5">
                    <button type="button" className={`league-select-card ${selected ? "league-select-card--active" : ""}`} onClick={() => { activateLeague(league.id); beginLeagueEdit(league); }}>
                      <span><strong>{league.name}</strong><small>{[league.region, league.level].filter(Boolean).join(" · ") || "Keine Zusatzangaben"}</small></span>
                      <span className={`chip ${selected ? "chip-active" : ""}`}>{seasonCount} Saison{seasonCount === 1 ? "" : "s"}</span>
                    </button>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" className="btn btn-outline btn-xs" onClick={() => { activateLeague(league.id); beginLeagueEdit(league); }}>Bearbeiten</button>
                      <button type="button" className="btn btn-danger-outline btn-xs" onClick={() => void deleteLeague(league)}>Liga löschen</button>
                    </div>
                  </div>;
                })}</div>
              )}
            </div>
          </div>

          {activeLeague ? <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <form className="app-card space-y-3" onSubmit={handleSaveSeason}>
              <div className="flex items-start justify-between gap-2">
                <div><p className="section-eyebrow">{seasonEditId ? "Saison bearbeiten" : "Neue Saison"}</p><h2 className="section-title mt-1">{activeLeague.name}</h2></div>
                {seasonEditId ? <button type="button" className="btn btn-ghost btn-xs" onClick={resetSeasonForm}>Abbrechen</button> : null}
              </div>
              <label><span className="input-label">Saisonname</span><input value={seasonName} onChange={(event) => setSeasonName(event.target.value)} placeholder="z. B. 2026/27" className="input" required /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <ModernDateInput value={seasonStartDate} onChange={setSeasonStartDate} label="Saisonstart" max={seasonEndDate || undefined} />
                <ModernDateInput value={seasonEndDate} onChange={setSeasonEndDate} label="Saisonende" min={seasonStartDate || undefined} />
              </div>
              <textarea value={seasonNotes} onChange={(event) => setSeasonNotes(event.target.value)} placeholder="Ziele, Modus und Saisonnotizen" rows={3} className="textarea" />
              {seasonEditId ? <div className="season-team-picker">
                <div><p className="input-label">Teams dieser Saison</p><p className="text-xs text-muted">Teams mit vorhandenem Spiel können erst nach dem Entfernen des Spiels abgewählt werden.</p></div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="season-team-toggle season-team-toggle--locked"><span className="season-team-toggle__check">✓</span><span><strong>{bundle.ownTeam.name}</strong><small>Dein Team · immer dabei</small></span></div>
                  {bundle.opponents.map((opponent) => {
                    const checked = opponent.seasonIds.includes(seasonEditId) || opponent.seasonId === seasonEditId;
                    return <button key={opponent.id} type="button" role="checkbox" aria-checked={checked} className={`season-team-toggle ${checked ? "season-team-toggle--checked" : ""}`} onClick={() => toggleSeasonOpponent(seasonEditId, opponent)}><span className="season-team-toggle__check">{checked ? "✓" : "+"}</span><span><strong>{opponent.name}</strong><small>{checked ? "In Saison" : "Hinzufügen"}</small></span></button>;
                  })}
                </div>
                {bundle.opponents.length === 0 ? <p className="mt-2 text-xs text-muted">Lege im Reiter „Teams“ zuerst Gegner an.</p> : null}
              </div> : null}
              <button type="submit" className="btn btn-primary btn-sm">{seasonEditId ? "Saison speichern" : "Saison anlegen"}</button>
            </form>
            <div className="app-card">
              <p className="section-eyebrow">Saisons in {activeLeague.name}</p>
              <h2 className="section-title mt-1">Zum Öffnen anklicken</h2>
              {leagueSeasons.length === 0 ? <p className="mt-3 text-sm text-muted">Lege die erste Saison dieser Liga an.</p> : (
                <div className="mt-3 space-y-3">{leagueSeasons.map((season) => {
                  const selected = activeSeason?.id === season.id;
                  const count = teamsForSeason(bundle, season.id).length;
                  const gameCount = bundle.schedule.filter((game) => game.seasonId === season.id).length;
                  return <div key={season.id} className="grid gap-1.5">
                    <button type="button" className={`league-season-card ${selected ? "league-season-card--active" : ""}`} onClick={() => beginSeasonEdit(season)}>
                      <span><strong>{season.name}</strong><small>{season.startDate ? formatDateLabel(season.startDate) : "Start offen"} – {season.endDate ? formatDateLabel(season.endDate) : "Ende offen"}</small>{season.notes ? <small>{season.notes}</small> : null}</span>
                      <span className={`chip ${selected ? "chip-active" : ""}`}>{count} Teams · {selected ? "Aktiv" : "Bearbeiten"}</span>
                    </button>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" className="btn btn-outline btn-xs" onClick={() => beginSeasonEdit(season)}>Bearbeiten</button>
                      <button type="button" className="btn btn-danger-outline btn-xs" onClick={() => void deleteSeason(season)}>Saison löschen</button>
                      <span className="text-xs text-faint">{gameCount} Spiel{gameCount === 1 ? "" : "e"}</span>
                    </div>
                  </div>;
                })}</div>
              )}
            </div>
          </div> : <div className="app-card"><p className="text-sm text-muted">Lege eine Liga an, um eine Saison zu erstellen.</p></div>}

          {bundle.ownTeam.sourceTeamId && sharedLeagueHistory.length > 0 ? (
            <details className="league-history">
              <summary>
                <span>Änderungsverlauf anzeigen</span>
                <span className="chip">Version {sharedLeagueVersion}</span>
              </summary>
              <ol>
                {[...sharedLeagueHistory].reverse().slice(0, 8).map((entry) => (
                  <li key={entry.id}>
                    <span>{entry.summary}</span>
                    <small>{entry.userLabel} · {formatLeagueHistoryDate(entry.at)}</small>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </section>
      ) : null}

      {tab === "teams" ? (
        <section className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <form className="app-card space-y-3" onSubmit={(event) => { event.preventDefault(); const name = bundle.ownTeam.name.trim(); if (name) persist({ ...bundle, ownTeam: { ...bundle.ownTeam, name } }); setMessage("Name des eigenen Teams gespeichert."); }}>
              <div><p className="section-eyebrow">Eigenes Team</p><h2 className="section-title mt-1">Mit dem Team-Bereich verbinden</h2></div>
              <label className="block"><span className="input-label">Team aus „Teams“</span><select value={bundle.ownTeam.sourceTeamId ?? ""} onChange={(event) => connectOwnTeam(event.target.value)} className="select app-modern-select"><option value="">Ohne Verbindung / manuell</option>{teamAreaTeams.map((team) => <option key={team.id} value={team.id}>{team.name}{team.clubName ? ` · ${team.clubName}` : ""}</option>)}</select></label>
              {teamAreaTeams.length === 0 ? <p className="text-xs text-muted">Noch kein Team im Team-Reiter gefunden. Dort angelegte Teams erscheinen hier automatisch.</p> : null}
              <label className="block"><span className="input-label">Teamname in der Liga</span><input value={bundle.ownTeam.name} disabled={Boolean(bundle.ownTeam.sourceTeamId)} onChange={(event) => setBundle({ ...bundle, ownTeam: { ...bundle.ownTeam, name: event.target.value } })} className="input" /></label>
              {bundle.ownTeam.sourceTeamId ? <><p className="text-xs text-emerald-700">Verbunden · Name und Team-ID stammen aus dem Team-Bereich.</p>{sharedLeagueStatus ? <p className="text-xs text-muted" role="status">{sharedLeagueStatus}</p> : null}</> : <button type="submit" className="btn btn-outline btn-sm">Teamname speichern</button>}
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
            <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
              <ModernDateInput value={gameDeadlineDate} onChange={setGameDeadlineDate} label="Zusagefrist (Datum)" max={gameDate || undefined} className="league-game-field" controlClassName="league-game-control" />
              <ModernTimeInput value={gameDeadlineTime} onChange={setGameDeadlineTime} label="Zusagefrist (Uhrzeit)" className="league-game-field" controlClassName="league-game-control" />
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

          {gameCenterEntry ? (() => {
            const home = teamById.get(gameCenterEntry.homeTeamId ?? "");
            const away = teamById.get(gameCenterEntry.awayTeamId ?? "");
            const attendance = gameCenterEntry.attendance ?? [];
            const yesCount = attendance.filter((entry) => entry.status === "yes").length;
            const openCount = Math.max(0, ownTeamPlayers.length - attendance.filter((entry) => entry.status !== "pending").length);
            const googleCalendarUrl = buildGoogleCalendarUrl(gameCenterEntry, (id) => teamById.get(id ?? "")?.name ?? "");
            return <section className="game-center" aria-labelledby="game-center-title">
              <div className="game-center__header">
                <div>
                  <p className="section-eyebrow">Game Center</p>
                  <h2 id="game-center-title" className="section-title mt-1">{home?.name ?? "Heimteam"} – {away?.name ?? "Auswärtsteam"}</h2>
                  <p className="mt-1 text-xs text-muted">{formatGameDateTimeLabel(gameCenterEntry.date, gameCenterEntry.startTime)} · {gameStatusLabel(gameCenterEntry.status)}</p>
                </div>
                <label className="game-center__select">
                  <span className="sr-only">Spiel im Game Center auswählen</span>
                  <select value={gameCenterEntry.id} onChange={(event) => setGameCenterId(event.target.value)} className="select app-modern-select">
                    {ownSchedule.map((entry) => <option key={entry.id} value={entry.id}>{entry.date} · {teamById.get(entry.homeTeamId ?? "")?.name} – {teamById.get(entry.awayTeamId ?? "")?.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="game-center__steps mt-4">
                <article><span>1</span><div><strong>Organisation</strong><small>{gameCenterEntry.venueName || "Spielort offen"}{gameCenterEntry.meetingTime ? ` · Treffen ${gameCenterEntry.meetingTime}` : ""}</small></div></article>
                <article><span>2</span><div><strong>Teilnahme</strong><small>{yesCount} Zusagen · {openCount} offen</small></div></article>
                <article><span>3</span><div><strong>Vorbereitung</strong><small>{gameCenterOpponent?.strengths || gameCenterOpponent?.defenseNotes || "Scouting ergänzen"}</small></div></article>
                <article><span>4</span><div><strong>Live-Spiel</strong><small>{gameCenterEntry.status === "final" ? "Live-Feed abgeschlossen" : "Uhr, Fouls und Punkte"}</small></div></article>
                <article><span>5</span><div><strong>Auswertung</strong><small>{isCompletedLeagueGame(gameCenterEntry) ? `${gameCenterEntry.homeScore} : ${gameCenterEntry.awayScore}` : "Boxscore nach dem Spiel"}</small></div></article>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => openGameDetails(gameCenterEntry.id)}>Organisation & Kader</button>
                {gameCenterEntry.status !== "cancelled" && gameCenterEntry.status !== "postponed" ? <Link href={`/liga/live/${encodeURIComponent(gameCenterEntry.id)}`} className="btn btn-primary btn-sm">{gameCenterEntry.status === "live" ? "Live fortsetzen" : gameCenterEntry.status === "final" ? "Live-Feed ansehen" : "Live-Modus starten"}</Link> : null}
                <Link href={`/game-track?date=${encodeURIComponent(gameCenterEntry.date)}&context=${gameCenterEntry.kind}`} className="btn btn-outline btn-sm">Persönliche Stats</Link>
                <a href={googleCalendarUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">Kalender öffnen</a>
              </div>
            </section>;
          })() : (
            <section className="game-center game-center--empty">
              <p className="section-eyebrow">Game Center</p>
              <h2 className="section-title mt-1">Dein nächstes Spiel an einem Ort</h2>
              <p className="mt-1 text-sm text-muted">Sobald ein Spiel deines Teams im Saisonplan steht, bündelt das Game Center Organisation, Teilnahme, Scouting, Live-Modus und Auswertung.</p>
            </section>
          )}

          <div className="app-card">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="section-eyebrow">Saison-Spielplan</p><h2 className="section-title mt-1">Chronologischer Spielplan</h2><p className="mt-1 text-xs text-muted">{schedule.length} Spiele · {schedule.filter(isCompletedLeagueGame).length} gültige Ergebnisse</p></div><div className="flex flex-wrap gap-2"><button type="button" className="btn btn-outline btn-sm" onClick={() => void createCalendarSubscription()}>Kalender abonnieren</button><button type="button" className="btn btn-outline btn-sm" onClick={handleSyncAllUpcoming}>Eigene anstehende → Wochenplan</button></div></div>
            <div className="league-export-bar mt-3">
              <label className="league-export-bar__select">
                <span className="input-label">Spielplan exportieren für</span>
                <select value={exportTeamId} onChange={(event) => setExportTeamId(event.target.value)} className="select app-modern-select mt-1">
                  <option value={LEAGUE_OWN_TEAM_ID}>{bundle.ownTeam.name} (mein Team)</option>
                  {teams.filter((team) => team.id !== LEAGUE_OWN_TEAM_ID).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  <option value="all">Alle Teams der Saison</option>
                </select>
              </label>
              <div className="league-export-bar__actions">
                <button type="button" className="btn btn-outline btn-sm" disabled={exportSchedule.length === 0} onClick={exportCalendar}>iCal exportieren</button>
                <button type="button" className="btn btn-outline btn-sm" disabled={exportSchedule.length === 0} onClick={exportScheduleCsv}>CSV exportieren</button>
              </div>
              <p className="league-export-bar__hint">{exportSchedule.length} Spiel{exportSchedule.length === 1 ? "" : "e"} in der Auswahl · {exportTeamName}</p>
            </div>
            {calendarFeedUrl ? <div className="calendar-feed-panel mt-3"><div><strong>Automatisches Kalender-Abo</strong><p>Dieser private Link aktualisiert den Spielplan in Apple Kalender, Google Kalender und anderen Kalender-Apps.</p><code>{calendarFeedUrl}</code></div><div className="flex flex-wrap gap-2"><a href={calendarFeedUrl.replace(/^https:/, "webcal:")} className="btn btn-primary btn-sm">In Kalender öffnen</a><button type="button" className="btn btn-outline btn-sm" onClick={() => void navigator.clipboard.writeText(calendarFeedUrl).then(() => setMessage("Kalender-Link kopiert."))}>Link kopieren</button><button type="button" className="btn btn-danger-outline btn-sm" onClick={() => void revokeCalendarSubscription()}>Widerrufen</button></div></div> : null}
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
                    return <article key={entry.id} className={`league-fixture league-fixture--${entry.status ?? "scheduled"}`}><div className="league-fixture__time"><strong>{entry.startTime ?? "–:–"}</strong><span>{entry.meetingTime ? `Treffen ${entry.meetingTime}` : entry.startTime ? "Uhr" : "Zeit offen"}</span></div><div className="league-fixture__teams"><span>{home?.name ?? "Heimteam"}</span><span>{away?.name ?? "Auswärtsteam"}</span>{entry.venueName ? <small>{entry.venueName}{entry.travelMinutes != null ? ` · ${entry.travelMinutes} Min. Anfahrt` : ""}</small> : null}</div><div className={`league-fixture__result ${finished ? "league-fixture__result--final" : ""}`}><strong>{finished ? `${entry.homeScore} : ${entry.awayScore}` : gameStatusLabel(entry.status)}</strong><span>{entry.kind === "game" ? "Liga" : "Testspiel"}{attendance.length ? ` · ${attendance.filter((item) => item.status === "yes").length} Zusagen` : ""}</span></div>{gameInvolvesOwnTeam(entry) ? <button type="button" className="btn btn-outline btn-xs league-fixture__open" onClick={() => { setGameCenterId(entry.id); openGameDetails(entry.id); }}>Öffnen</button> : null}</article>;
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
                return <details id={`league-game-${entry.id}`} key={entry.id} className="league-game-card scroll-mt-6"><summary className="league-game-card__summary"><div><p className="font-bold text-strong">{home?.name ?? "Heimteam"} <span className="league-score">{entry.homeScore ?? "–"} : {entry.awayScore ?? "–"}</span> {away?.name ?? "Auswärtsteam"}</p><p className="mt-1 text-xs text-muted">{formatGameDateTimeLabel(entry.date, entry.startTime)} · {entry.kind === "game" ? "Ligaspiel" : "Test-/Trainingsspiel"} · {gameStatusLabel(entry.status)}{entry.syncedAt ? " · Im Wochenplan" : ""}</p></div><span className={`chip ${validationIssues.length ? "chip-warning" : ""}`}>{validationIssues.length ? `${validationIssues.length} Hinweise` : "Details"}</span></summary>
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
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
                      <ModernDateInput value={entry.attendanceDeadline?.split("T")[0] ?? ""} onChange={(value) => updateAttendanceDeadline(entry, "date", value)} label="Zusagefrist (Datum)" max={entry.date} className="league-game-field" controlClassName="league-game-control" />
                      <ModernTimeInput value={entry.attendanceDeadline?.split("T")[1] ?? ""} onChange={(value) => updateAttendanceDeadline(entry, "time", value)} label="Zusagefrist (Uhrzeit)" className="league-game-field" controlClassName="league-game-control" />
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

    </main>
  );
}
