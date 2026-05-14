"use client";

import Link from "next/link";
import { useState } from "react";
import { useSportsNewsSpoilerPrefs } from "@/components/sports-news/SportsNewsSpoilerToolbar";
import { resolveGameHighlightsYoutubeUrl } from "@/lib/sports-news-highlights-url";

type SportsNewsItem = {
  title: string;
  source: string;
  date: string;
  url: string;
  status?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  hasResult?: boolean;
  statsLink?: string;
  youtubeHighlightsSearchUrl?: string;
};

type SportsNewsPayload = {
  items?: SportsNewsItem[];
  warning?: string | null;
  error?: string;
};

function formatDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Zeitpunkt unbekannt";
  }

  return parsed.toLocaleString("de-DE");
}

async function fetchNewsFromEndpoint(endpoint: string) {
  const response = await fetch(endpoint);
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(`Endpoint ${endpoint} liefert kein JSON.`);
  }

  const payload = (await response.json()) as SportsNewsPayload;

  if (!response.ok) {
    throw new Error(payload.error ?? `Endpoint ${endpoint} antwortet mit Fehler.`);
  }

  return payload;
}

export default function SportsNewsSection() {
  const { hideScores, setHideScores, highlightsYoutubeUrl } = useSportsNewsSpoilerPrefs();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [news, setNews] = useState<SportsNewsItem[]>([]);

  const loadNews = async () => {
    try {
      setLoading(true);
      setError(null);
      setWarning(null);

      const endpointCandidates = ["/api/sports-news", "/api/session/sports-news"];
      let payload: SportsNewsPayload | null = null;
      let lastEndpointError: Error | null = null;

      for (const endpoint of endpointCandidates) {
        try {
          payload = await fetchNewsFromEndpoint(endpoint);
          break;
        } catch (endpointError) {
          lastEndpointError =
            endpointError instanceof Error
              ? endpointError
              : new Error("Unbekannter Endpoint-Fehler");
        }
      }

      if (!payload) {
        throw lastEndpointError ?? new Error("Kein passender News-Endpoint gefunden.");
      }

      setNews(payload.items ?? []);
      setWarning(payload.warning ?? null);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unbekannter Fehler beim Laden der News.";

      setError(`Sport-News konnten nicht geladen werden. Details: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="relative mt-6 overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-900/40 p-5 shadow-xl shadow-black/25 ring-1 ring-white/[0.04] backdrop-blur-md">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_0%_0%,rgba(16,185,129,0.07),transparent)]"
      />

      <div className="relative space-y-0.5">
        <h2 className="text-base font-bold tracking-tight text-white">NBA · Kurzüberblick</h2>
        <p className="text-xs text-zinc-600">Ball Dont Lie · ~15&nbsp;Min Cache</p>
      </div>

      <div className="relative mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-300">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={hideScores}
            onChange={(e) => setHideScores(e.target.checked)}
            className="rounded border-zinc-600"
          />
          Keine Spielstände
        </label>
        <a
          href={highlightsYoutubeUrl}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-red-300 underline-offset-2 hover:underline"
        >
          Highlights (YouTube)
        </a>
        <span className="text-zinc-600">
          URL anpassen:{" "}
          <Link href="/sports-news" className="text-emerald-400 hover:underline">
            Sports Hub
          </Link>
        </span>
      </div>

      <div className="relative mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={loadNews}
          disabled={loading}
          className="rounded-xl bg-gradient-to-b from-emerald-600 to-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/35 ring-1 ring-emerald-400/15 transition hover:from-emerald-500 hover:to-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Laden…" : "Aktualisieren"}
        </button>
        <Link
          href="/sports-news"
          className="inline-flex items-center rounded-xl border border-white/10 bg-zinc-800/50 px-4 py-2.5 text-sm font-semibold text-zinc-200 ring-1 ring-white/[0.04] transition hover:border-emerald-500/25 hover:bg-emerald-950/25 hover:text-emerald-50"
        >
          Ergebnisse
        </Link>
        <Link
          href="/sports-news/upcoming"
          className="inline-flex items-center rounded-xl border border-cyan-500/25 bg-cyan-950/35 px-4 py-2.5 text-sm font-semibold text-cyan-100 ring-1 ring-cyan-500/15 transition hover:border-cyan-400/40 hover:bg-cyan-950/55"
        >
          Kommende
        </Link>
      </div>

      {error ?
        <p className="relative mt-4 rounded-xl border border-red-500/25 bg-red-950/40 p-3 text-sm leading-relaxed text-red-100 ring-1 ring-red-500/10">
          {error}
        </p>
      : null}
      {warning ?
        <p className="relative mt-4 rounded-xl border border-amber-500/25 bg-amber-950/35 p-3 text-sm leading-relaxed text-amber-100 ring-1 ring-amber-500/10">
          {warning}
        </p>
      : null}

      {!error && news.length === 0 ?
        <p className="relative mt-4 text-sm text-zinc-500">Noch keine Daten geladen.</p>
      : null}

      {news.length > 0 ?
        <ul className="relative mt-5 space-y-3">
          {news.map((item) => (
            <li
              key={`${item.title}-${item.date}-${item.status ?? ""}`}
              className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-zinc-900/70 to-zinc-950/90 p-4 ring-1 ring-white/[0.03] transition hover:border-white/[0.1]"
            >
              <a href={item.url} target="_blank" rel="noreferrer" className="font-semibold text-zinc-100 underline decoration-emerald-500/35 underline-offset-2 hover:decoration-emerald-400/60">
                {item.title}
              </a>
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={resolveGameHighlightsYoutubeUrl(highlightsYoutubeUrl, item.youtubeHighlightsSearchUrl ?? "")}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-red-500/30 bg-red-950/30 px-2 py-0.5 text-[10px] font-semibold text-red-100 hover:border-red-400/50"
                >
                  Highlights
                </a>
                {item.statsLink ?
                  <a
                    href={item.statsLink}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-white/10 bg-zinc-800/60 px-2 py-0.5 text-[10px] font-medium text-zinc-200 hover:border-emerald-500/30"
                  >
                    {item.statsLink.includes("/box-score") ? "Box Score" : "NBA.com"}
                  </a>
                : null}
              </div>
              {!item.hasResult ?
                <p className="mt-2 text-xs font-medium text-cyan-300/95">
                  {item.status ? `${item.status} · ` : ""}
                  Kommend
                </p>
              : item.homeScore != null && item.awayScore != null ?
                <div className="mt-2 inline-flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/15 bg-emerald-950/25 px-3 py-1 ring-1 ring-emerald-500/10">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500/75">FT</span>
                  <span className="text-[10px] text-emerald-400/80">Gast · Heim</span>
                  <span className="tabular-nums text-sm font-bold text-emerald-100">
                    {hideScores ? "••• : •••" : `${item.awayScore} : ${item.homeScore}`}
                  </span>
                </div>
              : <p className="mt-2 text-xs font-medium text-emerald-200/80">Ergebnis vorhanden</p>}
              <p className="mt-2 text-xs leading-relaxed text-zinc-600">
                {item.source} · {formatDate(item.date)}
              </p>
            </li>
          ))}
        </ul>
      : null}
    </section>
  );
}
