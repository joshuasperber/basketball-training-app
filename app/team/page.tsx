"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import {
  OPPONENT_STYLE_LABELS,
  OPPONENT_STYLE_TAGS,
  toggleOpponentStyle,
  type OpponentStyleTag,
} from "@/lib/opponent-styles";
import { buildStartLineupRecommendation, buildTeamMatchupHints } from "@/lib/matchup-hints";
import type { TeamCoachResponse, TeamDetail, TeamSummary } from "@/lib/team-types";
import { fetchAuthMe } from "@/lib/auth-session-align";
import { getWorkoutSessions } from "@/lib/session-storage";
import { syncWorkoutSessionsToCloudWithRetry } from "@/lib/sync-workout-sessions";
import { teamJoinErrorMessage } from "@/lib/team-join-errors";
import { parseJoinInviteToken } from "@/lib/team-invite-token";

type TeamTab = "overview" | "roster" | "scouting" | "advice";

function formToneClass(tone: "green" | "yellow" | "red") {
  return tone === "green" ? "text-emerald-300" : tone === "red" ? "text-rose-300" : "text-amber-300";
}

export default function TeamPage() {
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
  const [adviceOpponent, setAdviceOpponent] = useState("");
  const [authMe, setAuthMe] = useState<{ email: string; cloudWorkouts14d: number; cloudSessionCount: number } | null>(null);
  const [localSessionCount, setLocalSessionCount] = useState(0);

  const loadTeams = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/team", { cache: "no-store" });
      if (response.status === 401) {
        setMessage("Bitte einloggen, um Teams zu nutzen.");
        setTeams([]);
        return;
      }
      if (!response.ok) throw new Error("Team-Liste konnte nicht geladen werden.");
      const json = (await response.json()) as { teams: TeamSummary[] };
      setTeams(json.teams ?? []);
      setSelectedTeamId((current) => current ?? json.teams?.[0]?.id ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Fehler beim Laden.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAuthDiagnostics = useCallback(async () => {
    const me = await fetchAuthMe();
    setLocalSessionCount(getWorkoutSessions().length);
    if (me) {
      setAuthMe({
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
    try {
      const me = await refreshAuthDiagnostics();
      const syncResult = await syncWorkoutSessionsToCloudWithRetry();
      await refreshAuthDiagnostics();
      const response = await fetch(`/api/team/${teamId}`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("Team-Details konnten nicht geladen werden.");
      const json = (await response.json()) as TeamDetail;
      setDetail(json);
      setAdviceOpponent((current) => current || json.scouting[0]?.opponentName || "");
      const localCount = getWorkoutSessions().length;
      setLocalSessionCount(localCount);

      if (!me) {
        setMessage("Nicht eingeloggt — Session-Cookie fehlt. Bitte erneut anmelden.");
      } else if (!syncResult.ok) {
        setMessage(
          `Workout-Sync fehlgeschlagen (${syncResult.error ?? syncResult.status}${syncResult.detail ? `: ${syncResult.detail.slice(0, 80)}` : ""}). Prüfe SUPABASE_SERVICE_ROLE_KEY und user_progress-Tabelle.`,
        );
      } else if (localCount > 0 && me.cloud.workouts14d === 0) {
        setMessage(
          `Lokal ${localCount} Workout(s), in der Cloud 0 — Account-Mix im Browser? Nutze zwei getrennte Browser-Fenster (siehe Hinweis oben).`,
        );
      } else if (json.syncMeta && !json.syncMeta.progressFound) {
        setMessage("Fortschritt in Supabase nicht gefunden — nach Workout Profil öffnen, dann Team erneut.");
      } else if (json.syncMeta && json.syncMeta.workouts14d === 0 && localCount === 0) {
        setMessage("Noch keine Workouts — Training abschließen (alle Sätze erfassen), dann Team neu öffnen.");
      } else {
        setMessage(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Fehler beim Laden der Team-Details.");
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
      setMessage(json.message ?? "SUPABASE_SERVICE_ROLE_KEY fehlt in .env.local.");
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

  const copyInvite = async () => {
    if (!selectedTeamId) return;
    try {
      const response = await fetch(`/api/team/${selectedTeamId}`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("invite_load_failed");
      const json = (await response.json()) as TeamDetail;
      setDetail(json);
      const token = json.inviteToken;
      if (!token) {
        setMessage("Keine Einladung verfügbar — prüfe SUPABASE_SERVICE_ROLE_KEY und teams.sql.");
        return;
      }
      const link = `${window.location.origin}/team?join=${encodeURIComponent(token)}`;
      await navigator.clipboard.writeText(link);
      setMessage("Einladungslink kopiert — mit dem anderen Account öffnen oder einloggen.");
    } catch {
      setMessage("Einladungslink konnte nicht geladen werden.");
    }
  };

  return (
    <main className="app-container animate-in">
      <PageHeader
        eyebrow="Team"
        title="Team-Modus"
        subtitle="Form-Ranking, Scouting und Start-Empfehlungen für dein Team."
      />

      {message ? <p className="mt-3 text-sm text-amber-200">{message}</p> : null}

      <section className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-muted">
        <p className="font-semibold text-strong">Sync-Check (localhost ist ok)</p>
        {authMe ? (
          <p className="mt-1">
            Eingeloggt als <span className="text-strong">{authMe.email}</span> · lokal {localSessionCount} Workout(s) · Cloud{" "}
            {authMe.cloudWorkouts14d} (14 T.)
          </p>
        ) : (
          <p className="mt-1">Nicht eingeloggt (kein Session-Cookie).</p>
        )}
        <p className="mt-2 text-amber-200/90">
          Zwei Accounts: nicht zwei Tabs im gleichen Inkognito-Fenster — die teilen Cookies. Nutze zwei normale Fenster (Chrome +
          Safari) oder zwei Profile. Sonst siehst du Account 1 in der UI, die API ist aber Account 2.
        </p>
      </section>

      <section className="mt-4 app-card">
        <p className="section-eyebrow">Team verwalten</p>
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
                Erstellen
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
                Beitreten
              </button>
            </div>
          </div>
        </div>
      </section>

      {loading ? <p className="mt-6 text-sm text-muted">Lade Teams …</p> : null}

      {!loading && teams.length === 0 ? (
        <section className="mt-6 app-card">
          <p className="text-sm text-muted">Noch kein Team — erstelle eines oder tritt per Einladung bei.</p>
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
                {([
                  ["overview", "Übersicht"],
                  ["roster", "Kader"],
                  ["scouting", "Scouting"],
                  ["advice", "Empfehlung"],
                ] as const).map(([id, label]) => (
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

              {["owner", "captain", "coach"].includes(
                teams.find((team) => team.id === selectedTeamId)?.role ?? "",
              ) ? (
                <div className="mt-3">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyInvite()}>
                    Einladungslink kopieren
                  </button>
                </div>
              ) : null}

              {tab === "overview" ? (
                <section className="mt-4 app-card">
                  <p className="section-eyebrow">{detail.team.clubName ?? "Team"}</p>
                  <h2 className="section-title mt-1">{detail.team.name}</h2>
                  <p className="mt-1 text-xs text-muted">
                    {detail.members.length} Spieler · Saison {detail.team.season ?? "—"}
                  </p>
                  <div className="mt-4 space-y-2">
                    {detail.members.slice(0, 5).map((member, index) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm"
                      >
                        <p className="font-semibold text-strong">
                          #{index + 1} {member.displayName}
                          <span className="ml-2 text-xs uppercase text-faint">{member.position ?? "—"}</span>
                        </p>
                        <p className={`font-semibold tabular-nums ${formToneClass(member.form.tone)}`}>{member.form.score}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {tab === "roster" ? (
                <section className="mt-4 app-card">
                  <h2 className="section-title">Kader & Form</h2>
                  <div className="mt-3 space-y-2">
                    {detail.members.map((member) => (
                      <div key={member.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-strong">{member.displayName}</p>
                            <p className="text-xs text-muted">
                              {member.position ?? "—"} · {member.playStyle ?? "—"} · {member.recentWorkouts} Workouts (14 T.) ·{" "}
                              {member.recentGames} Spiele
                            </p>
                            {member.recentWorkouts === 0 && member.recentGames === 0 ? (
                              <p className="mt-1 text-xs text-amber-200/90">
                                Noch keine Cloud-Daten — Workout abschließen oder Team-Seite nach dem Training neu öffnen.
                              </p>
                            ) : null}
                          </div>
                          <p className={`text-lg font-bold tabular-nums ${formToneClass(member.form.tone)}`}>{member.form.score}</p>
                        </div>
                        <p className="mt-2 text-xs text-muted">{member.form.reasons[0] ?? "—"}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {tab === "scouting" ? (
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

                  <div className="mt-5 space-y-2">
                    {detail.scouting.map((entry) => (
                      <div key={entry.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                        <p className="font-semibold text-strong">{entry.opponentName}</p>
                        <p className="text-xs text-muted">
                          {entry.styles.map((tag) => OPPONENT_STYLE_LABELS[tag]).join(", ") || "Keine Tags"}
                        </p>
                        {entry.notes ? <p className="mt-1 text-muted">{entry.notes}</p> : null}
                      </div>
                    ))}
                  </div>
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
                      <div className="mt-3 space-y-2">
                        {matchupHints.map((hint) => (
                          <div key={hint.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                            <p className="font-semibold text-strong">{hint.title}</p>
                            <p className="mt-1 text-muted">{hint.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {coachAdvice ? (
                    <section className="app-card--accent-violet">
                      <p className="section-eyebrow">Coach · {coachAdvice.source === "llm" ? "KI" : "Regeln"}</p>
                      <h3 className="section-title mt-1">{coachAdvice.headline}</h3>
                      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-strong">
                        {coachAdvice.bullets.map((bullet) => (
                          <li key={bullet}>{bullet}</li>
                        ))}
                      </ul>
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
