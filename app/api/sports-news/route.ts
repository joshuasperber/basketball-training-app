import { NextRequest, NextResponse } from "next/server";

type SportsType = "basketball" | "football";

type LeagueOption = {
  id: string;
  name: string;
};

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
  leagueId: string;
  league: string;
  homeScore: number | null;
  awayScore: number | null;
  hasResult: boolean;
  status: string;
  url: string;
  gameId: number | null;
  /** Nur NBA-Daten (Ball Dont Lie). Keine Viertel-Zeilen in Free-Tier — siehe statsLink */
  topScorers?: SportsNewsTopScorer[];
  /** Direkt nba.com/box-score wenn eine NBA-Game-ID mitgeliefert wird, sonst nba.com/games?date=… */
  statsLink: string;
  /** Kanal-Suche @TheGametimeHighlights für genau dieses Matchup (Fallback für Highlights-Link). */
  youtubeHighlightsSearchUrl: string;
};

type BallDontLieGame = {
  id?: number;
  date?: string;
  datetime?: string;
  status?: string;
  home_team_score?: number;
  visitor_team_score?: number;
  home_team?: { full_name?: string; abbreviation?: string };
  visitor_team?: { full_name?: string; abbreviation?: string };
  postseason?: boolean;
  season?: number;
};

type BallDontLieResponse = {
  data?: BallDontLieGame[];
  meta?: { next_cursor?: number | null };
};

type BallDontLieStatRow = {
  pts?: number;
  reb?: number;
  ast?: number;
  game?: { id?: number };
  player?: { first_name?: string; last_name?: string };
  team?: { abbreviation?: string; full_name?: string };
};

/** NBA-Saison-Jahr (Saison startet im Oktober). */
function currentNbaSeasonYear(reference = new Date()): number {
  const y = reference.getFullYear();
  const m = reference.getMonth();
  return m >= 9 ? y : y - 1;
}

function addDaysISO(base: Date, days: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** TT.MM.JJJJ für Suchanfragen (zusätzlich zu ISO-Datum). */
function germanCalendarDateFromIsoDay(isoDay: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDay.trim());
  if (!m) return isoDay;
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y}`;
}

function coerceScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isFinalStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s.includes("final") || /^ft$/i.test(s.trim());
}

/** Live oder noch ohne echtes Ergebnis — Scheduled mit 0:0 nicht als „fertig“ zählen. */
function inferHasResult(status: string, homeScore: number | null, awayScore: number | null): boolean {
  if (isFinalStatus(status)) return true;
  const placeholderZeros =
    homeScore === 0 &&
    awayScore === 0 &&
    !isFinalStatus(status) &&
    /\b(scheduled|pre\s?season|pregame|not\s?started)\b/i.test(status);
  if (placeholderZeros) return false;
  if (homeScore !== null && awayScore !== null) {
    if (homeScore > 0 || awayScore > 0) return true;
    if (homeScore === 0 && awayScore === 0 && !/\bqtr\b|\bquarter\b|\bot\b|\bhalf\b/i.test(status)) {
      return false;
    }
    return true;
  }
  return false;
}

/** NBA.com nutzt meist 3-Buchstaben-Codes (Kleinbuchstaben im Pfad). */
function nbaTricodeSlug(abbr: string | undefined): string {
  const raw = (abbr ?? "nba").trim().toUpperCase();
  if (raw.length <= 1) return "nba";
  return raw.toLowerCase().slice(0, 6);
}

/** Falls die API später eine offizielle NBA-Game-ID (10 Ziffern) liefert — dann echter /box-score-Link. */
function tryOfficialNbaGameIdSegment(game: BallDontLieGame): string | null {
  const extra = game as Record<string, unknown>;
  for (const key of ["nba_game_id", "official_nba_game_id", "nba_stats_game_id", "reference"]) {
    const v = extra[key];
    if (typeof v === "string") {
      const t = v.trim();
      if (/^\d{10}$/.test(t)) return t;
      const digits = t.replace(/\D/g, "");
      if (digits.length === 10) return digits;
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      const s = String(Math.trunc(v));
      if (s.length === 10) return s;
    }
  }
  return null;
}

function buildNbaBoxScoreUrl(game: BallDontLieGame, dateDay: string): string {
  const va = nbaTricodeSlug(game.visitor_team?.abbreviation);
  const ha = nbaTricodeSlug(game.home_team?.abbreviation);
  const gid = tryOfficialNbaGameIdSegment(game);
  if (gid) {
    return `https://www.nba.com/game/${va}-vs-${ha}-${gid}/box-score`;
  }
  return `https://www.nba.com/games?date=${encodeURIComponent(dateDay)}`;
}

