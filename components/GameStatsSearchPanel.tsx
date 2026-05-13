"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
    <section
      id={id}
      className={`rounded-2xl border border-violet-600/35 bg-gradient-to-br from-violet-950/35 via-zinc-950 to-zinc-950 p-4 ${className}`}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className={`font-semibold text-violet-100 ${isWeekly ? "text-base" : "text-lg"}`}>Spiele suchen</h2>
        <p className="text-xs text-zinc-500">{filtered.length} Treffer · {baseEntries.length} gesamt</p>
      </div>
      <p className="mt-1 text-xs text-zinc-400">
        Nach Gegner, Notiz oder Datum filtern — Box Score pro Eintrag, Bearbeiten über den Link.
      </p>

      <div className={`mt-3 grid gap-2 ${isWeekly ? "grid-cols-1 sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        <label className="block sm:col-span-2 lg:col-span-2">
          <span className="text-xs text-zinc-500">Suche</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Gegner, Turnier, Datum …"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm outline-none focus:border-violet-500"
          />
        </label>
        <label className="block">
          <span className="text-xs text-zinc-500">Von (Datum)</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm outline-none focus:border-violet-500"
          />
        </label>
        <label className="block">
          <span className="text-xs text-zinc-500">Bis (Datum)</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm outline-none focus:border-violet-500"
          />
        </label>
      </div>

      <div className="mt-3 inline-flex flex-wrap gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
        {(
          [
            ["all", "Alle"],
            ["game", "Spieltag"],
            ["game_training", "Spieltraining"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setContext(id)}
            className={`rounded-md px-3 py-1 text-xs font-medium ${
              context === id ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length > 0 ? (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-black/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Summe der Treffer</p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums text-zinc-200">
            <span>
              <span className="text-zinc-500">Spiele:</span> {totals.count}
            </span>
            <span>
              <span className="text-zinc-500">PTS:</span> {totals.points}
            </span>
            <span>
              <span className="text-zinc-500">AST:</span> {totals.assists}
            </span>
            <span>
              <span className="text-zinc-500">REB:</span> {totals.rebounds}
            </span>
            <span>
              <span className="text-zinc-500">STL:</span> {totals.steals}
            </span>
            <span>
              <span className="text-zinc-500">MIN:</span> {totals.minutes}
            </span>
          </p>
        </div>
      ) : null}

      <div className={`mt-3 ${isWeekly ? "max-h-56 overflow-y-auto pr-1" : "max-h-72 overflow-y-auto pr-1"}`}>
        {filtered.length === 0 ? (
          <p className="text-sm text-zinc-500">Keine Einträge für diese Filter — oder noch keine Spiel-Stats erfasst.</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((entry) => (
              <li
                key={entry.id}
                className="rounded-xl border border-zinc-800 bg-zinc-950/90 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-zinc-100">
                      {entry.opponentLabel?.trim() || "Ohne Namen"}
                      <span className="ml-2 text-xs font-normal text-violet-400">
                        {entry.context === "game" ? "Spieltag" : "Spieltraining"}
                      </span>
                    </p>
                    <p className="text-xs text-zinc-500">{entry.date}</p>
                  </div>
                  <Link
                    href={`/game-track?id=${encodeURIComponent(entry.id)}`}
                    className="shrink-0 rounded-lg border border-violet-500/60 px-2 py-1 text-xs font-semibold text-violet-300 hover:bg-violet-950"
                  >
                    Bearbeiten
                  </Link>
                </div>
                <p className="mt-2 text-xs tabular-nums text-zinc-300">
                  PTS <strong className="text-white">{entry.points ?? "–"}</strong>
                  {" · "}
                  AST <strong className="text-white">{entry.assists ?? "–"}</strong>
                  {" · "}
                  REB <strong className="text-white">{entry.rebounds ?? "–"}</strong>
                  {" · "}
                  STL <strong className="text-white">{entry.steals ?? "–"}</strong>
                  {entry.minutes != null ? (
                    <>
                      {" · "}
                      MIN <strong className="text-white">{entry.minutes}</strong>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
