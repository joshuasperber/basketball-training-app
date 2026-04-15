"use client";

import { useEffect, useState } from "react";

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
  if (Number.isNaN(parsed.getTime())) return "Zeitpunkt unbekannt";
  return parsed.toLocaleString("de-DE");
}

export default function SportsNewsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [news, setNews] = useState<SportsNewsItem[]>([]);

  const loadNews = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/sports-news", { cache: "no-store" });
      const payload = (await response.json()) as SportsNewsPayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "Fehler beim Laden der Sport-News.");
      }
      setNews(payload.items ?? []);
      setWarning(payload.warning ?? null);
    } catch (newsError) {
      setError(newsError instanceof Error ? newsError.message : "Unbekannter Fehler beim Laden.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNews();
  }, []);

  return (
    <main className="min-h-screen bg-black p-6 pb-24 text-white">
      <h1 className="text-2xl font-bold">Sports News</h1>
      <p className="mt-2 text-zinc-400">Live-Basketballspiele & Updates aus API-Sports.</p>

      <button
        type="button"
        onClick={loadNews}
        className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
        disabled={loading}
      >
        {loading ? "Aktualisiere…" : "Neu laden"}
      </button>

      {warning ? <p className="mt-4 rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">{warning}</p> : null}
      {error ? <p className="mt-4 rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{error}</p> : null}

      {news.length === 0 && !loading ? (
        <p className="mt-4 text-sm text-zinc-500">Keine aktuellen Spiele gefunden.</p>
      ) : null}

      {news.length > 0 ? (
        <section className="mt-6 grid gap-3">
          {news.map((item) => (
            <article key={`${item.title}-${item.date}`} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <a href={item.url} target="_blank" rel="noreferrer" className="text-lg font-semibold text-blue-300 hover:text-blue-200">
                {item.title}
              </a>
              <p className="mt-1 text-sm text-zinc-300">{item.source}</p>
              <p className="mt-1 text-xs text-zinc-500">{formatDate(item.date)}</p>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}