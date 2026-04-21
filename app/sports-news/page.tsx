"use client";

import { useEffect, useMemo, useState } from "react";

type SportType = "basketball" | "football";

type LeagueOption = {
  id: string;
  name: string;
};

type SportsNewsItem = {
  title: string;
  source: string;
  date: string;
  url: string;
  leagueId: string;
  league: string;
  homeScore: number | null;
  awayScore: number | null;
  hasResult: boolean;
  status: string;
};

type SportsNewsPayload = {
  sport?: SportType;
  leagues?: LeagueOption[];
  items?: SportsNewsItem[];
  warning?: string | null;
  error?: string;
};

const SPORT_TABS: Array<{ id: SportType; label: string }> = [
  { id: "basketball", label: "Basketball" },
  { id: "football", label: "Fußball" },
];

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Zeitpunkt unbekannt";
  return parsed.toLocaleString("de-DE");
}

export default function SportsNewsPage() {
  const [sport, setSport] = useState<SportType>("basketball");
  const [selectedLeague, setSelectedLeague] = useState("all");
  const [resultFilter, setResultFilter] = useState<"all" | "with_result" | "without_result">("all");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [news, setNews] = useState<SportsNewsItem[]>([]);
  const [leagues, setLeagues] = useState<LeagueOption[]>([{ id: "all", name: "Alle Ligen" }]);

  const loadNews = async (
    nextSport: SportType,
    nextLeague: string,
    nextResultFilter: "all" | "with_result" | "without_result",
  ) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({ sport: nextSport });
      if (nextLeague !== "all") params.set("league", nextLeague);
      params.set("result", nextResultFilter);

      const response = await fetch(`/api/sports-news?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as SportsNewsPayload;

      if (!response.ok) {
        throw new Error(payload.error ?? "Fehler beim Laden der Sport-News.");
      }

      setNews(payload.items ?? []);
      setLeagues(payload.leagues ?? [{ id: "all", name: "Alle Ligen" }]);
      setWarning(payload.warning ?? null);
    } catch (newsError) {
      setError(newsError instanceof Error ? newsError.message : "Unbekannter Fehler beim Laden.");
      setNews([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNews(sport, selectedLeague, resultFilter);
  }, [sport, selectedLeague, resultFilter]);

  const headerText = useMemo(() => {
    return sport === "basketball"
      ? "Live-Spiele und Updates für Basketball-Ligen"
      : "Live-Spiele und Updates für Fußball-Ligen";
  }, [sport]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-black p-6 pb-24 text-white">
      <h1 className="text-3xl font-bold tracking-tight">Sports Hub</h1>
      <p className="mt-2 text-zinc-400">{headerText}</p>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-lg shadow-black/20">
        <div className="flex flex-wrap gap-2">
          {SPORT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSport(tab.id);
                setSelectedLeague("all");
                setResultFilter("all");
              }}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                sport === tab.id
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
              }`}
              disabled={loading}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <label className="grid gap-1 text-sm text-zinc-300">
            Liga auswählen
            <select
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-blue-400 transition focus:ring-2"
              value={selectedLeague}
              onChange={(event) => setSelectedLeague(event.target.value)}
              disabled={loading}
            >
              {leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-zinc-300">
            Ergebnisse
            <select
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-blue-400 transition focus:ring-2"
              value={resultFilter}
              onChange={(event) => setResultFilter(event.target.value as "all" | "with_result" | "without_result")}
              disabled={loading}
            >
              <option value="all">Alle anzeigen</option>
              <option value="with_result">Nur mit Ergebnis</option>
              <option value="without_result">Nur ohne Ergebnis</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => loadNews(sport, selectedLeague, resultFilter)}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={loading}
          >
            {loading ? "Aktualisiere…" : "Neu laden"}
          </button>
        </div>
      </section>

      {warning ? (
        <p className="mt-4 rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">{warning}</p>
      ) : null}
      {error ? <p className="mt-4 rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{error}</p> : null}

      {news.length === 0 && !loading ? <p className="mt-4 text-sm text-zinc-500">Keine aktuellen Spiele gefunden.</p> : null}

      {news.length > 0 ? (
        <section className="mt-6 grid gap-3">
          {news.map((item) => (
            <article key={`${item.title}-${item.date}`} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700">
              <a href={item.url} target="_blank" rel="noreferrer" className="text-lg font-semibold text-blue-300 hover:text-blue-200">
                {item.title}
              </a>
              <p className="mt-1 text-sm text-zinc-300">{item.source}</p>
              {item.hasResult ? (
                <p className="mt-1 text-sm text-emerald-300">Ergebnis: {item.homeScore} - {item.awayScore}</p>
              ) : (
                <p className="mt-1 text-sm text-zinc-400">Noch kein Ergebnis ({item.status})</p>
              )}
              <p className="mt-1 text-xs text-zinc-500">{formatDate(item.date)}</p>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}