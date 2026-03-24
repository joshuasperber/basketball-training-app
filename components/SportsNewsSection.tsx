"use client";

import { useState } from "react";

type SportsNewsItem = {
  title: string;
  source: string;
  date: string;
  url: string;
};

function formatDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Zeitpunkt unbekannt";
  }

  return parsed.toLocaleString("de-DE");
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

      const response = await fetch("/api/sports-news", { cache: "no-store" });
      const payload = (await response.json()) as {
        items?: SportsNewsItem[];
        warning?: string | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "News konnten nicht geladen werden.");
      }

      setNews(payload.items ?? []);
      setWarning(payload.warning ?? null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unbekannter Fehler beim Laden der News.",
      );
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
        {loading ? "News werden geladen..." : "Sport-News anschließen"}
      </button>

      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      {warning ? <p className="mt-3 text-sm text-amber-300">{warning}</p> : null}

      {!error && news.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">Noch keine News geladen.</p>
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