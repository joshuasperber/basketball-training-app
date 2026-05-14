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

  const pill =
    "relative flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold tracking-tight transition-all duration-200 sm:px-4";

  return (
    <div className="flex items-center gap-2">
      <nav
        className="flex min-w-0 flex-1 gap-1 rounded-2xl border border-white/[0.06] bg-zinc-900/50 p-1 shadow-lg shadow-black/30 backdrop-blur-md ring-1 ring-white/[0.04]"
        aria-label="NBA Sports Hub"
      >
        <Link
          href="/sports-news"
          className={`${pill} ${
            hubActive ?
              "bg-gradient-to-b from-zinc-700/90 to-zinc-800/90 text-white shadow-md shadow-black/25 ring-1 ring-white/10"
            : "text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-200"
          }`}
        >
          Ergebnisse
        </Link>
        <Link
          href="/sports-news/upcoming"
          className={`${pill} ${
            upcomingActive ?
              "bg-gradient-to-b from-cyan-900/70 to-cyan-950/90 text-cyan-50 shadow-md shadow-cyan-950/40 ring-1 ring-cyan-500/25"
            : "text-zinc-500 hover:bg-cyan-950/25 hover:text-cyan-100/90"
          }`}
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
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-zinc-800/70 text-base leading-none text-zinc-400 transition hover:bg-zinc-700 hover:text-white disabled:opacity-40"
    >
      {loading ? <span className="text-xs">…</span> : <span aria-hidden>↻</span>}
    </button>
  );
}

