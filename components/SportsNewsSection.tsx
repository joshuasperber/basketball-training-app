"use client";

import GradientFadeList from "@/components/GradientFadeList";
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
    <section className="mt-6 app-card">
      <div className="space-y-0.5">
        <h2 className="section-title">NBA · Kurzüberblick</h2>
        <p className="text-xs text-faint">Ball Dont Lie · ~15&nbsp;Min Cache</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={hideScores}
            onChange={(e) => setHideScores(e.target.checked)}
            className="rounded border-[var(--surface-border-strong)]"
          />
          Keine Spielstände
        </label>
        <a
          href={highlightsYoutubeUrl}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-brand underline-offset-2 hover:underline"
        >
          Highlights (YouTube)
        </a>
        <span className="text-faint">
          URL anpassen:{" "}
          <Link href="/sports-news" className="text-brand hover:underline">
            Sports Hub
          </Link>
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={loadNews}
          disabled={loading}
          className="btn btn-emerald btn-sm"
        >
          {loading ? "Laden…" : "Aktualisieren"}
        </button>
        <Link href="/sports-news" className="btn btn-ghost btn-sm">
          Ergebnisse
        </Link>
        <Link href="/sports-news/upcoming" className="btn btn-cyan btn-sm">
          Kommende
        </Link>
      </div>

      {error ?
        <p className="mt-4 hint-warning text-sm leading-relaxed">
          {error}
        </p>
      : null}
      {warning ?
        <p className="mt-4 hint-warning text-sm leading-relaxed">
          {warning}
        </p>
      : null}

      {!error && news.length === 0 ?
        <p className="mt-4 text-sm text-muted">Noch keine Daten geladen.</p>
      : null}

      {news.length > 0 ?
        <GradientFadeList
          className="mt-5"
          items={news}
          listClassName="space-y-3"
          getKey={(item) => `${item.title}-${item.date}-${item.status ?? ""}`}
          renderItem={(item) => (
            <div className="list-card">
              <a href={item.url} target="_blank" rel="noreferrer" className="list-card__title underline decoration-brand/35 underline-offset-2 hover:decoration-brand/60">
                {item.title}
              </a>
              <div className="list-card__actions">
                <a
                  href={resolveGameHighlightsYoutubeUrl(highlightsYoutubeUrl, item.youtubeHighlightsSearchUrl ?? "")}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-outline btn-xs"
                >
                  Highlights
                </a>
                {item.statsLink ?
                  <a
                    href={item.statsLink}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-ghost btn-xs"
                  >
                    {item.statsLink.includes("/box-score") ? "Box Score" : "NBA.com"}
                  </a>
                : null}
              </div>
              {!item.hasResult ?
                <p className="mt-2 text-xs font-medium hint-violet">
                  {item.status ? `${item.status} · ` : ""}
                  Kommend
                </p>
              : item.homeScore != null && item.awayScore != null ?
                <div className="mt-2 inline-flex flex-wrap items-center gap-2 chip chip-success px-3 py-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide">FT</span>
                  <span className="text-[10px]">Gast · Heim</span>
                  <span className="tabular-nums text-sm font-bold text-strong">
                    {hideScores ? "••• : •••" : `${item.awayScore} : ${item.homeScore}`}
                  </span>
                </div>
              : <p className="mt-2 text-xs hint-success">Ergebnis vorhanden</p>}
              <p className="mt-2 text-xs leading-relaxed text-faint">
                {item.source} · {formatDate(item.date)}
              </p>
            </div>
          )}
        />
      : null}
    </section>
  );
}
