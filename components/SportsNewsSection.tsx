"use client";

import { useState } from "react";
import Link from "next/link";

type SportsNewsItem = {
  title: string;
  source: string;
  date: string;
  url: string;
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
  const response = await fetch(endpoint, { cache: "no-store" });
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
    <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-lg font-semibold">Sport-News</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Lade aktuelle Basketball-Spiele von API-Sports.
      </p>

      <button
        type="button"
        onClick={loadNews}
        className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
        disabled={loading}
      >
        {loading ? "News werden geladen..." : "Sport-News laden"}
      </button>
      <Link
        href="/sports-news"
        className="ml-3 inline-block rounded-xl border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
      >
        Vollständige News-Seite
      </Link>

      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      {warning ? <p className="mt-3 text-sm text-amber-300">{warning}</p> : null}

      {!error && news.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">Noch keine Live-News verfügbar.</p>
      ) : null}

      {news.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {news.map((item) => (
            <li key={`${item.title}-${item.date}`} className="rounded-xl bg-zinc-950 p-3">
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-blue-300 hover:text-blue-200"
              >
                {item.title}
              </a>
              <p className="mt-1 text-xs text-zinc-500">
                {item.source} · {formatDate(item.date)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}