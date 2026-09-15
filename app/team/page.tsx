"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ShootingZoneHeatmap from "@/components/ShootingZoneHeatmap";
import TopSubTabs from "@/components/TopSubTabs";
import GradientFadeList from "@/components/GradientFadeList";
import TeamVideoLibrary from "@/components/TeamVideoLibrary";
import {
  OPPONENT_STYLE_LABELS,
  OPPONENT_STYLE_TAGS,
  toggleOpponentStyle,
  type OpponentStyleTag,
} from "@/lib/opponent-styles";
import { buildStartLineupRecommendation, buildTeamMatchupHints } from "@/lib/matchup-hints";
import {
  connectLeagueOwnTeam,
  createEmptyLeagueBundle,
  getActiveSeason,
  LEAGUE_UPDATED_EVENT,
  loadLeagueBundle,
  opponentsForSeason,
  saveLeagueBundle,
} from "@/lib/league";
import {
  buildTeamOpponentOptions,
  normalizeTeamOpponentName,
  updateLeagueOpponentScouting,
  type TeamOpponentOption,
} from "@/lib/team-league-opponents";
import type { TeamCoachResponse, TeamDetail, TeamRole, TeamShareLevel, TeamSummary } from "@/lib/team-types";
import { isAppOnline } from "@/lib/app-online";
import { fetchAuthMe } from "@/lib/auth-session-align";
import { getWorkoutSessions } from "@/lib/session-storage";
import { syncWorkoutSessionsToCloudWithRetry } from "@/lib/sync-workout-sessions";
import { teamJoinErrorMessage } from "@/lib/team-join-errors";
import { parseJoinInviteToken } from "@/lib/team-invite-token";
import {
  loadCachedTeamDetail,
  loadCachedTeamList,
  saveCachedTeamDetail,
  saveCachedTeamList,
} from "@/lib/team-local-cache";
import { useT } from "@/lib/i18n/I18nProvider";

type TeamTab = "overview" | "roster" | "plays" | "scouting" | "advice";

const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  captain: "Captain",
  player: "Spieler",
  coach: "Trainer",
};

function formToneClass(tone: "green" | "yellow" | "red") {
  return tone === "green" ? "text-emerald-300" : tone === "red" ? "text-rose-300" : "text-amber-300";
}

function opponentSourceLabel(opponent: TeamOpponentOption) {
  if (opponent.source === "league-and-scouting") return "Liga + Scouting";
  return opponent.source === "league" ? "Aus der Liga" : "Team-Scouting";
}

function opponentProfileSummary(opponent: TeamOpponentOption) {
  return [
    opponent.strengths?.trim() ? `Stärken: ${opponent.strengths.trim()}` : null,
    opponent.weaknesses?.trim() ? `Schwächen: ${opponent.weaknesses.trim()}` : null,
    opponent.defenseNotes?.trim() ? `Defense: ${opponent.defenseNotes.trim()}` : null,
  ].filter(Boolean).join(" · ");
}

