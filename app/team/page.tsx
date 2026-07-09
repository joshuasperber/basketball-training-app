"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import ShootingZoneHeatmap from "@/components/ShootingZoneHeatmap";
import TopSubTabs from "@/components/TopSubTabs";
import GradientFadeList from "@/components/GradientFadeList";
import {
  OPPONENT_STYLE_LABELS,
  OPPONENT_STYLE_TAGS,
  toggleOpponentStyle,
  type OpponentStyleTag,
} from "@/lib/opponent-styles";
import { buildStartLineupRecommendation, buildTeamMatchupHints } from "@/lib/matchup-hints";
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

type TeamTab = "overview" | "roster" | "scouting" | "advice";

const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  captain: "Captain",
  player: "Spieler",
  coach: "Trainer",
};

function formToneClass(tone: "green" | "yellow" | "red") {
  return tone === "green" ? "text-emerald-300" : tone === "red" ? "text-rose-300" : "text-amber-300";
}

export default function TeamPage() {
  const t = useT();
  const [teams, setTeams] = useState<TeamSummary[]>(() =>
    typeof window !== "undefined" ? (loadCachedTeamList() ?? []) : [],
  );
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const cached = loadCachedTeamList();
    return cached?.[0]?.id ?? null;
  });
  const [detail, setDetail] = useState<TeamDetail | null>(() => {
    if (typeof window === "undefined") return null;
    const cached = loadCachedTeamList();
    const teamId = cached?.[0]?.id;
    return teamId ? loadCachedTeamDetail(teamId) : null;
  });
  const [tab, setTab] = useState<TeamTab>("overview");
  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    return !(loadCachedTeamList()?.length ?? 0);
  });
  const [message, setMessage] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [joinToken, setJoinToken] = useState("");
  const [coachAdvice, setCoachAdvice] = useState<TeamCoachResponse | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [scoutingName, setScoutingName] = useState("");
  const [scoutingStyles, setScoutingStyles] = useState<OpponentStyleTag[]>([]);
  const [scoutingNotes, setScoutingNotes] = useState("");
  const [adviceOpponent, setAdviceOpponent] = useState("");
  const [authMe, setAuthMe] = useState<{ id: string; email: string; cloudWorkouts14d: number; cloudSessionCount: number } | null>(null);
  const [localSessionCount, setLocalSessionCount] = useState(0);
  const [shareLevelSaving, setShareLevelSaving] = useState(false);
  const [roleSavingUserId, setRoleSavingUserId] = useState<string | null>(null);

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [teams, selectedTeamId],
  );
  const viewerRole = selectedTeam?.role ?? "player";
  const canManageTeam = viewerRole === "owner" || viewerRole === "captain";
  const isCoachViewer = viewerRole === "coach";

  const viewerMember = useMemo(
    () => detail?.members.find((member) => member.userId === authMe?.id) ?? null,
    [detail?.members, authMe?.id],
  );

  const loadTeams = useCallback(async () => {
    const cached = loadCachedTeamList();
    const hasCache = (cached?.length ?? 0) > 0;
    if (!hasCache) setLoading(true);
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
    setLocalSessionCount(getWorkoutSessions().length);
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
      setAdviceOpponent((current) => current || json.scouting[0]?.opponentName || "");
      const localCount = getWorkoutSessions().length;
      setLocalSessionCount(localCount);

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
    const opponent = detail.scouting.find((entry) => entry.opponentName === adviceOpponent);
    return buildTeamMatchupHints({
      opponentStyles: opponent?.styles ?? [],
      roster: detail.members.map((member) => ({
        displayName: member.displayName,
        position: member.position,
        playStyle: member.playStyle,
        formScore: member.form.score,
      })),
    });
  }, [adviceOpponent, detail]);

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
    setMessage("Team erstellt.");
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
        window.location.href = `/login?next=${encodeURIComponent(next)}`;
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

  const saveScouting = async () => {
    if (!selectedTeamId || !scoutingName.trim()) return;
    const response = await fetch("/api/team/scouting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId: selectedTeamId,
        opponentName: scoutingName.trim(),
        styles: scoutingStyles,
        notes: scoutingNotes.trim() || undefined,
      }),
    });
    if (!response.ok) {
      setMessage("Scouting konnte nicht gespeichert werden.");
      return;
    }
    setScoutingName("");
    setScoutingNotes("");
    setScoutingStyles([]);
    setMessage("Gegner-Scouting gespeichert.");
    await loadDetail(selectedTeamId);
  };

  const fetchCoachAdvice = async () => {
    if (!selectedTeamId) return;
    setCoachLoading(true);
    try {
      const opponent = detail?.scouting.find((entry) => entry.opponentName === adviceOpponent);
      const response = await fetch("/api/team/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          teamId: selectedTeamId,
          opponentName: adviceOpponent || undefined,
          opponentStyles: opponent?.styles ?? [],
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
    setShareLevelSaving(true);
    try {
      const response = await fetch("/api/team/member", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ teamId: selectedTeamId, shareLevel }),
      });
      if (!response.ok) throw new Error("Freigabe konnte nicht gespeichert werden.");
      await loadDetail(selectedTeamId);
      setMessage(shareLevel === "full" ? "Volles Teilen aktiviert." : "Nur Zusammenfassung wird geteilt.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Freigabe konnte nicht gespeichert werden.");
    } finally {
      setShareLevelSaving(false);
    }
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
          ? "Trainer-Einladungslink kopiert (read-only Ansicht)."
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

      {message ? <p className="mt-3 text-sm text-amber-200">{message}</p> : null}

      <section className="mt-4 app-card">
        <p className="section-eyebrow">Team verwalten</p>
        {isCoachViewer ? (
          <p className="mt-2 text-sm text-muted">Trainer-Ansicht (read-only) — Kader, Wochenpläne und Empfehlungen ansehen.</p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="input-label">Neues Team</label>
              <div className="mt-1 flex gap-2">
                <input
                  value={newTeamName}
                  onChange={(event) => setNewTeamName(event.target.value)}
                  placeholder="z. B. U18 Lions"
                  className="input"
                />
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void createTeam()}>
                  {t("team.create")}
                </button>
              </div>
            </div>
            <div>
              <label className="input-label">Team beitreten</label>
              <div className="mt-1 flex gap-2">
                <input
                  value={joinToken}
                  onChange={(event) => setJoinToken(parseJoinInviteToken(event.target.value) || event.target.value)}
                  placeholder="Einladungs-Token"
                  className="input"
                />
                <button type="button" className="btn btn-outline btn-sm" onClick={() => void joinTeam()}>
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
              <div className="mt-4 top-tabs">
                {(
                  [
                    ["overview", t("team.tabOverview")],
                    ["roster", t("team.tabRoster")],
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

              {["owner", "captain", "coach"].includes(viewerRole) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyInvite("player")}>
                    {t("team.invitePlayer")}
                  </button>
                  {canManageTeam ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyInvite("coach")}>
                      {t("team.inviteCoach")}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {viewerMember ? (
                <section className="mt-4 app-card">
                  <p className="section-eyebrow">Datenschutz im Team</p>
                  <h2 className="section-title mt-1">Was Teammitglieder sehen</h2>
                  <p className="mt-2 text-xs text-muted">
                    Steuere, wie viele Trainings-Details andere im Kader sehen. Du siehst deine eigenen Daten immer vollständig.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={shareLevelSaving}
                      className={`chip ${viewerMember.shareLevel === "summary" ? "chip-active" : ""}`}
                      onClick={() => void updateShareLevel("summary")}
                    >
                      Nur Zusammenfassung
                    </button>
                    <button
                      type="button"
                      disabled={shareLevelSaving}
                      className={`chip ${viewerMember.shareLevel === "full" ? "chip-success" : ""}`}
                      onClick={() => void updateShareLevel("full")}
                    >
                      Volles Teilen
                    </button>
                  </div>
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

              {tab === "scouting" && !isCoachViewer ? (
                <section className="mt-4 app-card">
                  <h2 className="section-title">Gegner-Scouting</h2>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="input-label">Gegner</label>
                      <input
                        value={scoutingName}
                        onChange={(event) => setScoutingName(event.target.value)}
                        className="input mt-1"
                        placeholder="Team XYZ"
                      />
                    </div>
                    <div>
                      <label className="input-label">Notizen</label>
                      <input
                        value={scoutingNotes}
                        onChange={(event) => setScoutingNotes(event.target.value)}
                        className="input mt-1"
                        placeholder="z. B. starke Zone, schneller Backcourt"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {OPPONENT_STYLE_TAGS.map((tag) => {
                      const active = scoutingStyles.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setScoutingStyles((current) => toggleOpponentStyle(current, tag))}
                          className={`chip ${active ? "chip-active" : ""}`}
                        >
                          {OPPONENT_STYLE_LABELS[tag]}
                        </button>
                      );
                    })}
                  </div>
                  <button type="button" className="btn btn-primary btn-sm mt-4" onClick={() => void saveScouting()}>
                    Scouting speichern
                  </button>

                  <GradientFadeList
                    className="mt-5"
                    items={detail.scouting}
                    listClassName="space-y-2"
                    getKey={(entry) => entry.id}
                    renderItem={(entry) => (
                      <div className="list-card text-sm">
                        <p className="font-semibold text-strong">{entry.opponentName}</p>
                        <p className="text-xs text-muted">
                          {entry.styles.map((tag) => OPPONENT_STYLE_LABELS[tag]).join(", ") || "Keine Tags"}
                        </p>
                        {entry.notes ? <p className="mt-1 text-muted">{entry.notes}</p> : null}
                      </div>
                    )}
                  />
                </section>
              ) : null}

              {tab === "scouting" && isCoachViewer ? (
                <section className="mt-4 app-card">
                  <h2 className="section-title">Gegner-Scouting (read-only)</h2>
                  <GradientFadeList
                    className="mt-3"
                    items={detail.scouting}
                    listClassName="space-y-2"
                    getKey={(entry) => entry.id}
                    renderItem={(entry) => (
                      <div className="list-card text-sm">
                        <p className="font-semibold text-strong">{entry.opponentName}</p>
                        <p className="text-xs text-muted">
                          {entry.styles.map((tag) => OPPONENT_STYLE_LABELS[tag]).join(", ") || "Keine Tags"}
                        </p>
                        {entry.notes ? <p className="mt-1 text-muted">{entry.notes}</p> : null}
                      </div>
                    )}
                  />
                </section>
              ) : null}

              {tab === "advice" ? (
                <section className="mt-4 space-y-4">
                  <div className="app-card">
                    <h2 className="section-title">Start & Matchup</h2>
                    <label className="input-label mt-3">Gegner für Empfehlung</label>
                    <select
                      value={adviceOpponent}
                      onChange={(event) => setAdviceOpponent(event.target.value)}
                      className="select mt-1"
                    >
                      <option value="">— Gegner wählen —</option>
                      {detail.scouting.map((entry) => (
                        <option key={entry.id} value={entry.opponentName}>
                          {entry.opponentName}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-violet btn-sm mt-3"
                      disabled={coachLoading}
                      onClick={() => void fetchCoachAdvice()}
                    >
                      {coachLoading ? "Analysiere …" : "KI-Empfehlung laden"}
                    </button>
                  </div>

                  {lineup ? (
                    <div className="app-card">
                      <p className="section-eyebrow">Regelbasiert</p>
                      <h3 className="section-title mt-1">Start-Five</h3>
                      <p className="mt-2 text-sm text-strong">
                        {lineup.starters.map((player) => player.displayName).join(" · ") || "—"}
                      </p>
                      <p className="mt-2 text-xs text-muted">{lineup.rationale.join(" ")}</p>
                    </div>
                  ) : null}

                  {matchupHints.length > 0 ? (
                    <div className="app-card">
                      <h3 className="section-title">Matchup-Hinweise</h3>
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
