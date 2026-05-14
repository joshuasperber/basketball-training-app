"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  MessageBanner,
  ResultGameCard,
  SectionHeading,
  SportsNewsPageTitle,
  SportsNewsRefreshButton,
  SportsNewsSegmentNav,
  SportsNewsShell,
} from "@/components/sports-news/SportsNewsChrome";
import SportsNewsSpoilerToolbar, { useSportsNewsSpoilerPrefs } from "@/components/sports-news/SportsNewsSpoilerToolbar";
import { resolveGameHighlightsYoutubeUrl } from "@/lib/sports-news-highlights-url";

type SportsNewsTopScorer = {
  name: string;
  pts: number;
  reb: number;
  ast: number;
  teamAbbr: string;
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
  gameId?: number | null;
  topScorers?: SportsNewsTopScorer[];
  statsLink?: string;
  youtubeHighlightsSearchUrl?: string;
};

type SportsNewsPayload = {
  sport?: string;
  items?: SportsNewsItem[];
  upcomingItems?: SportsNewsItem[];
  warning?: string | null;
  error?: string;
};

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Zeitpunkt unbekannt";
  return parsed.toLocaleString("de-DE");
}

export default function SportsNewsPage() {
  const { hideScores, highlightsYoutubeUrl } = useSportsNewsSpoilerPrefs();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [news, setNews] = useState<SportsNewsItem[]>([]);

  const loadNews = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/sports-news?sport=basketball`);
      const payload = (await response.json()) as SportsNewsPayload;

      if (!response.ok) {
        throw new Error(payload.error ?? "Fehler beim Laden der Sport-News.");
      }

      setNews(payload.items ?? []);
      setWarning(payload.warning ?? null);
    } catch (newsError) {
      setError(newsError instanceof Error ? newsError.message : "Unbekannter Fehler beim Laden.");
      setNews([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNews();
  }, []);

  const upcomingGames = useMemo(() => news.filter((item) => !item.hasResult), [news]);
  const finishedGames = useMemo(() => news.filter((item) => item.hasResult), [news]);

  return (
    <SportsNewsShell>
      <SportsNewsSegmentNav trailing={<SportsNewsRefreshButton loading={loading} onClick={() => void loadNews()} />} />

      <SportsNewsPageTitle title="NBA Sports Hub" />

      <SportsNewsSpoilerToolbar className="mt-3" />

      {warning ? <MessageBanner variant="warning">{warning}</MessageBanner> : null}
      {error ? <MessageBanner variant="error">{error}</MessageBanner> : null}

      {finishedGames.length === 0 && upcomingGames.length > 0 && !loading ?
        <MessageBanner variant="info">
          Nur kommende Spiele —{" "}
          <Link href="/sports-news/upcoming" className="text-cyan-300 underline-offset-2 hover:underline">
            Kalender
          </Link>
          .
        </MessageBanner>
      : null}

      {news.length === 0 && !loading ? <MessageBanner variant="info">Keine Daten im Zeitfenster.</MessageBanner> : null}

      {finishedGames.length > 0 ?
        <>
          <SectionHeading accent="emerald" title="Ergebnisse" />
          <div className="mt-4 grid gap-3">
            {finishedGames.map((item) => (
              <ResultGameCard
                key={`${item.title}-${item.date}-${item.gameId ?? ""}`}
                title={item.title}
                source={item.source}
                dateLabel={formatDate(item.date)}
                homeScore={item.homeScore}
                awayScore={item.awayScore}
                titleSearchUrl={item.url}
                statsLink={item.statsLink}
                topScorers={item.topScorers}
                gameId={item.gameId}
                hideScores={hideScores}
                highlightsYoutubeUrl={resolveGameHighlightsYoutubeUrl(
                  highlightsYoutubeUrl,
                  item.youtubeHighlightsSearchUrl ?? "",
                )}
              />
            ))}
          </div>
        </>
      : null}
    </SportsNewsShell>
  );
}