export default function TeamPage() {
  const t = useT();
  const router = useRouter();
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [tab, setTab] = useState<TeamTab>("overview");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [joinToken, setJoinToken] = useState("");
  const [coachAdvice, setCoachAdvice] = useState<TeamCoachResponse | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [scoutingName, setScoutingName] = useState("");
  const [scoutingStyles, setScoutingStyles] = useState<OpponentStyleTag[]>([]);
  const [scoutingNotes, setScoutingNotes] = useState("");
  const [scoutingManual, setScoutingManual] = useState(false);
  const [adviceOpponent, setAdviceOpponent] = useState("");
  const [leagueBundle, setLeagueBundle] = useState(createEmptyLeagueBundle);
  const [authMe, setAuthMe] = useState<{ id: string; email: string; cloudWorkouts14d: number; cloudSessionCount: number } | null>(null);
  const [shareLevelSaving, setShareLevelSaving] = useState(false);
  const [roleSavingUserId, setRoleSavingUserId] = useState<string | null>(null);

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [teams, selectedTeamId],
  );
  const viewerRole = selectedTeam?.role ?? "player";
  const canManageTeam = viewerRole === "owner" || viewerRole === "captain";
  const isCoachViewer = viewerRole === "coach";

  const activeLeagueSeason = useMemo(() => getActiveSeason(leagueBundle), [leagueBundle]);
  const leagueOpponents = useMemo(
    () => activeLeagueSeason
      ? opponentsForSeason(leagueBundle, activeLeagueSeason.id)
      : leagueBundle.opponents,
    [activeLeagueSeason, leagueBundle],
  );
  const opponentOptions = useMemo(
    () => buildTeamOpponentOptions(leagueOpponents, detail?.scouting ?? []),
    [detail?.scouting, leagueOpponents],
  );
  const selectedAdviceOpponent = useMemo(
    () => opponentOptions.find(
      (opponent) => normalizeTeamOpponentName(opponent.name) === normalizeTeamOpponentName(adviceOpponent),
    ) ?? null,
    [adviceOpponent, opponentOptions],
  );
  const selectedScoutingOpponent = useMemo(
    () => opponentOptions.find(
      (opponent) => normalizeTeamOpponentName(opponent.name) === normalizeTeamOpponentName(scoutingName),
    ) ?? null,
    [opponentOptions, scoutingName],
  );

  const viewerMember = useMemo(
    () => detail?.members.find((member) => member.userId === authMe?.id) ?? null,
    [detail?.members, authMe?.id],
  );

  const loadTeams = useCallback(async () => {
    const cached = loadCachedTeamList();
    const hasCache = (cached?.length ?? 0) > 0;
    if (hasCache && cached) {
      setTeams(cached);
      setSelectedTeamId((current) => current ?? cached[0]?.id ?? null);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const response = await fetch("/api/team", { cache: "no-store" });
      if (response.status === 401) {
        if (!hasCache) {
          setMessage("Bitte einloggen, um Teams zu nutzen.");
          setTeams([]);
        }
        return;
      }
      if (!response.ok) throw new Error("Team-Liste konnte nicht geladen werden.");
      const json = (await response.json()) as { teams: TeamSummary[] };
      const nextTeams = json.teams ?? [];
      setTeams(nextTeams);
      saveCachedTeamList(nextTeams);
      setSelectedTeamId((current) => current ?? nextTeams[0]?.id ?? null);
      setMessage(null);
    } catch (error) {
      if (hasCache) {
        setMessage(
          typeof navigator !== "undefined" && !navigator.onLine
            ? "Offline — zuletzt gespeicherte Team-Daten."
            : null,
        );
      } else {
        setMessage(error instanceof Error ? error.message : "Fehler beim Laden.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAuthDiagnostics = useCallback(async () => {
    const me = await fetchAuthMe();
    if (me) {
      setAuthMe({
        id: me.id,
        email: me.email,
        cloudWorkouts14d: me.cloud.workouts14d,
        cloudSessionCount: me.cloud.sessionCount,
      });
    } else {
      setAuthMe(null);
    }
    return me;
  }, []);

  const loadDetail = useCallback(async (teamId: string) => {
    const cached = loadCachedTeamDetail(teamId);
    if (cached) setDetail(cached);

    if (!isAppOnline()) {
      if (cached) {
        setMessage("Offline — zuletzt gespeicherte Team-Details.");
      }
      return;
    }

    try {
      const me = await refreshAuthDiagnostics();
      const syncResult = await syncWorkoutSessionsToCloudWithRetry();
      await refreshAuthDiagnostics();
      const response = await fetch(`/api/team/${teamId}`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("Team-Details konnten nicht geladen werden.");
      const json = (await response.json()) as TeamDetail;
      setDetail(json);
      saveCachedTeamDetail(teamId, json);
      const localCount = getWorkoutSessions().length;

      if (!me) {
        setMessage("Nicht eingeloggt — Session-Cookie fehlt. Bitte erneut anmelden.");
      } else if (!syncResult.ok) {
        setMessage(
          `Workout-Sync fehlgeschlagen. Bitte später erneut versuchen oder dich neu anmelden.`,
        );
      } else if (localCount > 0 && me.cloud.workouts14d === 0) {
        setMessage(
          `Lokal ${localCount} Workout(s), in der Cloud 0 — bitte Sync ausführen oder erneut einloggen.`,
        );
      } else if (json.syncMeta && !json.syncMeta.progressFound) {
        setMessage("Fortschritt in Supabase nicht gefunden — nach Workout Profil öffnen, dann Team erneut.");
      } else if (json.syncMeta && json.syncMeta.workouts14d === 0 && localCount === 0) {
        setMessage("Noch keine Workouts — Training abschließen (alle Sätze erfassen), dann Team neu öffnen.");
      } else {
        setMessage(null);
      }
    } catch (error) {
      if (!cached) {
        setMessage(error instanceof Error ? error.message : "Fehler beim Laden der Team-Details.");
      } else if (typeof navigator !== "undefined" && !navigator.onLine) {
        setMessage("Offline — zuletzt gespeicherte Team-Details.");
      }
    }
  }, [refreshAuthDiagnostics]);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    const refreshLeague = () => setLeagueBundle(loadLeagueBundle());
    refreshLeague();
    window.addEventListener(LEAGUE_UPDATED_EVENT, refreshLeague);
    window.addEventListener("storage", refreshLeague);
    return () => {
      window.removeEventListener(LEAGUE_UPDATED_EVENT, refreshLeague);
      window.removeEventListener("storage", refreshLeague);
    };
  }, []);

  useEffect(() => {
    if (!selectedTeamId) {
      setDetail(null);
      return;
    }
    setDetail(loadCachedTeamDetail(selectedTeamId));
    void loadDetail(selectedTeamId);
  }, [loadDetail, selectedTeamId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const join = params.get("join");
    if (join) setJoinToken(join);
  }, []);

  const lineup = useMemo(() => {
    if (!detail) return null;
    return buildStartLineupRecommendation(
      detail.members.map((member) => ({
        displayName: member.displayName,
        position: member.position,
        playStyle: member.playStyle,
        formScore: member.form.score,
      })),
    );
  }, [detail]);

  const matchupHints = useMemo(() => {
    if (!detail) return [];
    return buildTeamMatchupHints({
      opponentStyles: selectedAdviceOpponent?.styles ?? [],
      roster: detail.members.map((member) => ({
        displayName: member.displayName,
        position: member.position,
        playStyle: member.playStyle,
        formScore: member.form.score,
      })),
    });
  }, [detail, selectedAdviceOpponent]);

  const createTeam = async () => {
    const name = newTeamName.trim();
    if (!name) return;
    const response = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = (await response.json().catch(() => null)) as {
      team?: TeamSummary;
      error?: string;
      message?: string;
      detail?: string | null;
    } | null;

    if (response.status === 401) {
      setMessage("Bitte einloggen, um ein Team zu erstellen.");
      return;
    }
    if (response.status === 503 && json?.error === "missing_service_role") {
      setMessage("Team-Funktion vorübergehend nicht verfügbar. Bitte später erneut versuchen.");
      return;
    }
    if (!response.ok || !json?.team) {
      const hint = json?.message ?? json?.error ?? `HTTP ${response.status}`;
      const detail = json?.detail ? ` (${json.detail.slice(0, 120)})` : "";
      setMessage(`Team konnte nicht erstellt werden: ${hint}${detail}`);
      return;
    }
    setNewTeamName("");
    setSelectedTeamId(json.team.id);
    const nextLeagueBundle = connectLeagueOwnTeam(loadLeagueBundle(), json.team);
    saveLeagueBundle(nextLeagueBundle);
    setLeagueBundle(nextLeagueBundle);
    setMessage("Team erstellt und als eigenes Liga-Team verbunden.");
    await loadTeams();
  };

  const joinTeam = async () => {
    const token = parseJoinInviteToken(joinToken);
    if (!token) return;
    const response = await fetch("/api/team/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ token }),
    });
    const json = (await response.json().catch(() => null)) as { error?: string; teamId?: string } | null;
    if (!response.ok) {
      if (response.status === 401) {
        const next = `/team?join=${encodeURIComponent(token)}`;
        router.push(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      setMessage(teamJoinErrorMessage(response.status, json?.error));
      return;
    }
    setJoinToken("");
    setSelectedTeamId(json?.teamId ?? null);
    setMessage("Team beigetreten.");
    await loadTeams();
  };

  const chooseScoutingOpponent = (opponent: TeamOpponentOption) => {
    setScoutingManual(false);
    setScoutingName(opponent.name);
    setScoutingStyles(opponent.styles);
    setScoutingNotes(opponent.notes ?? "");
  };

  const resetScoutingForm = () => {
    setScoutingName("");
    setScoutingNotes("");
    setScoutingStyles([]);
    setScoutingManual(false);
  };

  const handleScoutingOpponentChange = (value: string) => {
    if (value === "__manual__") {
      resetScoutingForm();
      setScoutingManual(true);
      return;
    }
    if (!value) {
      resetScoutingForm();
      return;
    }
    const opponent = opponentOptions.find((entry) => entry.id === value);
    if (opponent) chooseScoutingOpponent(opponent);
  };

  const saveScouting = async () => {
    const opponentName = scoutingName.trim();
    if (!selectedTeamId || !opponentName) return;
    const response = await fetch("/api/team/scouting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId: selectedTeamId,
        opponentName,
        styles: scoutingStyles,
        notes: scoutingNotes.trim() || undefined,
      }),
    });
    if (!response.ok) {
      setMessage("Scouting konnte nicht gespeichert werden.");
      return;
    }
    const currentLeagueBundle = loadLeagueBundle();
    const nextLeagueBundle = updateLeagueOpponentScouting(
      currentLeagueBundle,
      opponentName,
      scoutingStyles,
      scoutingNotes,
    );
    if (nextLeagueBundle !== currentLeagueBundle) saveLeagueBundle(nextLeagueBundle);
    setLeagueBundle(nextLeagueBundle);
    resetScoutingForm();
    setMessage(
      nextLeagueBundle !== currentLeagueBundle
        ? "Scouting im Team und beim Liga-Gegner gespeichert."
        : "Gegner-Scouting gespeichert.",
    );
    await loadDetail(selectedTeamId);
  };

  const fetchCoachAdvice = async () => {
    if (!selectedTeamId) return;
    setCoachLoading(true);
    try {
      const response = await fetch("/api/team/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          teamId: selectedTeamId,
          opponentName: adviceOpponent || undefined,
          opponentStyles: selectedAdviceOpponent?.styles ?? [],
        }),
      });
      if (!response.ok) throw new Error("Coach-Empfehlung fehlgeschlagen.");
      setCoachAdvice((await response.json()) as TeamCoachResponse);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Coach-Fehler.");
    } finally {
      setCoachLoading(false);
    }
  };

  const updateShareLevel = async (shareLevel: TeamShareLevel) => {
    if (!selectedTeamId) return;
    const previousDetail = detail;
    const optimisticDetail = detail ? {
      ...detail,
      members: detail.members.map((member) => member.userId === authMe?.id ? { ...member, shareLevel } : member),
    } : null;
    if (optimisticDetail) {
      setDetail(optimisticDetail);
      saveCachedTeamDetail(selectedTeamId, optimisticDetail);
    }
    setShareLevelSaving(true);
    try {
      const response = await fetch("/api/team/member", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ teamId: selectedTeamId, shareLevel }),
      });
      if (!response.ok) throw new Error("Freigabe konnte nicht gespeichert werden.");
      setMessage(shareLevel === "full" ? "Volles Teilen aktiviert." : "Nur Zusammenfassung wird geteilt.");
    } catch (error) {
      if (previousDetail) {
        setDetail(previousDetail);
        saveCachedTeamDetail(selectedTeamId, previousDetail);
      }
      setMessage(error instanceof Error ? error.message : "Freigabe konnte nicht gespeichert werden.");
    } finally {
      setShareLevelSaving(false);
    }
  };

  const connectSelectedTeamToLeague = () => {
    if (!selectedTeam) return;
    const nextLeagueBundle = connectLeagueOwnTeam(loadLeagueBundle(), selectedTeam);
    saveLeagueBundle(nextLeagueBundle);
    setLeagueBundle(nextLeagueBundle);
    setMessage(`„${selectedTeam.name}“ ist jetzt dein eigenes Team im Liga-Bereich.`);
  };

  const copyInvite = async (inviteRole: "player" | "coach" = "player") => {
    if (!selectedTeamId) return;
    try {
      const response = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ teamId: selectedTeamId, inviteRole }),
      });
      if (!response.ok) throw new Error("invite_load_failed");
      const json = (await response.json()) as { token?: string; inviteRole?: string };
      const token = json.token;
      if (!token) {
        setMessage("Keine Einladung verfügbar. Bitte später erneut versuchen.");
        return;
      }
      const link = `${window.location.origin}/team?join=${encodeURIComponent(token)}`;
      await navigator.clipboard.writeText(link);
      setMessage(
        inviteRole === "coach"
          ? "Trainer-Einladungslink kopiert (inklusive Video-Upload)."
          : "Spieler-Einladungslink kopiert.",
      );
    } catch {
      setMessage("Einladungslink konnte nicht geladen werden.");
    }
  };

  const updateMemberRole = async (memberUserId: string, role: Extract<TeamRole, "player" | "coach" | "captain">) => {
    if (!selectedTeamId) return;
    setRoleSavingUserId(memberUserId);
    try {
      const response = await fetch("/api/team/member", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ teamId: selectedTeamId, memberUserId, role }),
      });
      if (!response.ok) throw new Error("Rolle konnte nicht gespeichert werden.");
      await loadDetail(selectedTeamId);
      setMessage("Rolle aktualisiert.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rolle konnte nicht gespeichert werden.");
    } finally {
      setRoleSavingUserId(null);
    }
  };

  return (
    <main className="app-container animate-in">
      <PageHeader
        eyebrow={t("team.eyebrow")}
        eyebrowTone="violet"
        title={t("team.title")}
        subtitle={t("team.subtitle")}
      />

      <div className="mt-3">
        <TopSubTabs
          variant="team-liga"
          items={[
            { labelKey: "tabs.team", href: "/team" },
            { labelKey: "tabs.liga", href: "/liga" },
          ]}
        />
      </div>

      {message ? (
        <p
          className={`mt-3 ${message.includes("kopiert") ? "alert-success" : "alert-info"}`}
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}

      <section className="mt-4 app-card">
        <p className="section-eyebrow">Team verwalten</p>
        {isCoachViewer ? (
          <p className="mt-2 text-sm text-muted">Trainer-Ansicht — Kader, Wochenpläne und Empfehlungen ansehen sowie Team-Videos teilen.</p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="input-label">Neues Team</label>
              <div className="team-inline-form mt-1">
                <input
                  value={newTeamName}
                  onChange={(event) => setNewTeamName(event.target.value)}
                  placeholder="z. B. U18 Lions"
                  className="input"
                />
                <button type="button" className="btn btn-primary" onClick={() => void createTeam()}>
                  {t("team.create")}
                </button>
              </div>
            </div>
            <div>
              <label className="input-label">Team beitreten</label>
              <div className="team-inline-form mt-1">
                <input
                  value={joinToken}
                  onChange={(event) => setJoinToken(parseJoinInviteToken(event.target.value) || event.target.value)}
                  placeholder="Einladungs-Token"
                  className="input"
                />
                <button type="button" className="btn btn-outline" onClick={() => void joinTeam()}>
                  {t("team.join")}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {loading ? <p className="mt-6 text-sm text-muted">{t("team.loading")}</p> : null}

      {!loading && teams.length === 0 ? (
        <section className="mt-6 app-card">
          <p className="text-sm text-muted">{t("team.empty")}</p>
        </section>
      ) : null}

      {teams.length > 0 ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {teams.map((team) => (
              <button
                key={team.id}
                type="button"
                onClick={() => setSelectedTeamId(team.id)}
                className={`chip ${selectedTeamId === team.id ? "chip-active" : ""}`}
              >
                {team.name} ({team.memberCount})
              </button>
            ))}
          </div>

          {detail ? (
            <>
              <div className="mt-4 top-tabs team-section-tabs">
                {(
                  [
                    ["overview", t("team.tabOverview")],
                    ["roster", t("team.tabRoster")],
                    ["plays", t("team.tabPlays")],
                    ["scouting", t("team.tabScouting")],
                    ["advice", t("team.tabAdvice")],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`top-tabs__btn ${tab === id ? "top-tabs__btn--active" : ""}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {canManageTeam ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-outline" onClick={() => void copyInvite("player")}>
                    {t("team.invitePlayer")}
                  </button>
                  {canManageTeam ? (
                    <button type="button" className="btn btn-outline" onClick={() => void copyInvite("coach")}>
                      {t("team.inviteCoach")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`btn ${leagueBundle.ownTeam.sourceTeamId === selectedTeamId ? "btn-cyan" : "btn-outline"}`}
                    disabled={!selectedTeam || leagueBundle.ownTeam.sourceTeamId === selectedTeamId}
                    onClick={connectSelectedTeamToLeague}
                  >
                    {leagueBundle.ownTeam.sourceTeamId === selectedTeamId ? "Mit Liga verbunden" : "Als Liga-Team verwenden"}
                  </button>
                </div>
              ) : null}

              {viewerMember ? (
                <section className="mt-4 app-card">
                  <p className="section-eyebrow">Datenschutz im Team</p>
                  <h2 className="section-title mt-1">Was Teammitglieder sehen</h2>
                  <p className="mt-2 text-xs text-muted">
                    Steuere, wie viele Trainings-Details andere im Kader sehen. Du siehst deine eigenen Daten immer vollständig.
                  </p>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={viewerMember.shareLevel === "full"}
                    disabled={shareLevelSaving}
                    className={`team-share-toggle mt-3 ${viewerMember.shareLevel === "full" ? "team-share-toggle--active" : ""}`}
                    onClick={() => void updateShareLevel(viewerMember.shareLevel === "full" ? "summary" : "full")}
                  >
                    <span className="team-share-toggle__track" aria-hidden><span /></span>
                    <span className="team-share-toggle__copy"><strong>Trainingsdetails teilen</strong><small>{viewerMember.shareLevel === "full" ? "Aktiviert" : "Deaktiviert"}</small></span>
                    <span className="team-share-toggle__state">{shareLevelSaving ? "Speichert …" : viewerMember.shareLevel === "full" ? "An" : "Aus"}</span>
                  </button>
                  <p className="mt-2 text-xs text-muted">
                    {viewerMember.shareLevel === "full"
                      ? "Andere sehen Form-Score, Spielstil und Trainings-Hinweise."
                      : "Andere sehen nur Form-Score und Aktivitätszahlen — keine Detail-Hinweise."}
                  </p>
                </section>
              ) : null}

              {tab === "overview" ? (
                <section className="mt-4 app-card">
                  <p className="section-eyebrow">{detail.team.clubName ?? "Team"}</p>
                  <h2 className="section-title mt-1">{detail.team.name}</h2>
                  <p className="mt-1 text-xs text-muted">
                    {detail.members.length} Spieler · Saison {detail.team.season ?? "—"}
                  </p>
                  <GradientFadeList
                    className="mt-4"
                    items={detail.members}
                    listClassName="space-y-2"
                    getKey={(member) => member.id}
                    renderItem={(member, index) => (
                      <div className="list-card flex items-center justify-between text-sm">
                        <p className="font-semibold text-strong">
                          #{index + 1} {member.displayName}
                          <span className="ml-2 text-xs uppercase text-faint">{member.position ?? "—"}</span>
                        </p>
                        <p className={`font-semibold tabular-nums ${formToneClass(member.form.tone)}`}>{member.form.score}</p>
                      </div>
                    )}
                  />
                </section>
              ) : null}

              {tab === "overview" && detail.memberWeekPlans && detail.memberWeekPlans.length > 0 ? (
                <section className="mt-4 app-card">
                  <p className="section-eyebrow">Trainer-Ansicht</p>
                  <h2 className="section-title mt-1">Geteilte Wochenpläne</h2>
                  <p className="mt-1 text-xs text-muted">Read-only — nur von Spielern mit „Volles Teilen“.</p>
                  <div className="mt-3 space-y-3">
                    {detail.memberWeekPlans.map((plan) => (
                      <div key={plan.memberId} className="list-card">
                        <p className="text-sm font-semibold text-strong">{plan.displayName}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {plan.days.map((day) => (
                            <span key={`${plan.memberId}-${day.day}`} className="chip chip-sm text-xs">
                              {({ monday: "Mo", tuesday: "Di", wednesday: "Mi", thursday: "Do", friday: "Fr", saturday: "Sa", sunday: "So" } as Record<string, string>)[day.day] ?? day.day}{" "}
                              {day.label} {day.minutes > 0 ? `${day.minutes}m` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {tab === "roster" ? (
                <section className="mt-4 app-card">
                  <h2 className="section-title">Kader & Form</h2>
                  <GradientFadeList
                    className="mt-3"
                    items={detail.members}
                    listClassName="space-y-2"
                    getKey={(member) => member.id}
                    renderItem={(member) => (
                      <div className="list-card text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-strong">
                              {member.displayName}{" "}
                              <span className="text-xs font-normal text-muted">· {TEAM_ROLE_LABELS[member.role] ?? member.role}</span>
                            </p>
                            <p className="text-xs text-muted">
                              {member.position ?? "—"} · {member.playStyle ?? "—"} · {member.recentWorkouts} Workouts (14 T.) ·{" "}
                              {member.recentGames} Spiele
                            </p>
                            {member.gameTrainingInsight ? (
                              <p className="mt-1 text-xs text-muted">{member.gameTrainingInsight}</p>
                            ) : null}
                            {member.recentWorkouts === 0 && member.recentGames === 0 ? (
                              <p className="mt-1 text-xs text-amber-600">
                                Noch keine Cloud-Daten — Workout abschließen oder Team-Seite nach dem Training neu öffnen.
                              </p>
                            ) : null}
                            {canManageTeam && member.userId !== authMe?.id && member.role !== "owner" ? (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {(["player", "coach", "captain"] as const).map((role) => (
                                  <button
                                    key={role}
                                    type="button"
                                    disabled={roleSavingUserId === member.userId || member.role === role}
                                    className={`chip chip-sm ${member.role === role ? "chip-active" : ""}`}
                                    onClick={() => void updateMemberRole(member.userId, role)}
                                  >
                                    {TEAM_ROLE_LABELS[role]}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <p className={`text-lg font-bold tabular-nums ${formToneClass(member.form.tone)}`}>{member.form.score}</p>
                        </div>
                        <p className="mt-2 text-xs text-muted">{member.form.reasons[0] ?? "—"}</p>
                        {member.shootingZoneTotals ? (
                          <div className="mt-3">
                            <p className="text-xs font-semibold text-strong">Wurfzonen (geteilt)</p>
                            <ShootingZoneHeatmap totals={member.shootingZoneTotals} className="mt-2" />
                          </div>
                        ) : null}
                      </div>
                    )}
                  />
                </section>
              ) : null}

              {tab === "plays" && selectedTeamId ? (
                <TeamVideoLibrary teamId={selectedTeamId} viewerRole={viewerRole} />
              ) : null}

              {tab === "scouting" && canManageTeam ? (
                <section className="mt-4 app-card team-workflow-card">
                  <div className="team-workflow-header">
                    <div>
                      <p className="section-eyebrow">Liga-Verknüpfung</p>
                      <h2 className="section-title mt-1">Gegner-Scouting</h2>
                      <p className="mt-2 text-sm text-muted">
                        Gegner aus {activeLeagueSeason ? `„${activeLeagueSeason.name}“` : "der Liga"} stehen hier automatisch bereit.
                      </p>
                    </div>
                    <div className="team-workflow-header__actions">
                      <span className="team-source-pill team-source-pill--league">{leagueOpponents.length} Liga-Gegner</span>
                      <Link href="/liga" className="btn btn-outline">Liga verwalten</Link>
                    </div>
                  </div>

                  <div className="team-scouting-layout mt-5">
                    <div className="team-workflow-panel">
                      <label className="input-label" htmlFor="team-scouting-opponent">Gegner auswählen</label>
                      <select
                        id="team-scouting-opponent"
                        value={scoutingManual ? "__manual__" : (selectedScoutingOpponent?.id ?? "")}
                        onChange={(event) => handleScoutingOpponentChange(event.target.value)}
                        className="select app-unified-control app-modern-select mt-1"
                      >
                        <option value="">— Liga- oder Scouting-Gegner wählen —</option>
                        {opponentOptions.map((opponent) => (
                          <option key={opponent.id} value={opponent.id}>{opponent.name} · {opponentSourceLabel(opponent)}</option>
                        ))}
                        <option value="__manual__">＋ Neuen Gegner manuell erfassen</option>
                      </select>

                      {scoutingManual ? (
                        <div className="mt-3">
                          <label className="input-label" htmlFor="team-scouting-name">Name des Gegners</label>
                          <input
                            id="team-scouting-name"
                            value={scoutingName}
                            onChange={(event) => setScoutingName(event.target.value)}
                            className="input app-unified-control mt-1"
                            placeholder="z. B. City Falcons"
                          />
                        </div>
                      ) : null}

                      <div className="mt-3">
                        <label className="input-label" htmlFor="team-scouting-notes">Scouting-Notizen</label>
                        <textarea
                          id="team-scouting-notes"
                          value={scoutingNotes}
                          onChange={(event) => setScoutingNotes(event.target.value)}
                          className="textarea team-scouting-notes mt-1"
                          placeholder="Stärken, Schwächen, Schlüsselspieler, defensive Tendenzen …"
                          rows={4}
                        />
                      </div>

                      <fieldset className="mt-4">
                        <legend className="input-label">Spielstil und Matchup</legend>
                        <div className="team-style-grid mt-2">
                          {OPPONENT_STYLE_TAGS.map((tag) => {
                            const active = scoutingStyles.includes(tag);
                            return (
                              <button
                                key={tag}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setScoutingStyles((current) => toggleOpponentStyle(current, tag))}
                                className={`team-style-option ${active ? "team-style-option--active" : ""}`}
                              >
                                <span className="team-style-option__indicator" aria-hidden="true">{active ? "✓" : "+"}</span>
                                {OPPONENT_STYLE_LABELS[tag]}
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>

                      <div className="team-workflow-actions mt-4">
                        <button
                          type="button"
                          className="btn btn-primary team-workflow-primary"
                          disabled={!scoutingName.trim()}
                          onClick={() => void saveScouting()}
                        >
                          Scouting speichern
                        </button>
                        {scoutingName || scoutingManual ? (
                          <button type="button" className="btn btn-outline" onClick={resetScoutingForm}>Zurücksetzen</button>
                        ) : null}
                      </div>
                    </div>

                    <div className="team-opponent-pool">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="section-eyebrow">Gegnerpool</p>
                          <h3 className="section-title mt-1">Liga & Team-Scouting</h3>
                        </div>
                        <span className="text-xs text-muted">{opponentOptions.length} gesamt</span>
                      </div>
                      {opponentOptions.length > 0 ? (
                        <GradientFadeList
                          className="mt-3"
                          items={opponentOptions}
                          listClassName="space-y-2"
                          getKey={(opponent) => opponent.id}
                          renderItem={(opponent) => (
                            <button
                              type="button"
                              onClick={() => chooseScoutingOpponent(opponent)}
                              className={`team-opponent-card ${selectedScoutingOpponent?.id === opponent.id ? "team-opponent-card--active" : ""}`}
                            >
                              <span className="team-opponent-card__topline">
                                <strong>{opponent.name}</strong>
                                <span className={`team-source-pill team-source-pill--${opponent.source}`}>{opponentSourceLabel(opponent)}</span>
                              </span>
                              <span className="team-opponent-card__tags">
                                {opponent.styles.map((tag) => OPPONENT_STYLE_LABELS[tag]).join(" · ") || "Noch keine Stil-Tags"}
                              </span>
                              {opponentProfileSummary(opponent) ? <span className="team-opponent-card__notes">{opponentProfileSummary(opponent)}</span> : null}
                              {opponent.notes ? <span className="team-opponent-card__notes">{opponent.notes}</span> : null}
                            </button>
                          )}
                        />
                      ) : (
                        <div className="team-empty-state mt-3">
                          <strong>Noch keine Gegner vorhanden</strong>
                          <span>Lege Gegner in der Liga an oder erfasse sie hier manuell.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              ) : null}

              {tab === "scouting" && !canManageTeam ? (
                <section className="mt-4 app-card team-workflow-card">
                  <div className="team-workflow-header">
                    <div>
                      <p className="section-eyebrow">Liga-Verknüpfung</p>
                      <h2 className="section-title mt-1">Gegner-Scouting</h2>
                      <p className="mt-2 text-sm text-muted">
                        {isCoachViewer ? "Trainer-Ansicht" : "Spieler-Ansicht"} · Liga- und Teamdaten gemeinsam dargestellt.
                      </p>
                    </div>
                    <span className="team-source-pill team-source-pill--league">{opponentOptions.length} Gegner</span>
                  </div>
                  {opponentOptions.length > 0 ? (
                    <GradientFadeList
                      className="mt-5"
                      items={opponentOptions}
                      listClassName="grid gap-3 md:grid-cols-2"
                      getKey={(opponent) => opponent.id}
                      renderItem={(opponent) => (
                        <div className="team-opponent-card team-opponent-card--static">
                          <span className="team-opponent-card__topline">
                            <strong>{opponent.name}</strong>
                            <span className={`team-source-pill team-source-pill--${opponent.source}`}>{opponentSourceLabel(opponent)}</span>
                          </span>
                          <span className="team-opponent-card__tags">
                            {opponent.styles.map((tag) => OPPONENT_STYLE_LABELS[tag]).join(" · ") || "Noch keine Stil-Tags"}
                          </span>
                          {opponentProfileSummary(opponent) ? <span className="team-opponent-card__notes">{opponentProfileSummary(opponent)}</span> : null}
                          {opponent.notes ? <span className="team-opponent-card__notes">{opponent.notes}</span> : null}
                        </div>
                      )}
                    />
                  ) : (
                    <div className="team-empty-state mt-4"><strong>Noch kein Gegner-Scouting</strong><span>Gegner werden über die Liga oder das Team-Scouting ergänzt.</span></div>
                  )}
                </section>
              ) : null}

              {tab === "advice" ? (
                <section className="mt-4 space-y-4">
                  <div className="app-card team-workflow-card team-matchup-hero">
                    <div className="team-workflow-header">
                      <div>
                        <p className="section-eyebrow">Game Prep</p>
                        <h2 className="section-title mt-1">Start & Matchup</h2>
                        <p className="mt-2 text-sm text-muted">Start-Five, Matchup-Hinweise und Coach-Analyse aus Team- und Ligadaten.</p>
                      </div>
                      <div className="team-workflow-header__actions">
                        <span className="team-source-pill team-source-pill--league">{opponentOptions.length} Gegner verfügbar</span>
                        <Link href="/liga" className="btn btn-outline">Liga öffnen</Link>
                      </div>
                    </div>

                    <div className="team-matchup-toolbar mt-5">
                      <label className="team-matchup-selector" htmlFor="team-matchup-opponent">
                        <span className="input-label">Gegner für die Empfehlung</span>
                        <select
                          id="team-matchup-opponent"
                          value={adviceOpponent}
                          onChange={(event) => {
                            setAdviceOpponent(event.target.value);
                            setCoachAdvice(null);
                          }}
                          className="select app-unified-control app-modern-select mt-1"
                        >
                          <option value="">— Gegner aus Liga oder Scouting wählen —</option>
                          {opponentOptions.map((opponent) => (
                            <option key={opponent.id} value={opponent.name}>{opponent.name} · {opponentSourceLabel(opponent)}</option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="btn btn-primary team-workflow-primary"
                        disabled={coachLoading || !adviceOpponent}
                        onClick={() => void fetchCoachAdvice()}
                      >
                        {coachLoading ? "Analyse läuft …" : "Coach-Empfehlung erstellen"}
                      </button>
                    </div>

                    {selectedAdviceOpponent ? (
                      <div className="team-selected-opponent mt-4">
                        <div>
                          <span className="team-selected-opponent__label">Ausgewähltes Matchup</span>
                          <strong>{selectedAdviceOpponent.name}</strong>
                        </div>
                        <span className={`team-source-pill team-source-pill--${selectedAdviceOpponent.source}`}>{opponentSourceLabel(selectedAdviceOpponent)}</span>
                        <p>{selectedAdviceOpponent.styles.map((tag) => OPPONENT_STYLE_LABELS[tag]).join(" · ") || "Noch keine Stil-Tags – im Scouting ergänzen."}</p>
                        {opponentProfileSummary(selectedAdviceOpponent) ? <p>{opponentProfileSummary(selectedAdviceOpponent)}</p> : null}
                      </div>
                    ) : opponentOptions.length === 0 ? (
                      <div className="team-empty-state mt-4">
                        <strong>Noch keine Gegner verfügbar</strong>
                        <span>Füge zuerst in der Liga einen Gegner hinzu. Er erscheint anschließend automatisch hier.</span>
                        <Link href="/liga" className="btn btn-primary">Gegner in Liga anlegen</Link>
                      </div>
                    ) : null}
                  </div>

                  {lineup ? (
                    <div className="app-card team-result-card">
                      <p className="section-eyebrow">Regelbasiert</p>
                      <h3 className="section-title mt-1">Start-Five</h3>
                      <p className="mt-2 text-sm text-strong">
                        {lineup.starters.map((player) => player.displayName).join(" · ") || "—"}
                      </p>
                      <p className="mt-2 text-xs text-muted">{lineup.rationale.join(" ")}</p>
                    </div>
                  ) : null}

                  {selectedAdviceOpponent && matchupHints.length > 0 ? (
                    <div className="app-card team-result-card">
                      <p className="section-eyebrow">Gegen {selectedAdviceOpponent.name}</p>
                      <h3 className="section-title mt-1">Matchup-Hinweise</h3>
                      <GradientFadeList
                        className="mt-3"
                        items={matchupHints}
                        listClassName="space-y-2"
                        getKey={(hint) => hint.title}
                        renderItem={(hint) => (
                          <div className="list-card text-sm">
                            <p className="font-semibold text-strong">{hint.title}</p>
                            <p className="mt-1 text-muted">{hint.detail}</p>
                          </div>
                        )}
                      />
                    </div>
                  ) : null}

                  {coachAdvice ? (
                    <section className="app-card--accent-violet">
                      <p className="section-eyebrow">Coach · {coachAdvice.source === "llm" ? "KI" : "Regeln"}</p>
                      <h3 className="section-title mt-1">{coachAdvice.headline}</h3>
                      <GradientFadeList
                        className="mt-3"
                        items={coachAdvice.bullets}
                        listClassName="list-disc space-y-2 pl-5 text-sm text-strong"
                        getKey={(bullet, index) => `${bullet}-${index}`}
                        renderItem={(bullet) => <div>{bullet}</div>}
                        showMoreLabel={(hidden) => `Weitere Hinweise (${hidden})`}
                      />
                      {coachAdvice.starters.length > 0 ? (
                        <p className="mt-3 text-xs text-muted">Start: {coachAdvice.starters.join(", ")}</p>
                      ) : null}
                    </section>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
