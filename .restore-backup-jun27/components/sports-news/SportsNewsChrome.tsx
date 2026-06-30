"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Gemeinsamer Rahmen für `/sports-news` und `/sports-news/upcoming`. */
export function SportsNewsShell({ children }: { children: ReactNode }) {
  return (
    <main className="app-container animate-in">
      <div className="mx-auto max-w-2xl lg:max-w-3xl">{children}</div>
    </main>
  );
}

export function SportsNewsSegmentNav({ trailing }: { trailing?: ReactNode }) {
  const pathname = usePathname();
  const hubActive = pathname === "/sports-news" || pathname === "/sports-news/";
  const upcomingActive = pathname?.startsWith("/sports-news/upcoming") ?? false;

  return (
    <div className="flex items-center gap-2">
      <nav className="top-tabs flex min-w-0 flex-1" aria-label="NBA Sports Hub">
        <Link
          href="/sports-news"
          className={`top-tabs__btn flex-1 text-center ${hubActive ? "top-tabs__btn--active" : ""}`}
        >
          Ergebnisse
        </Link>
        <Link
          href="/sports-news/upcoming"
          className={`top-tabs__btn flex-1 text-center ${upcomingActive ? "top-tabs__btn--active" : ""}`}
        >
          Kommende
        </Link>
      </nav>
      {trailing ? <div className="flex shrink-0 items-center">{trailing}</div> : null}
    </div>
  );
}

export function SportsNewsRefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-label={loading ? "Wird aktualisiert" : "Liste aktualisieren"}
      className="icon-btn"
    >
      {loading ? <span className="text-xs">…</span> : <span aria-hidden>↻</span>}
    </button>
  );
}

export function SportsNewsPageTitle({ title, tone = "neutral" }: { title: string; tone?: "neutral" | "cyan" }) {
  return (
    <header className="mt-4">
      <h1 className={`page-title ${tone === "cyan" ? "text-brand" : ""}`}>{title}</h1>
    </header>
  );
}

export function MessageBanner({
  variant,
  children,
}: {
  variant: "warning" | "error" | "info";
  children: ReactNode;
}) {
  const map = {
    warning: "hint-warning",
    error: "hint-warning",
    info: "hint-violet",
  } as const;

  return (
    <div className={`mt-3 text-xs leading-relaxed ${map[variant]}`}>
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  subtitle,
  accent,
}: {
  title: string;
  subtitle?: string;
  accent: "emerald" | "cyan";
}) {
  const line =
    accent === "cyan" ? "from-[var(--accent-cyan)]/60 to-transparent" : "from-[var(--accent-emerald)]/60 to-transparent";

  return (
    <div className="mt-6 space-y-1">
      <div className={`h-px w-12 rounded-full bg-gradient-to-r ${line}`} />
      <h2 className="section-title">{title}</h2>
      {subtitle ? <p className="text-xs text-faint">{subtitle}</p> : null}
    </div>
  );
}

