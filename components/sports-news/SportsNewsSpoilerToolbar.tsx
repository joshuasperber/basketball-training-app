"use client";

import { useCallback, useEffect, useState } from "react";

export const SPORTS_NEWS_HIDE_SCORES_KEY = "bt.sports-news.hide-scores";
export const SPORTS_NEWS_HIGHLIGHTS_YT_URL_KEY = "bt.sports-news.highlights-youtube-url";

/** TheGameTimeHighlights (YouTube) — Nutzer kann URL in den Einstellungen überschreiben. */
export const DEFAULT_NBA_HIGHLIGHTS_YOUTUBE_URL = "https://www.youtube.com/@TheGametimeHighlights/videos";

export function readHideScoresFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SPORTS_NEWS_HIDE_SCORES_KEY) === "1";
}

export function readHighlightsYoutubeUrlFromStorage(): string {
  if (typeof window === "undefined") return DEFAULT_NBA_HIGHLIGHTS_YOUTUBE_URL;
  return window.localStorage.getItem(SPORTS_NEWS_HIGHLIGHTS_YT_URL_KEY) || DEFAULT_NBA_HIGHLIGHTS_YOUTUBE_URL;
}

const SPOILER_EVENT = "bt:sports-news-spoiler";

export function notifySportsNewsSpoilerChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SPOILER_EVENT));
}

export function useSportsNewsSpoilerPrefs() {
  const [hideScores, setHideScoresState] = useState(false);
  const [highlightsYoutubeUrl, setHighlightsYoutubeUrlState] = useState(DEFAULT_NBA_HIGHLIGHTS_YOUTUBE_URL);
  const [hydrated, setHydrated] = useState(false);

  const refreshFromStorage = useCallback(() => {
    setHideScoresState(readHideScoresFromStorage());
    setHighlightsYoutubeUrlState(readHighlightsYoutubeUrlFromStorage());
  }, []);

  useEffect(() => {
    refreshFromStorage();
    setHydrated(true);
    window.addEventListener(SPOILER_EVENT, refreshFromStorage);
    return () => window.removeEventListener(SPOILER_EVENT, refreshFromStorage);
  }, [refreshFromStorage]);

  const setHideScores = useCallback((value: boolean) => {
    window.localStorage.setItem(SPORTS_NEWS_HIDE_SCORES_KEY, value ? "1" : "0");
    setHideScoresState(value);
    notifySportsNewsSpoilerChanged();
  }, []);

  const setHighlightsYoutubeUrl = useCallback((url: string) => {
    const trimmed = url.trim() || DEFAULT_NBA_HIGHLIGHTS_YOUTUBE_URL;
    window.localStorage.setItem(SPORTS_NEWS_HIGHLIGHTS_YT_URL_KEY, trimmed);
    setHighlightsYoutubeUrlState(trimmed);
    notifySportsNewsSpoilerChanged();
  }, []);

  return { hideScores, setHideScores, highlightsYoutubeUrl, setHighlightsYoutubeUrl, hydrated };
}

type ToolbarProps = {
  className?: string;
};

export default function SportsNewsSpoilerToolbar({ className = "" }: ToolbarProps) {
  const { hideScores, setHideScores, highlightsYoutubeUrl, setHighlightsYoutubeUrl, hydrated } = useSportsNewsSpoilerPrefs();
  const [urlDraft, setUrlDraft] = useState("");

  useEffect(() => {
    if (hydrated) setUrlDraft(highlightsYoutubeUrl);
  }, [hydrated, highlightsYoutubeUrl]);

  if (!hydrated) {
    return <div className={`rounded-xl border border-white/[0.06] bg-zinc-900/40 p-3 text-xs text-zinc-500 ${className}`}>Lade Anzeigeoptionen…</div>;
  }

  return (
    <div className={`rounded-xl border border-white/[0.08] bg-zinc-900/50 p-3 ring-1 ring-white/[0.04] ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Spoiler-Schutz</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-200">
          <input
            type="checkbox"
            checked={hideScores}
            onChange={(e) => setHideScores(e.target.checked)}
            className="rounded border-zinc-600"
          />
          Keine Spielstände anzeigen
        </label>
        <a
          href={highlightsYoutubeUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-1.5 text-xs font-semibold text-red-100 transition hover:border-red-400/50 hover:bg-red-950/50"
        >
          Highlights (YouTube)
        </a>
      </div>
      <div className="mt-3 space-y-1">
        <label className="text-[11px] text-zinc-500" htmlFor="nba-yt-url">
          Eigene YouTube-URL (z. B. ein konkretes Video — gilt dann für alle Spiele; sonst Kanal @TheGametimeHighlights)
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="nba-yt-url"
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=… oder @TheGametimeHighlights"
            className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100"
          />
          <button
            type="button"
            onClick={() => setHighlightsYoutubeUrl(urlDraft)}
            className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-900/50"
          >
            URL speichern
          </button>
        </div>
      </div>
    </div>
  );
}
