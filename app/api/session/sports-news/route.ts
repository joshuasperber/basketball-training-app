import { NextResponse } from "next/server";

type BasketballApiGame = {
  date?: string;
  country?: { name?: string };
  league?: { name?: string };
  teams?: {
    home?: { name?: string };
    away?: { name?: string };
  };
  status?: {
    long?: string;
  };
};

type BasketballApiPayload = {
  errors?: Record<string, string>;
  response?: BasketballApiGame[];
};

type NewsItem = {
  title: string;
  source: string;
  date: string;
  url: string;
};

const FALLBACK_ITEMS: NewsItem[] = [
  {
    title: "Demo: Lakers vs Warriors",
    source: "Fallback • API-Key prüfen",
    date: new Date().toISOString(),
    url: "https://www.api-sports.io/",
  },
  {
    title: "Demo: Celtics vs Bucks",
    source: "Fallback • API-Key prüfen",
    date: new Date().toISOString(),
    url: "https://www.api-sports.io/",
  },
];

function mapGamesToItems(games: BasketballApiGame[]): NewsItem[] {
  return games.slice(0, 10).map((game) => {
    const home = game.teams?.home?.name ?? "Home";
    const away = game.teams?.away?.name ?? "Away";
    const leagueName = game.league?.name ?? "Basketball";
    const country = game.country?.name ?? "International";
    const status = game.status?.long ?? "Geplant";

    return {
      title: `${home} vs ${away}`,
      source: `${leagueName} • ${country} • ${status}`,
      date: game.date ?? new Date().toISOString(),
      url: "https://www.api-sports.io/",
    };
  });
}

export async function GET() {
  try {
    const apiKey = process.env.API_SPORTS_KEY;

    if (!apiKey) {
      return NextResponse.json({
        items: FALLBACK_ITEMS,
        warning:
          "API_SPORTS_KEY fehlt. Es werden Demo-News angezeigt. Füge API_SPORTS_KEY in .env.local ein.",
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const endpoint = `https://v1.basketball.api-sports.io/games?date=${today}`;

    const response = await fetch(endpoint, {
      headers: {
        "x-apisports-key": apiKey,
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": "v1.basketball.api-sports.io",
      },
      next: { revalidate: 900 },
    });

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      return NextResponse.json({
        items: FALLBACK_ITEMS,
        warning:
          "API hat kein JSON geliefert. Prüfe Key/Plan. Es werden Demo-News angezeigt.",
      });
    }

    let payload: BasketballApiPayload = {};

    try {
      payload = (await response.json()) as BasketballApiPayload;
    } catch {
      return NextResponse.json({
        items: FALLBACK_ITEMS,
        warning:
          "API JSON konnte nicht gelesen werden. Es werden Demo-News angezeigt.",
      });
    }

    if (!response.ok || payload.errors) {
      const apiErrorMessage = payload.errors
        ? Object.entries(payload.errors)
            .map(([key, value]) => `${key}: ${value}`)
            .join(" | ")
        : `HTTP ${response.status}`;

      return NextResponse.json({
        items: FALLBACK_ITEMS,
        warning: `API-Sports Fehler: ${apiErrorMessage}. Es werden Demo-News angezeigt.`,
      });
    }

    const mappedItems = mapGamesToItems(payload.response ?? []);

    return NextResponse.json({
      items: mappedItems.length > 0 ? mappedItems : FALLBACK_ITEMS,
      warning:
        mappedItems.length > 0
          ? null
          : "Keine Spiele gefunden. Daher werden Demo-News angezeigt.",
    });
  } catch (error) {
    return NextResponse.json({
      items: FALLBACK_ITEMS,
      warning:
        error instanceof Error
          ? `Interner Fehler abgefangen: ${error.message}. Es werden Demo-News angezeigt.`
          : "Unbekannter interner Fehler. Es werden Demo-News angezeigt.",
    });
  }
}