export function ResultGameCard({
  title,
  source,
  dateLabel,
  homeScore,
  awayScore,
  titleSearchUrl,
  statsLink,
  topScorers,
  gameId,
  hideScores,
  highlightsYoutubeUrl,
}: {
  title: string;
  source: string;
  dateLabel: string;
  homeScore: number | null;
  awayScore: number | null;
  titleSearchUrl: string;
  statsLink?: string;
  topScorers?: { name: string; pts: number; reb: number; ast: number; teamAbbr: string }[];
  gameId?: number | null;
  hideScores: boolean;
  highlightsYoutubeUrl: string;
}) {
  const hasFt = homeScore != null && awayScore != null;

  return (
    <article className="list-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <a
          href={titleSearchUrl}
          target="_blank"
          rel="noreferrer"
          title={`Infos & Kontext · ${dateLabel}`}
          className="list-card__title underline decoration-brand/40 underline-offset-2 hover:decoration-brand/70"
        >
          {title}
        </a>
        <div className="list-card__actions shrink-0">
          <a
            href={highlightsYoutubeUrl}
            target="_blank"
            rel="noreferrer"
            title={
              highlightsYoutubeUrl.includes("/search?") || highlightsYoutubeUrl.includes("/search&")
                ? "Passendes Highlight im Kanal @TheGametimeHighlights suchen"
                : "YouTube Highlights"
            }
            className="btn btn-outline btn-xs"
          >
            {highlightsYoutubeUrl.includes("/search?") || highlightsYoutubeUrl.includes("/search&") ?
              "Highlights suchen"
            : "YouTube Highlights"}
          </a>
          {statsLink ?
            <a
              href={statsLink}
              target="_blank"
              rel="noreferrer"
              title={
                statsLink.includes("/box-score") ?
                  "Offizieller NBA Box Score"
                : "Spiele dieses Tages auf NBA.com — dort zum gewünschten Spiel und Box Score wechseln"
              }
              className="btn btn-ghost btn-xs"
            >
              {statsLink.includes("/box-score") ? "Box Score" : "NBA.com"}
            </a>
          : null}
        </div>
      </div>
      <p className="list-card__meta line-clamp-2">{source}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {hasFt ?
          <div className="chip chip-success flex flex-wrap items-center gap-2 px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide">FT</span>
            <span className="text-[10px]">Gast · Heim</span>
            {hideScores ?
              <span className="tabular-nums text-xl font-bold tracking-tight text-muted">••• : •••</span>
            : <span className="tabular-nums text-xl font-bold tracking-tight text-strong">
                {awayScore ?? "–"} <span className="text-muted">:</span> {homeScore ?? "–"}
              </span>}
          </div>
        : null}
        <time className="text-[11px] text-faint">{dateLabel}</time>
      </div>

      {!hideScores && topScorers?.length ?
        <details className="mt-3 app-card--flat p-2.5 text-xs">
          <summary className="cursor-pointer font-medium text-muted hover:text-strong">Top Scorer</summary>
          <p className="mt-1.5 text-[11px] text-faint">PTS · REB · AST</p>
          <ul className="mt-2 space-y-1.5">
            {topScorers.map((row, idx) => (
              <li key={`${gameId}-${idx}-${row.name}`} className="flex flex-wrap justify-between gap-2 border-t border-[var(--surface-border)] pt-1.5 text-muted first:border-t-0 first:pt-0">
                <span>
                  {row.name} <span className="text-faint">({row.teamAbbr})</span>
                </span>
                <span className="tabular-nums text-faint">
                  {row.pts} · {row.reb} · {row.ast}
                </span>
              </li>
            ))}
          </ul>
        </details>
      : null}
    </article>
  );
}

export function UpcomingGameCard({
  title,
  source,
  dateLabel,
  status,
  titleSearchUrl,
  homeScore,
  awayScore,
  hideScores,
  highlightsYoutubeUrl,
}: {
  title: string;
  source: string;
  dateLabel: string;
  status: string;
  titleSearchUrl: string;
  homeScore: number | null;
  awayScore: number | null;
  hideScores: boolean;
  highlightsYoutubeUrl: string;
}) {
  const live = homeScore != null || awayScore != null;

  return (
    <article className="app-card--accent-cyan">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <a
          href={titleSearchUrl}
          target="_blank"
          rel="noreferrer"
          title={`Infos · ${dateLabel}`}
          className="list-card__title underline decoration-[var(--accent-cyan)]/40 underline-offset-2 hover:decoration-[var(--accent-cyan)]/70"
        >
          {title}
        </a>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <a
            href={highlightsYoutubeUrl}
            target="_blank"
            rel="noreferrer"
            title={
              highlightsYoutubeUrl.includes("/search?") || highlightsYoutubeUrl.includes("/search&")
                ? "Passendes Highlight im Kanal @TheGametimeHighlights suchen"
                : "YouTube"
            }
            className="btn btn-outline btn-xs"
          >
            {highlightsYoutubeUrl.includes("/search?") || highlightsYoutubeUrl.includes("/search&") ? "YT suchen" : "YouTube"}
          </a>
          <span className="chip chip-info text-[11px] font-semibold uppercase tracking-wide">
            {status}
          </span>
        </div>
      </div>
      <p className="list-card__meta line-clamp-2">{source}</p>
      <time className="mt-2 block text-[11px] text-faint">{dateLabel}</time>
      {live ?
        <div className="mt-3 hint-warning">
          <p className="text-[11px] font-medium uppercase tracking-wide">Stand (Gast · Heim)</p>
          <p className="tabular-nums text-lg font-bold text-strong">
            {hideScores ?
              "••• : •••"
            : <>
                {awayScore ?? "–"} : {homeScore ?? "–"}{" "}
                <span className="text-xs font-normal text-faint">(live / vorläufig)</span>
              </>}
          </p>
        </div>
      : null}
    </article>
  );
}
