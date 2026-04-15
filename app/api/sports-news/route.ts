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
      url: `https://www.google.com/search?q=${encodeURIComponent(`${home} vs ${away} basketball`)}`,
    };
  });
}

export async function GET() {
  try {
    const apiKey = process.env.API_SPORTS_KEY;

    if (!apiKey) {
      return NextResponse.json({
        items: [],
        warning:
          "API_SPORTS_KEY fehlt. Bitte in .env.local setzen, damit Live-Daten geladen werden.",
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const endpointCandidates = [
      `https://v1.basketball.api-sports.io/games?date=${today}`,
      "https://v1.basketball.api-sports.io/games?next=10",
    ];

    let payloadToUse: BasketballApiPayload | null = null;
    let endpointUsed = "";
    let lastApiErrorMessage = "Unbekannter API-Fehler";

    for (const endpoint of endpointCandidates) {
      const response = await fetch(endpoint, {
        headers: {
          "x-apisports-key": apiKey,
        },
        next: { revalidate: 900 },
      });

      endpointUsed = endpoint;
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        lastApiErrorMessage = "API hat kein JSON geliefert. Prüfe Key/Plan.";
        continue;
      }

      let payload: BasketballApiPayload = {};

      try {
        payload = (await response.json()) as BasketballApiPayload;
      } catch {
        lastApiErrorMessage = "API JSON konnte nicht gelesen werden.";
        continue;
      }

      const payloadErrors = payload.errors ?? {};
      const hasPayloadErrors = Object.keys(payloadErrors).length > 0;

      if (response.ok && !hasPayloadErrors) {
        payloadToUse = payload;
        break;
      }

      lastApiErrorMessage = hasPayloadErrors
        ? Object.entries(payloadErrors)
            .map(([key, value]) => `${key}: ${value}`)
            .join(" | ")
        : `HTTP ${response.status} (${endpointUsed || "unknown endpoint"})`;
    }

    if (!payloadToUse) {
      return NextResponse.json({
        items: [],
        warning: `API-Sports Fehler: ${lastApiErrorMessage}.`,
      });
    }

    const mappedItems = mapGamesToItems(payloadToUse.response ?? []);

    return NextResponse.json({
      items: mappedItems,
      warning:
        mappedItems.length > 0
          ? null
          : "Keine Spiele gefunden.",
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