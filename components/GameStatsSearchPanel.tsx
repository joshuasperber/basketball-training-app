"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ShowMoreList from "@/components/ShowMoreList";
import {
  aggregateGameStatTotals,
  filterGameStats,
  loadGameStats,
  type GameStatEntry,
  type GameStatsFilter,
} from "@/lib/game-stats";

type Props = {
  /** Wenn gesetzt, wird nur in dieser Liste gesucht (z. B. bereits nach Stats-Zeitraum gefiltert). */
  entries?: GameStatEntry[];
  variant?: "weekly" | "full";
  className?: string;
  id?: string;
};

export default function GameStatsSearchPanel({ entries: entriesProp, variant = "full", className = "", id }: Props) {
  const [internalEntries, setInternalEntries] = useState<GameStatEntry[]>([]);
  const [query, setQuery] = useState("");
  const [context, setContext] = useState<GameStatsFilter["context"]>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (entriesProp !== undefined) return;
    const load = () => setInternalEntries(loadGameStats());
    load();
    window.addEventListener("bt:game-stats-updated", load);
    return () => window.removeEventListener("bt:game-stats-updated", load);
  }, [entriesProp]);

  const baseEntries = entriesProp ?? internalEntries;

  const filtered = useMemo(
    () =>
      filterGameStats(baseEntries, {
        query,
        context: context ?? "all",
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    [baseEntries, query, context, dateFrom, dateTo],
  );

  const totals = useMemo(() => aggregateGameStatTotals(filtered), [filtered]);

  const isWeekly = variant === "weekly";

  return (
    <section id={id} className={`app-card--accent-violet ${className}`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className={`section-title ${isWeekly ? "text-base" : ""}`}>Spiele suchen</h2>
        <p className="text-xs text-muted">{filtered.length} Treffer · {baseEntries.length} gesamt</p>
      </div>
      <p className="mt-1 text-xs text-muted">
        Nach Gegner, Notiz oder Datum filtern — Box Score pro Eintrag, Bearbeiten über den Link.
      </p>

      <div className={`mt-3 grid gap-2 ${isWeekly ? "grid-cols-1 sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        <label className="block sm:col-span-2 lg:col-span-2">
          <span className="input-label">Suche</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Gegner, Turnier, Datum …"
            className="input mt-1"
          />
        </label>
        <label className="block">
          <span className="input-label">Von (Datum)</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input mt-1" />
        </label>
        <label className="block">
          <span className="input-label">Bis (Datum)</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input mt-1" />
        </label>
      </div>

      <div className="segmented-wrap mt-3">
      <div className="segmented">
        {(
          [
            ["all", "Alle"],
            ["game", "Spieltag"],
            ["game_training", "Spieltraining"],
          ] as const
        ).map(([filterId, label]) => (
          <button
            key={filterId}
            type="button"
            onClick={() => setContext(filterId)}
            className="segmented__btn"
            aria-pressed={context === filterId}
          >
            {label}
          </button>
        ))}
      </div>
      </div>

      {filtered.length > 0 ? (
        <div className="mt-4 app-card--flat">
          <p className="section-eyebrow">Summe der Treffer</p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums text-strong">
            <span>
              <span className="text-muted">Spiele:</span> {totals.count}
            </span>
            <span>
              <span className="text-muted">PTS:</span> {totals.points}
            </span>
            <span>
              <span className="text-muted">AST:</span> {totals.assists}
            </span>
            <span>
              <span className="text-muted">REB:</span> {totals.rebounds}
            </span>
            <span>
              <span className="text-muted">STL:</span> {totals.steals}
            </span>
            <span>
              <span className="text-muted">MIN:</span> {totals.minutes}
            </span>
          </p>
        </div>
      ) : null}

      <div className="mt-3">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted">Keine Einträge für diese Filter — oder noch keine Spiel-Stats erfasst.</p>
        ) : (
          <ShowMoreList
            items={filtered}
            listClassName="space-y-2"
            getKey={(entry) => entry.id}
            renderItem={(entry) => (
              <div className="list-card text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="list-card__title">
                      {entry.opponentLabel?.trim() || "Ohne Namen"}
                      <span className="ml-2 text-xs font-normal text-brand">
                        {entry.context === "game" ? "Spieltag" : "Spieltraining"}
                      </span>
                    </p>
                    <p className="list-card__meta">
                      {entry.date}
                      {entry.teamFormat ? ` · ${entry.teamFormat}` : ""}
                      {(entry.gamesPlayed ?? 1) > 1 ? ` · ${entry.gamesPlayed} Spiele (Ø)` : ""}
                    </p>
                  </div>
                  <Link href={`/game-track?id=${encodeURIComponent(entry.id)}`} className="btn btn-violet btn-xs shrink-0">
                    Bearbeiten
                  </Link>
                </div>
                <p className="mt-2 text-xs tabular-nums text-muted">
                  PTS <strong className="text-strong">{entry.points ?? "–"}</strong>
                  {" · "}
                  AST <strong className="text-strong">{entry.assists ?? "–"}</strong>
                  {" · "}
                  REB <strong className="text-strong">{entry.rebounds ?? "–"}</strong>
                  {" · "}
                  STL <strong className="text-strong">{entry.steals ?? "–"}</strong>
                  {entry.minutes != null ? (
                    <>
                      {" · "}
                      MIN <strong className="text-strong">{entry.minutes}</strong>
                    </>
                  ) : null}
                </p>
              </div>
            )}
          />
        )}
      </div>
    </section>
  );
}