function buildYoutubeTheGameTimeHighlightsSearchUrl(awayFull: string, homeFull: string, dateDay: string): string {
  const q = `${awayFull} ${homeFull} NBA Highlights ${dateDay}`;
  return `https://www.youtube.com/@TheGametimeHighlights/search?query=${encodeURIComponent(q)}`;
}

function mapGameToItem(game: BallDontLieGame): SportsNewsItem {
  const home = game.home_team?.full_name ?? "Home";
  const away = game.visitor_team?.full_name ?? "Away";
  const date = game.datetime ?? game.date ?? new Date().toISOString();
  const homeScore = coerceScore(game.home_team_score);
  const awayScore = coerceScore(game.visitor_team_score);
  const status = game.status ?? "Geplant";
  const hasResult = inferHasResult(status, homeScore, awayScore);
  const season = typeof game.season === "number" ? `Saison ${game.season}` : "NBA";
  const gid = typeof game.id === "number" ? game.id : null;
  const dateDay = (game.date ?? date).slice(0, 10);
  const dateDe = germanCalendarDateFromIsoDay(dateDay);
  const dateForSearch = `${dateDe} (${dateDay})`;
  const statsLink = buildNbaBoxScoreUrl(game, dateDay);
  const youtubeHighlightsSearchUrl = buildYoutubeTheGameTimeHighlightsSearchUrl(away, home, dateDay);

  return {
    title: `${away} @ ${home}`,
    source: `${season} • ${game.postseason ? "Playoffs" : "RS"} • ${status}`,
    date,
    leagueId: "nba",
    league: "NBA",
    homeScore,
    awayScore,
    hasResult,
    status,
    url: `https://www.google.com/search?q=${encodeURIComponent(`${away} @ ${home} NBA Highlights Spiel ${dateForSearch}`)}`,
    gameId: gid,
    statsLink,
    youtubeHighlightsSearchUrl,
  };
}

/** Genug Seiten für ~8–10 Abende à bis zu ~100 Spiele im Fenster (Back-to-backs + komplette Liga). */
const MAX_GAME_PAGES = 12;

async function fetchGamesPage(apiKey: string, query: string): Promise<{ games: BallDontLieGame[]; nextCursor: number | null }> {
  const headers = { Authorization: apiKey };
  const res = await fetch(`https://api.balldontlie.io/v1/games${query}`, {
    headers,
    next: { revalidate: 900 },
  });
  if (res.status === 429 || !res.ok) {
    return { games: [], nextCursor: null };
  }
  const payload = (await res.json()) as BallDontLieResponse;
  const games = Array.isArray(payload.data) ? payload.data : [];
  const nc = payload.meta?.next_cursor;
  const nextCursor = typeof nc === "number" && nc > 0 ? nc : null;
  return { games, nextCursor };
}

