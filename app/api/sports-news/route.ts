import { NextRequest, NextResponse } from "next/server";

type SportsType = "basketball" | "football";

type LeagueOption = {
  id: string;
  name: string;
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
};

type BallDontLieGame = {
  id?: number;
  date?: string;
  status?: string;
  home_team_score?: number;
  visitor_team_score?: number;
  home_team?: { full_name?: string };
  visitor_team?: { full_name?: string };
  postseason?: boolean;
  season?: number;
};

type BallDontLieResponse = {
  data?: BallDontLieGame[];
};

const BASKETBALL_LEAGUES: LeagueOption[] = [{ id: "all", name: "NBA" }];

const FOOTBALL_LEAGUES: LeagueOption[] = [
  { id: "all", name: "Alle Ligen" },
  { id: "39", name: "Premier League" },
  { id: "140", name: "La Liga" },
  { id: "78", name: "Bundesliga" },
  { id: "135", name: "Serie A" },
  { id: "61", name: "Ligue 1" },
];

function parseSport(value: string | null): SportsType {
  return value === "football" ? "football" : "basketball";
}

function filterItemsByResult(
  items: SportsNewsItem[],
  resultFilter: "all" | "with_result" | "without_result",
) {
  if (resultFilter === "with_result") {
    return items.filter((item) => item.hasResult);
  }
  if (resultFilter === "without_result") {
    return items.filter((item) => !item.hasResult);
  }
  return items;
}

async function loadBasketballFromBallDontLie(apiKey: string): Promise<SportsNewsItem[]> {
  const endpoint = "https://api.balldontlie.io/v1/games?per_page=100";
  const response = await fetch(endpoint, {
    headers: {
      Authorization: apiKey,
    },
    next: { revalidate: 900 },
  });

  if (!response.ok) {
    throw new Error(`BallDontLie API Fehler: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as BallDontLieResponse;
  const games = Array.isArray(payload.data) ? payload.data : [];

  const mapped = games.map((game) => {
    const home = game.home_team?.full_name ?? "Home";
    const away = game.visitor_team?.full_name ?? "Away";
    const date = game.date ?? new Date().toISOString();
    const homeScore = typeof game.home_team_score === "number" ? game.home_team_score : null;
    const awayScore = typeof game.visitor_team_score === "number" ? game.visitor_team_score : null;
    const hasResult = homeScore !== null && awayScore !== null;
    const status = game.status ?? "Geplant";
    const season = typeof game.season === "number" ? `Season ${game.season}` : "NBA";

    return {
      title: `${home} vs ${away}`,
      source: `${season} • ${game.postseason ? "Playoffs" : "Regular Season"} • ${status}`,
      date,
      leagueId: "all",
      league: "NBA",
      homeScore,
      awayScore,
      hasResult,
      status,
      url: `https://www.google.com/search?q=${encodeURIComponent(`${home} vs ${away} NBA`)}`,
    };
  });

  return mapped
    .sort((left, right) => {
      if (left.hasResult !== right.hasResult) return left.hasResult ? -1 : 1;
      return new Date(right.date).getTime() - new Date(left.date).getTime();
    })
    .slice(0, 20);
}

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.API_SPORTS_KEY;

    if (!apiKey) {
      return NextResponse.json({
        items: [],
        warning: "API_SPORTS_KEY fehlt. Bitte in .env.local setzen, damit Live-Daten geladen werden.",
      });
    }

    const params = request.nextUrl.searchParams;
    const sport = parseSport(params.get("sport"));
    const resultFilter = (params.get("result") ?? "all") as "all" | "with_result" | "without_result";

    if (sport === "football") {
      return NextResponse.json({
        sport,
        leagues: FOOTBALL_LEAGUES,
        items: [],
        warning: "Fußball-News sind aktuell deaktiviert. Basketball-News laufen jetzt über BallDontLie.",
      });
    }

    const basketballItems = await loadBasketballFromBallDontLie(apiKey);
    const items = filterItemsByResult(basketballItems, resultFilter);

    return NextResponse.json({
      sport,
      leagues: BASKETBALL_LEAGUES,
      items,
      warning: items.length === 0 ? "Keine aktuellen NBA-Spiele gefunden." : null,
    });
  } catch (error) {
    return NextResponse.json({
      items: [],
      warning:
        error instanceof Error
          ? `Interner Fehler abgefangen: ${error.message}.`
          : "Unbekannter interner Fehler.",
    });
  }
}
