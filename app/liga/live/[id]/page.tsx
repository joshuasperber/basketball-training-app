"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import {
  LEAGUE_OWN_TEAM_ID,
  loadLeagueBundle,
  playersForTeam,
  saveLeagueBundle,
  teamsForSeason,
  type LeagueBundle,
  type LeagueScheduleEntry,
} from "@/lib/league";
import {
  formatLiveClock,
  getLeagueLiveState,
  getLiveClockSeconds,
  getQuarterTeamFouls,
  recordLeagueLiveEvent,
  setLeagueLiveQuarter,
  toggleLeagueLiveClock,
  undoLastLeagueLiveEvent,
} from "@/lib/league-live";

function quarterLabel(quarter: number) {
  return quarter <= 4 ? `${quarter}. Viertel` : `${quarter - 4}. OT`;
}

export default function LeagueLiveGamePage() {
  const params = useParams<{ id: string }>();
  const gameId = decodeURIComponent(params.id);
  const [bundle, setBundle] = useState<LeagueBundle | null>(null);
  const [now, setNow] = useState(0);
  const [homePlayerId, setHomePlayerId] = useState("");
  const [awayPlayerId, setAwayPlayerId] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => setBundle(loadLeagueBundle()), []);
  useEffect(() => {
    refresh();
    window.addEventListener("bt:league-updated", refresh);
    return () => window.removeEventListener("bt:league-updated", refresh);
  }, [refresh]);

  const entry = bundle?.schedule.find((game) => game.id === gameId) ?? null;
  const teams = useMemo(() => bundle && entry ? teamsForSeason(bundle, entry.seasonId) : [], [bundle, entry]);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team.name])), [teams]);
  const homePlayers = useMemo(() => bundle && entry?.homeTeamId ? playersForTeam(bundle, entry.homeTeamId) : [], [bundle, entry]);
  const awayPlayers = useMemo(() => bundle && entry?.awayTeamId ? playersForTeam(bundle, entry.awayTeamId) : [], [bundle, entry]);
  const liveState = entry ? getLeagueLiveState(entry) : null;
  const clockSeconds = liveState ? getLiveClockSeconds(liveState, now) : 0;
  const locked = entry?.status === "final" || entry?.status === "cancelled" || entry?.status === "postponed";

  const persistEntry = useCallback((nextEntry: LeagueScheduleEntry) => {
    if (!bundle) return;
    const next = { ...bundle, schedule: bundle.schedule.map((game) => game.id === nextEntry.id ? nextEntry : game) };
    setBundle(next);
    saveLeagueBundle(next);
  }, [bundle]);

  useEffect(() => {
    if (!liveState?.runningSince) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [liveState?.runningSince]);

  useEffect(() => {
    if (!entry || !liveState?.runningSince || clockSeconds > 0) return;
    persistEntry(toggleLeagueLiveClock(entry, now));
  }, [clockSeconds, entry, liveState?.runningSince, now, persistEntry]);

  function recordScore(teamId: string | undefined, points: number, playerId: string) {
    if (!entry || !teamId || locked) return;
    persistEntry(recordLeagueLiveEvent(entry, { type: "score", teamId, playerId: playerId || undefined, value: points }));
    setMessage(`${points} Punkt${points === 1 ? "" : "e"} erfasst.`);
  }

  function recordFoul(teamId: string | undefined, playerId: string) {
    if (!entry || !teamId || locked) return;
    persistEntry(recordLeagueLiveEvent(entry, { type: "foul", teamId, playerId: playerId || undefined, value: 1 }));
    setMessage("Foul erfasst.");
  }

  function finishGame() {
    if (!entry) return;
    if (entry.homeScore == null || entry.awayScore == null || entry.homeScore === entry.awayScore) {
      setMessage("Zum Abschluss wird ein eindeutiges Ergebnis benötigt. Starte bei Gleichstand eine Verlängerung.");
      return;
    }
    const state = getLeagueLiveState(entry);
    persistEntry({
      ...entry,
      status: "final",
      liveState: { ...state, clockSeconds: getLiveClockSeconds(state), runningSince: undefined },
    });
    setMessage("Spiel als final gespeichert. Ergebnis und Boxscore fließen jetzt in die Saison ein.");
  }

  if (!bundle) {
    return <main className="app-container"><p className="text-sm text-muted">Live-Spiel wird geladen …</p></main>;
  }
  if (!entry) {
    return <main className="app-container"><PageHeader eyebrow="Live-Spiel" title="Spiel nicht gefunden" subtitle="Das Saisonspiel wurde möglicherweise gelöscht." /><Link href="/liga" className="btn btn-primary mt-4">Zur Liga</Link></main>;
  }

  const homeName = teamById.get(entry.homeTeamId ?? "") ?? "Heimteam";
  const awayName = teamById.get(entry.awayTeamId ?? "") ?? "Auswärtsteam";
  const homeFouls = getQuarterTeamFouls(entry, entry.homeTeamId ?? "");
  const awayFouls = getQuarterTeamFouls(entry, entry.awayTeamId ?? "");
  const events = [...(liveState?.events ?? [])].reverse().slice(0, 16);

  return (
    <main className="app-container animate-in">
      <PageHeader eyebrow="Game Center" eyebrowTone="brand" title="Live-Spielmodus" subtitle={`${homeName} gegen ${awayName}`} />
      <div className="mt-3 flex flex-wrap gap-2"><Link href="/liga" className="btn btn-outline btn-sm">← Zur Liga</Link>{entry.status === "final" ? <span className="chip chip-success">Final</span> : null}</div>
      {message ? <div className="mt-3 app-card--accent-cyan flex items-center justify-between gap-2" role="status"><p className="text-sm text-strong">{message}</p><button type="button" className="btn btn-ghost btn-xs" onClick={() => setMessage(null)}>Schließen</button></div> : null}

      <section className="live-game-board mt-4">
        <div className="live-game-clock">
          <p>{quarterLabel(liveState?.quarter ?? 1)}</p>
          <strong aria-live="polite">{formatLiveClock(clockSeconds)}</strong>
          <button type="button" className={`btn ${liveState?.runningSince ? "btn-outline" : "btn-primary"} btn-sm`} disabled={locked || clockSeconds <= 0} onClick={() => persistEntry(toggleLeagueLiveClock(entry))}>{liveState?.runningSince ? "Pause" : "Start"}</button>
        </div>
        <LiveTeamControl name={homeName} score={entry.homeScore ?? 0} fouls={homeFouls} players={homePlayers} selectedPlayerId={homePlayerId} onSelectPlayer={setHomePlayerId} onScore={(points) => recordScore(entry.homeTeamId, points, homePlayerId)} onFoul={() => recordFoul(entry.homeTeamId, homePlayerId)} disabled={locked} own={entry.homeTeamId === LEAGUE_OWN_TEAM_ID} />
        <div className="live-game-versus" aria-hidden>VS</div>
        <LiveTeamControl name={awayName} score={entry.awayScore ?? 0} fouls={awayFouls} players={awayPlayers} selectedPlayerId={awayPlayerId} onSelectPlayer={setAwayPlayerId} onScore={(points) => recordScore(entry.awayTeamId, points, awayPlayerId)} onFoul={() => recordFoul(entry.awayTeamId, awayPlayerId)} disabled={locked} own={entry.awayTeamId === LEAGUE_OWN_TEAM_ID} />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="app-card">
          <p className="section-eyebrow">Spielsteuerung</p>
          <h2 className="section-title mt-1">Viertel & Aktionen</h2>
          <div className="mt-3 grid grid-cols-4 gap-2">{[1, 2, 3, 4].map((quarter) => <button key={quarter} type="button" disabled={locked} className={`btn btn-sm ${liveState?.quarter === quarter ? "btn-primary" : "btn-outline"}`} onClick={() => persistEntry(setLeagueLiveQuarter(entry, quarter))}>Q{quarter}</button>)}</div>
          <div className="mt-2 flex gap-2"><button type="button" disabled={locked} className="btn btn-violet btn-sm flex-1" onClick={() => persistEntry(setLeagueLiveQuarter(entry, Math.max(5, (liveState?.quarter ?? 4) + 1)))}>Verlängerung</button><button type="button" disabled={locked || events.length === 0} className="btn btn-outline btn-sm flex-1" onClick={() => persistEntry(undoLastLeagueLiveEvent(entry))}>Letzte Aktion zurück</button></div>
          <button type="button" disabled={locked} className="btn btn-primary btn-block mt-4" onClick={finishGame}>Spiel abschließen</button>
        </div>
        <div className="app-card">
          <p className="section-eyebrow">Live-Feed</p>
          <h2 className="section-title mt-1">Letzte Aktionen</h2>
          {events.length === 0 ? <p className="mt-3 text-sm text-muted">Noch keine Punkte oder Fouls erfasst.</p> : <div className="mt-3 space-y-2">{events.map((event) => { const player = bundle.players.find((item) => item.id === event.playerId); return <div key={event.id} className="live-event-row"><span>Q{event.quarter}</span><strong>{teamById.get(event.teamId) ?? "Team"}</strong><span>{event.type === "score" ? `+${event.value} Punkte` : "Foul"}{player ? ` · ${player.name}` : ""}</span></div>; })}</div>}
        </div>
      </section>
    </main>
  );
}

