"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  MessageBanner,
  SectionHeading,
  SportsNewsPageTitle,
  SportsNewsRefreshButton,
  SportsNewsSegmentNav,
  SportsNewsShell,
  UpcomingGameCard,
} from "@/components/sports-news/SportsNewsChrome";
import SportsNewsSpoilerToolbar, { useSportsNewsSpoilerPrefs } from "@/components/sports-news/SportsNewsSpoilerToolbar";
import { resolveGameHighlightsYoutubeUrl } from "@/lib/sports-news-highlights-url";

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

export default function SportsNewsUpcomingPage() {
  const { hideScores, highlightsYoutubeUrl } = useSportsNewsSpoilerPrefs();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<SportsNewsItem[]>([]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/sports-news?sport=basketball`);
      const payload = (await response.json()) as SportsNewsPayload;

      if (!response.ok) {
        throw new Error(payload.error ?? "Fehler beim Laden.");
      }

      const list =
        payload.upcomingItems?.length ?
          payload.upcomingItems
        : (payload.items ?? []).filter((item) => !item.hasResult);

      setUpcoming(list);
      setWarning(payload.warning ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler beim Laden.");
      setUpcoming([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <SportsNewsShell>
      <SportsNewsSegmentNav trailing={<SportsNewsRefreshButton loading={loading} onClick={() => void load()} />} />

      <SportsNewsPageTitle title="Kommende Spiele" tone="cyan" />

      <SportsNewsSpoilerToolbar className="mt-3" />

      {warning ? <MessageBanner variant="warning">{warning}</MessageBanner> : null}
      {error ? <MessageBanner variant="error">{error}</MessageBanner> : null}

      {upcoming.length === 0 && !loading ?
        <MessageBanner variant="info">
          Nichts im Fenster.{" "}
          <Link href="/sports-news" className="text-emerald-300 underline-offset-2 hover:underline">
            Ergebnisse
          </Link>
        </MessageBanner>
      : null}

      {upcoming.length > 0 ?
        <>
          <SectionHeading accent="cyan" title="Spielplan" />
          <div className="mt-4 grid gap-3">
            {upcoming.map((item) => (
              <UpcomingGameCard
                key={`${item.title}-${item.date}-${item.gameId ?? ""}-up`}
                title={item.title}
                source={item.source}
                dateLabel={formatDate(item.date)}
                status={item.status}
                titleSearchUrl={item.url}
                homeScore={item.homeScore}
                awayScore={item.awayScore}
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