/** Alle Spiele im Bereich inkl. nachfolgender Seiten (Playoffs + Regular Season — kein postseason-Filter). */
async function fetchGamesDateRangeAllPages(apiKey: string, startISO: string, endISO: string): Promise<BallDontLieGame[]> {
  const baseQs = `?start_date=${encodeURIComponent(startISO)}&end_date=${encodeURIComponent(endISO)}&per_page=100`;
  const collected: BallDontLieGame[] = [];
  let cursor: number | null = null;

  for (let page = 0; page < MAX_GAME_PAGES; page++) {
    const qs = cursor == null ? baseQs : `${baseQs}&cursor=${cursor}`;
    const { games, nextCursor } = await fetchGamesPage(apiKey, qs);
    collected.push(...games);
    if (!nextCursor || games.length === 0) break;
    cursor = nextCursor;
  }

  return collected;
}

function uniqGamesById(games: BallDontLieGame[]): BallDontLieGame[] {
  const seen = new Set<number>();
  const out: BallDontLieGame[] = [];
  for (const g of games) {
    const id = g.id;
    if (typeof id !== "number" || seen.has(id)) continue;
    seen.add(id);
    out.push(g);
  }
  return out;
}

async function fetchGamesSeasonAllPages(apiKey: string, seasonYear: number): Promise<BallDontLieGame[]> {
  const baseQs = `?seasons[]=${seasonYear}&per_page=100`;
  const collected: BallDontLieGame[] = [];
  let cursor: number | null = null;

  for (let page = 0; page < MAX_GAME_PAGES; page++) {
    const qs = cursor == null ? baseQs : `${baseQs}&cursor=${cursor}`;
    const { games, nextCursor } = await fetchGamesPage(apiKey, qs);
    collected.push(...games);
    if (!nextCursor || games.length === 0) break;
    cursor = nextCursor;
  }

  return collected;
}

async function fetchGamesMerged(apiKey: string): Promise<BallDontLieGame[]> {
  const headers = { Authorization: apiKey };
  const season = currentNbaSeasonYear();
  const today = new Date();

  const wideStart = addDaysISO(today, -21);
  const wideEnd = addDaysISO(today, 35);

  let merged = await fetchGamesDateRangeAllPages(apiKey, wideStart, wideEnd);

  if (merged.length === 0) {
    const broaderStart = addDaysISO(today, -120);
    const broaderEnd = addDaysISO(today, 60);
    merged = await fetchGamesDateRangeAllPages(apiKey, broaderStart, broaderEnd);
  }

  if (merged.length === 0) {
    merged = await fetchGamesSeasonAllPages(apiKey, season);
  }
  if (merged.length === 0) {
    merged = await fetchGamesSeasonAllPages(apiKey, season - 1);
  }

  if (merged.length === 0) {
    for (let offset = -14; offset <= 14; offset++) {
      const qs = `?dates[]=${addDaysISO(today, offset)}&per_page=100`;
      const { games } = await fetchGamesPage(apiKey, qs);
      if (games.length > 0) {
        merged = games;
        break;
      }
    }
  }

  merged = uniqGamesById(merged);

  if (merged.length === 0) {
    const probe = await fetch(`https://api.balldontlie.io/v1/games?per_page=1`, {
      headers,
      next: { revalidate: 900 },
    });
    if (probe.status === 429) {
      throw new Error("Ball Dont Lie: Rate-Limit (429). Bitte später erneut laden.");
    }
    throw new Error("Ball Dont Lie: keine Daten. Key oder Parameter prüfen.");
  }

  return merged;
}