type LiveTeamControlProps = {
  name: string;
  score: number;
  fouls: number;
  players: Array<{ id: string; name: string; jerseyNumber?: string }>;
  selectedPlayerId: string;
  onSelectPlayer: (value: string) => void;
  onScore: (points: number) => void;
  onFoul: () => void;
  disabled: boolean;
  own: boolean;
};

function LiveTeamControl({ name, score, fouls, players, selectedPlayerId, onSelectPlayer, onScore, onFoul, disabled, own }: LiveTeamControlProps) {
  return (
    <div className={`live-team ${own ? "live-team--own" : ""}`}>
      <p>{own ? "Dein Team" : "Team"}</p>
      <h2>{name}</h2>
      <strong className="live-team__score">{score}</strong>
      <span className="live-team__fouls">Teamfouls Q: {fouls}</span>
      <select value={selectedPlayerId} onChange={(event) => onSelectPlayer(event.target.value)} className="select app-unified-control" disabled={disabled || players.length === 0} aria-label={`Spieler von ${name}`}><option value="">Ohne Spielerzuordnung</option>{players.map((player) => <option key={player.id} value={player.id}>{player.jerseyNumber ? `#${player.jerseyNumber} · ` : ""}{player.name}</option>)}</select>
      <div className="live-score-buttons">{[1, 2, 3].map((points) => <button key={points} type="button" disabled={disabled} className="btn btn-primary" onClick={() => onScore(points)}>+{points}</button>)}</div>
      <button type="button" disabled={disabled} className="btn btn-danger-outline btn-sm btn-block" onClick={onFoul}>+ Foul</button>
    </div>
  );
}