export function SportsNewsPageTitle({ title, tone = "neutral" }: { title: string; tone?: "neutral" | "cyan" }) {
  const gradient =
    tone === "cyan" ?
      "bg-gradient-to-br from-cyan-100 via-cyan-100 to-zinc-500 bg-clip-text text-transparent"
    : "bg-gradient-to-br from-white via-zinc-100 to-zinc-500 bg-clip-text text-transparent";

  return (
    <header className="mt-4">
      <h1 className={`text-xl font-bold tracking-tight sm:text-2xl ${gradient}`}>{title}</h1>
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
    warning: "border-amber-500/25 bg-amber-950/35 text-amber-100 ring-amber-500/10",
    error: "border-red-500/25 bg-red-950/40 text-red-100 ring-red-500/10",
    info: "border-zinc-600/40 bg-zinc-900/60 text-zinc-300 ring-white/[0.04]",
  } as const;

  return (
    <div className={`mt-3 rounded-xl border p-3 text-xs leading-relaxed ring-1 backdrop-blur-sm ${map[variant]}`}>
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
    accent === "cyan" ? "from-cyan-400/80 via-cyan-500/40 to-transparent" : "from-emerald-400/80 via-emerald-500/40 to-transparent";

  return (
    <div className="mt-6 space-y-1">
      <div className={`h-px w-12 rounded-full bg-gradient-to-r ${line}`} />
      <h2 className="text-lg font-bold tracking-tight text-white">{title}</h2>
      {subtitle ? <p className="text-xs text-zinc-600">{subtitle}</p> : null}
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
    <article className="group rounded-xl border border-white/[0.06] bg-gradient-to-b from-zinc-900/80 to-zinc-950/90 p-4 shadow-md shadow-black/25 ring-1 ring-white/[0.04] transition hover:border-emerald-500/20 hover:ring-emerald-500/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <a
          href={titleSearchUrl}
          target="_blank"
          rel="noreferrer"
          title={`Infos & Kontext · ${dateLabel}`}
          className="text-base font-semibold text-zinc-100 underline decoration-emerald-500/40 underline-offset-2 transition group-hover:decoration-emerald-400/70"
        >
          {title}
        </a>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a
            href={highlightsYoutubeUrl}
            target="_blank"
            rel="noreferrer"
            title={
              highlightsYoutubeUrl.includes("/search?") || highlightsYoutubeUrl.includes("/search&")
                ? "Passendes Highlight im Kanal @TheGametimeHighlights suchen"
                : "YouTube Highlights"
            }
            className="rounded-lg border border-red-500/35 bg-red-950/35 px-2.5 py-1 text-[11px] font-semibold text-red-100 transition hover:border-red-400/50 hover:bg-red-950/50"
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
              className="rounded-lg border border-white/10 bg-zinc-800/60 px-2.5 py-1 text-[11px] font-medium text-zinc-200 transition hover:border-emerald-500/30 hover:bg-emerald-950/30 hover:text-emerald-100"
            >
              {statsLink.includes("/box-score") ? "Box Score" : "NBA.com"}
            </a>
          : null}
        </div>
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs text-zinc-600">{source}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {hasFt ?
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/15 bg-emerald-950/25 px-3 py-1.5 ring-1 ring-emerald-500/10">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500/75">FT</span>
            <span className="text-[10px] text-emerald-400/80">Gast · Heim</span>
            {hideScores ?
              <span className="tabular-nums text-xl font-bold tracking-tight text-emerald-100/50">••• : •••</span>
            : <span className="tabular-nums text-xl font-bold tracking-tight text-emerald-100">
                {awayScore ?? "–"} <span className="text-emerald-600/80">:</span> {homeScore ?? "–"}
              </span>}
          </div>
        : null}
        <time className="text-[11px] text-zinc-600">{dateLabel}</time>
      </div>

      {!hideScores && topScorers?.length ?
        <details className="mt-3 rounded-lg border border-white/[0.05] bg-black/25 p-2.5 text-xs ring-1 ring-white/[0.03]">
          <summary className="cursor-pointer font-medium text-zinc-400 hover:text-white">Top Scorer</summary>
          <p className="mt-1.5 text-[11px] text-zinc-600">PTS · REB · AST</p>
          <ul className="mt-2 space-y-1.5">
            {topScorers.map((row, idx) => (
              <li key={`${gameId}-${idx}-${row.name}`} className="flex flex-wrap justify-between gap-2 border-t border-white/[0.04] pt-1.5 text-zinc-300 first:border-t-0 first:pt-0">
                <span>
                  {row.name} <span className="text-zinc-600">({row.teamAbbr})</span>
                </span>
                <span className="tabular-nums text-zinc-500">
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
    <article className="group rounded-xl border border-cyan-500/15 bg-gradient-to-b from-cyan-950/40 to-zinc-950/90 p-4 shadow-md shadow-black/25 ring-1 ring-cyan-500/10 transition hover:border-cyan-400/35 hover:shadow-cyan-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <a
          href={titleSearchUrl}
          target="_blank"
          rel="noreferrer"
          title={`Infos · ${dateLabel}`}
          className="text-base font-semibold text-cyan-50 underline decoration-cyan-500/35 underline-offset-2 transition group-hover:decoration-cyan-300/60"
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
            className="rounded-lg border border-red-500/35 bg-red-950/35 px-2 py-1 text-[10px] font-semibold text-red-100"
          >
            {highlightsYoutubeUrl.includes("/search?") || highlightsYoutubeUrl.includes("/search&") ? "YT suchen" : "YouTube"}
          </a>
          <span className="rounded-full border border-cyan-400/25 bg-cyan-950/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-200/95">
            {status}
          </span>
        </div>
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs text-zinc-600">{source}</p>
      <time className="mt-2 block text-[11px] text-zinc-600">{dateLabel}</time>
      {live ?
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-1.5 ring-1 ring-amber-500/10">
          <p className="text-[11px] font-medium uppercase tracking-wide text-amber-500/80">Stand (Gast · Heim)</p>
          <p className="tabular-nums text-lg font-bold text-amber-100">
            {hideScores ?
              "••• : •••"
            : <>
                {awayScore ?? "–"} : {homeScore ?? "–"}{" "}
                <span className="text-xs font-normal text-zinc-600">(live / vorläufig)</span>
              </>}
          </p>
        </div>
      : null}
    </article>
  );
}
