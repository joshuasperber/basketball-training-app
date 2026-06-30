"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAppDialog } from "@/components/ui/AppDialogProvider";
import {
  OPPONENT_STYLE_LABELS,
  OPPONENT_STYLE_TAGS,
  toggleOpponentStyle,
  type OpponentStyleTag,
} from "@/lib/opponent-styles";
import {
  createId,
  getActiveSeason,
  loadLeagueBundle,
  opponentsForSeason,
  saveLeagueBundle,
  scheduleForSeason,
  syncLeagueEntryToPlan,
  syncUpcomingLeagueSchedule,
  type LeagueBundle,
  type LeagueGameKind,
  type LeagueOpponent,
  type LeagueScheduleEntry,
  type LeagueSeason,
} from "@/lib/league";
import { getTodayDateKey } from "@/lib/workout";
import { loadLigaTab, persistLigaTab, type LigaTab } from "@/lib/ui-navigation-state";

type Tab = LigaTab;

function formatDateLabel(dateKey: string) {
  const parsed = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default function LigaPage() {
  const appDialog = useAppDialog();
  const [bundle, setBundle] = useState<LeagueBundle>(() => loadLeagueBundle());
  const [tab, setTab] = useState<Tab>("schedule");
  const [seasonName, setSeasonName] = useState("");
  const [seasonNotes, setSeasonNotes] = useState("");
  const [opponentName, setOpponentName] = useState("");
  const [opponentStrengths, setOpponentStrengths] = useState("");
  const [opponentWeaknesses, setOpponentWeaknesses] = useState("");
  const [opponentDefense, setOpponentDefense] = useState("");
  const [opponentNotes, setOpponentNotes] = useState("");
  const [opponentStyles, setOpponentStyles] = useState<OpponentStyleTag[]>([]);
  const [gameDate, setGameDate] = useState("");
  const [gameKind, setGameKind] = useState<LeagueGameKind>("game");
  const [gameOpponentId, setGameOpponentId] = useState("");
  const [gameNotes, setGameNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadLigaTab();
    if (stored) setTab(stored);
  }, []);

  const handleTabChange = (next: Tab) => {
    setTab(next);
    persistLigaTab(next);
  };

  const refresh = useCallback(() => setBundle(loadLeagueBundle()), []);

  useEffect(() => {
    const onUpdate = () => refresh();
    window.addEventListener("bt:league-updated", onUpdate);
    return () => window.removeEventListener("bt:league-updated", onUpdate);
  }, [refresh]);

  const activeSeason = useMemo(() => getActiveSeason(bundle), [bundle]);
  const opponents = useMemo(
    () => (activeSeason ? opponentsForSeason(bundle, activeSeason.id) : []),
    [activeSeason, bundle],
  );
  const schedule = useMemo(
    () => (activeSeason ? scheduleForSeason(bundle, activeSeason.id) : []),
    [activeSeason, bundle],
  );
  const opponentsById = useMemo(() => new Map(opponents.map((entry) => [entry.id, entry])), [opponents]);

  function persist(next: LeagueBundle) {
    saveLeagueBundle(next);
    setBundle(next);
  }

  function handleCreateSeason(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = seasonName.trim();
    if (!name) return;
    const season: LeagueSeason = {
      id: createId("season"),
      name,
      notes: seasonNotes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    persist({
      ...bundle,
      activeSeasonId: season.id,
      seasons: [season, ...bundle.seasons],
    });
    setSeasonName("");
    setSeasonNotes("");
    setMessage(`Saison „${name}“ angelegt.`);
  }

  function handleAddOpponent(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeSeason) {
      setMessage("Bitte zuerst eine Saison anlegen.");
      return;
    }
    const name = opponentName.trim();
    if (!name) return;
    const opponent: LeagueOpponent = {
      id: createId("opponent"),
      seasonId: activeSeason.id,
      name,
      strengths: opponentStrengths.trim(),
      weaknesses: opponentWeaknesses.trim(),
      defenseNotes: opponentDefense.trim(),
      opponentStyles,
      notes: opponentNotes.trim() || undefined,
    };
    persist({ ...bundle, opponents: [opponent, ...bundle.opponents] });
    setOpponentName("");
    setOpponentStrengths("");
    setOpponentWeaknesses("");
    setOpponentDefense("");
    setOpponentNotes("");
    setOpponentStyles([]);
    setMessage(`Gegner „${name}“ gespeichert.`);
  }

  function handleAddGame(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeSeason) {
      setMessage("Bitte zuerst eine Saison anlegen.");
      return;
    }
    if (!gameDate) return;
    const entry: LeagueScheduleEntry = {
      id: createId("game"),
      seasonId: activeSeason.id,
      date: gameDate,
      kind: gameKind,
      opponentId: gameOpponentId || undefined,
      notes: gameNotes.trim() || undefined,
    };
    persist({ ...bundle, schedule: [...bundle.schedule, entry] });
    setGameDate("");
    setGameNotes("");
    setMessage("Spiel zum Saisonplan hinzugefügt.");
  }

  function handleSyncEntry(entry: LeagueScheduleEntry) {
    const opponent = entry.opponentId ? opponentsById.get(entry.opponentId) : undefined;
    syncLeagueEntryToPlan(entry, opponent);
    refresh();
    setMessage(`${formatDateLabel(entry.date)} in den Wochenplan übernommen.`);
  }

  function handleSyncAllUpcoming() {
    if (!activeSeason) return;
    const count = syncUpcomingLeagueSchedule(activeSeason.id, getTodayDateKey());
    refresh();
    setMessage(count > 0 ? `${count} Spiele in den Wochenplan übernommen.` : "Keine anstehenden Spiele.");
  }

  async function handleDeleteOpponent(opponentId: string) {
    const confirmed = await appDialog.confirm({
      message: "Gegner wirklich löschen?",
      confirmLabel: "Löschen",
      tone: "danger",
    });
    if (!confirmed) return;
    persist({
      ...bundle,
      opponents: bundle.opponents.filter((entry) => entry.id !== opponentId),
      schedule: bundle.schedule.map((entry) =>
        entry.opponentId === opponentId ? { ...entry, opponentId: undefined } : entry,
      ),
    });
  }

  async function handleDeleteGame(gameId: string) {
    const confirmed = await appDialog.confirm({
      message: "Spiel aus dem Saisonplan entfernen?",
      confirmLabel: "Entfernen",
      tone: "danger",
    });
    if (!confirmed) return;
    persist({ ...bundle, schedule: bundle.schedule.filter((entry) => entry.id !== gameId) });
  }

  return (
    <main className="app-container animate-in">
      <PageHeader
        eyebrow="Saisonplanung"
        title="Liga"
        actions={
          <Link href="/team" className="btn btn-ghost btn-sm">
            Team
          </Link>
        }
      />

      {message ? (
        <div className="mt-3 app-card--accent-cyan flex items-center justify-between gap-2">
          <p className="text-sm text-strong">{message}</p>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setMessage(null)}>
            Schließen
          </button>
        </div>
      ) : null}

      <div className="segmented mt-4">
        {(
          [
            ["schedule", "Spielplan"],
            ["opponents", "Gegner"],
            ["season", "Saison"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className="segmented__btn" aria-pressed={tab === id} onClick={() => handleTabChange(id)}>
            {label}
          </button>
        ))}
      </div>

      {activeSeason ? (
        <p className="mt-3 text-sm text-muted">
          Aktive Saison: <span className="font-semibold text-strong">{activeSeason.name}</span>
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">Noch keine Saison — starte unter „Saison“.</p>
      )}

      {tab === "season" ? (
        <section className="mt-4 space-y-4">
          <form className="app-card space-y-3" onSubmit={handleCreateSeason}>
            <p className="section-eyebrow">Neue Saison</p>
            <input value={seasonName} onChange={(e) => setSeasonName(e.target.value)} placeholder="z. B. Regionalliga 2025/26" className="input" />
            <textarea value={seasonNotes} onChange={(e) => setSeasonNotes(e.target.value)} placeholder="Notizen zur Saison" rows={2} className="textarea" />
            <button type="submit" className="btn btn-primary btn-sm">
              Saison anlegen
            </button>
          </form>

          {bundle.seasons.length > 0 ? (
            <div className="app-card">
              <p className="section-eyebrow">Saisons</p>
              <ul className="mt-3 space-y-2">
                {bundle.seasons.map((season) => (
                  <li key={season.id} className="list-card flex items-center justify-between gap-2">
                    <div>
                      <p className="list-card__title">{season.name}</p>
                      {season.notes ? <p className="list-card__meta">{season.notes}</p> : null}
                    </div>
                    <button
                      type="button"
                      className={`btn btn-xs ${bundle.activeSeasonId === season.id ? "btn-primary" : "btn-outline"}`}
                      onClick={() => persist({ ...bundle, activeSeasonId: season.id })}
                    >
                      {bundle.activeSeasonId === season.id ? "Aktiv" : "Aktivieren"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "opponents" ? (
        <section className="mt-4 space-y-4">
          <form className="app-card space-y-3" onSubmit={handleAddOpponent}>
            <p className="section-eyebrow">Gegner anlegen</p>
            <input value={opponentName} onChange={(e) => setOpponentName(e.target.value)} placeholder="Teamname" className="input" />
            <textarea value={opponentStrengths} onChange={(e) => setOpponentStrengths(e.target.value)} placeholder="Stärken" rows={2} className="textarea" />
            <textarea value={opponentWeaknesses} onChange={(e) => setOpponentWeaknesses(e.target.value)} placeholder="Schwächen" rows={2} className="textarea" />
            <textarea value={opponentDefense} onChange={(e) => setOpponentDefense(e.target.value)} placeholder="Verteidigung (Zone, Press, Man-to-Man …)" rows={2} className="textarea" />
            <div className="flex flex-wrap gap-2">
              {OPPONENT_STYLE_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`chip ${opponentStyles.includes(tag) ? "chip-active" : ""}`}
                  onClick={() => setOpponentStyles((current) => toggleOpponentStyle(current, tag))}
                >
                  {OPPONENT_STYLE_LABELS[tag]}
                </button>
              ))}
            </div>
            <textarea value={opponentNotes} onChange={(e) => setOpponentNotes(e.target.value)} placeholder="Weitere Notizen" rows={2} className="textarea" />
            <button type="submit" className="btn btn-primary btn-sm">
              Gegner speichern
            </button>
          </form>

          <div className="app-card">
            <p className="section-eyebrow">Gegner-Liste</p>
            {opponents.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Noch keine Gegner.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {opponents.map((opponent) => (
                  <li key={opponent.id} className="list-card">
                    <div className="flex items-start justify-between gap-2">
                      <p className="list-card__title">{opponent.name}</p>
                      <button type="button" className="btn btn-danger-outline btn-xs" onClick={() => handleDeleteOpponent(opponent.id)}>
                        Löschen
                      </button>
                    </div>
                    {opponent.strengths ? <p className="list-card__meta">Stärken: {opponent.strengths}</p> : null}
                    {opponent.weaknesses ? <p className="list-card__meta">Schwächen: {opponent.weaknesses}</p> : null}
                    {opponent.defenseNotes ? <p className="list-card__meta">Verteidigung: {opponent.defenseNotes}</p> : null}
                    {opponent.opponentStyles.length > 0 ? (
                      <p className="list-card__meta">
                        Tags: {opponent.opponentStyles.map((tag) => OPPONENT_STYLE_LABELS[tag]).join(", ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {tab === "schedule" ? (
        <section className="mt-4 space-y-4">
          <form className="app-card space-y-3" onSubmit={handleAddGame}>
            <p className="section-eyebrow">Spiel eintragen</p>
            <input type="date" value={gameDate} onChange={(e) => setGameDate(e.target.value)} className="input" />
            <div className="segmented">
              <button type="button" className="segmented__btn" aria-pressed={gameKind === "game"} onClick={() => setGameKind("game")}>
                Spieltag
              </button>
              <button
                type="button"
                className="segmented__btn"
                aria-pressed={gameKind === "game_training"}
                onClick={() => setGameKind("game_training")}
              >
                Spieltraining
              </button>
            </div>
            <select value={gameOpponentId} onChange={(e) => setGameOpponentId(e.target.value)} className="select">
              <option value="">Gegner wählen (optional)</option>
              {opponents.map((opponent) => (
                <option key={opponent.id} value={opponent.id}>
                  {opponent.name}
                </option>
              ))}
            </select>
            <textarea value={gameNotes} onChange={(e) => setGameNotes(e.target.value)} placeholder="Notizen zum Spiel" rows={2} className="textarea" />
            <button type="submit" className="btn btn-primary btn-sm">
              Zum Saisonplan hinzufügen
            </button>
          </form>

          <div className="app-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="section-eyebrow">Saison-Spielplan</p>
              <button type="button" className="btn btn-outline btn-xs" onClick={handleSyncAllUpcoming}>
                Alle anstehenden → Wochenplan
              </button>
            </div>
            {schedule.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Noch keine Spiele geplant.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {schedule.map((entry) => {
                  const opponent = entry.opponentId ? opponentsById.get(entry.opponentId) : undefined;
                  return (
                    <li key={entry.id} className="list-card">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="list-card__title">
                            {formatDateLabel(entry.date)} · {entry.kind === "game" ? "Spieltag" : "Spieltraining"}
                          </p>
                          <p className="list-card__meta">{opponent?.name ?? "Ohne Gegner"}</p>
                          {entry.notes ? <p className="list-card__meta">{entry.notes}</p> : null}
                          {entry.syncedAt ? <p className="list-card__meta hint-success">Im Wochenplan</p> : null}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" className="btn btn-primary btn-xs" onClick={() => handleSyncEntry(entry)}>
                            → Wochenplan
                          </button>
                          <button type="button" className="btn btn-danger-outline btn-xs" onClick={() => handleDeleteGame(entry.id)}>
                            Entfernen
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}