/** Nach Spielzeit sortieren (robust gegen UTC-/Kalenderstrings der API). */
function gameTimeMs(dateIso: string): number {
  const raw = dateIso.includes("T") ? dateIso : `${dateIso.slice(0, 10)}T12:00:00.000Z`;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

function filterByApproxWindow(items: SportsNewsItem[]): SportsNewsItem[] {
  const now = Date.now();
  const pastMs = 400 * 24 * 60 * 60 * 1000;
  const futureMs = 120 * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const t = gameTimeMs(item.date);
    return t === 0 || (t >= now - pastMs && t <= now + futureMs);
  });
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function enrichTopScorers(apiKey: string, items: SportsNewsItem[]): Promise<void> {
  const ids = items.map((i) => i.gameId).filter((id): id is number => typeof id === "number");
  if (!ids.length) return;

  const headers = { Authorization: apiKey };
  const byGame = new Map<number, BallDontLieStatRow[]>();

  for (const group of chunk(ids, 5)) {
    const qs = group.map((id) => `game_ids[]=${id}`).join("&");
    const res = await fetch(`https://api.balldontlie.io/v1/stats?${qs}&per_page=100`, {
      headers,
      next: { revalidate: 900 },
    });
    if (!res.ok || res.status === 429) {
      break;
    }
    const payload = (await res.json()) as { data?: BallDontLieStatRow[] };
    const rows = payload.data ?? [];
    rows.forEach((row) => {
      const gid = row.game?.id;
      if (gid == null) return;
      const list = byGame.get(gid) ?? [];
      list.push(row);
      byGame.set(gid, list);
    });
  }

  items.forEach((item) => {
    const gid = item.gameId;
    if (gid == null) return;
    const rows = byGame.get(gid) ?? [];
    const mapped = rows
      .map((row) => ({
        name: [row.player?.first_name, row.player?.last_name].filter(Boolean).join(" ").trim() || "Spieler",
        pts: row.pts ?? 0,
        reb: row.reb ?? 0,
        ast: row.ast ?? 0,
        teamAbbr: row.team?.abbreviation ?? row.team?.full_name?.slice(0, 3).toUpperCase() ?? "",
      }))
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 6);
    if (mapped.length > 0) {
      item.topScorers = mapped;
    }
  });
}

/** Nur Ball Dont Lie NBA — keine weiteren Ligen im Feed. */
export const revalidate = 900;

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.API_SPORTS_KEY;

    if (!apiKey) {
      return NextResponse.json({
        items: [],
        upcomingItems: [],
        leagues: [] as LeagueOption[],
        warning: "API_SPORTS_KEY fehlt. Bitte in .env.local setzen (Ball Dont Lie API-Key).",
      });
    }

    const sport = (request.nextUrl.searchParams.get("sport") === "football" ? "football" : "basketball") as SportsType;

    if (sport === "football") {
      return NextResponse.json({
        sport,
        items: [],
        upcomingItems: [],
        leagues: [],
        warning: "Fußball ist hier nicht angebunden — nur NBA über Ball Dont Lie.",
      });
    }

    const games = await fetchGamesMerged(apiKey);
    const mapped = games.map(mapGameToItem);

    let pool = filterByApproxWindow(mapped);
    if (pool.length === 0) {
      pool = [...mapped];
    }

    const upcoming = pool
      .filter((item) => !item.hasResult)
      .sort((a, b) => gameTimeMs(a.date) - gameTimeMs(b.date))
      .slice(0, 55);

    const completed = pool
      .filter((item) => item.hasResult)
      .sort((a, b) => gameTimeMs(b.date) - gameTimeMs(a.date))
      .slice(0, 65);

    await enrichTopScorers(apiKey, completed.slice(0, 12));

    /** Kommende zuerst (Zeitleiste), dann Ergebnisse — wie früher eine zusammenhängende Übersicht. */
    const unifiedFeed = [...upcoming, ...completed];

    const quietOffseason = completed.length === 0 && upcoming.length === 0 && mapped.length > 0;

    return NextResponse.json({
      sport,
      leagues: [] as LeagueOption[],
      items: unifiedFeed,
      upcomingItems: upcoming,
      warning:
        completed.length === 0 && upcoming.length === 0
          ? quietOffseason
            ? "Die API liefert Spiele, aber keine passen zur Ansicht (Datum/Ergebnis). Bitte später erneut laden oder Saison prüfen."
            : "Keine Spiele von der API erhalten."
          : null,
    });
  } catch (error) {
    return NextResponse.json({
      sport: "basketball" as const,
      items: [],
      upcomingItems: [],
      leagues: [] as LeagueOption[],
      warning:
        error instanceof Error
          ? error.message
          : "Sport-News konnten nicht geladen werden.",
    });
  }
}
