import { NextRequest, NextResponse } from "next/server";

type SportsType = "basketball" | "football";

type SupportedLeague = {
  id: string;
  name: string;
};

type SportConfig = {
  endpointBase: string;
  searchQuery: (home: string, away: string) => string;
  fallbackLeagueName: string;
  leagues: SupportedLeague[];
};

type SportsNewsItem = {
  title: string;
  source: string;
  date: string;
  leagueId: string;
  league: string;
  url: string;
};

type SportsNewsApiPayload = {
  errors?: Record<string, string>;
  response?: Record<string, unknown>[];
};

const SPORT_CONFIG: Record<SportsType, SportConfig> = {
  basketball: {
    endpointBase: "https://v1.basketball.api-sports.io/games",
    fallbackLeagueName: "Basketball",
    searchQuery: (home, away) => `${home} vs ${away} basketball`,
    leagues: [
      { id: "12", name: "NBA" },
      { id: "11", name: "NCAA" },
      { id: "120", name: "EuroLeague" },
    ],
  },
  football: {
    endpointBase: "https://v3.football.api-sports.io/fixtures",
    fallbackLeagueName: "Football",
    searchQuery: (home, away) => `${home} vs ${away} football`,
    leagues: [
      { id: "39", name: "Premier League" },
      { id: "140", name: "La Liga" },
      { id: "78", name: "Bundesliga" },
      { id: "135", name: "Serie A" },
      { id: "61", name: "Ligue 1" },
    ],
  },
};

function getSafeString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function mapFixturesToItems(
  fixtures: Record<string, unknown>[],
  sport: SportsType,
): SportsNewsItem[] {
  const config = SPORT_CONFIG[sport];

  return fixtures.slice(0, 15).map((fixture) => {
    const teams = (fixture.teams as Record<string, unknown> | undefined) ?? {};
    const homeTeam = (teams.home as Record<string, unknown> | undefined) ?? {};
    const awayTeam = (teams.away as Record<string, unknown> | undefined) ?? {};

    const leagueObj = (fixture.league as Record<string, unknown> | undefined) ?? {};
    const countryObj = (leagueObj.country as Record<string, unknown> | undefined) ?? {};
    const statusObj =
      (fixture.status as Record<string, unknown> | undefined) ??
      ((fixture.fixture as Record<string, unknown> | undefined)?.status as Record<string, unknown> | undefined) ??
      {};

    const home = getSafeString(homeTeam.name, "Home");
    const away = getSafeString(awayTeam.name, "Away");
    const league = getSafeString(leagueObj.name, config.fallbackLeagueName);
    const country = getSafeString(countryObj.name, "International");
    const status = getSafeString(statusObj.long, "Geplant");
    const date = getSafeString(
      (fixture.fixture as Record<string, unknown> | undefined)?.date ?? fixture.date,
      new Date().toISOString(),
    );
    const leagueId = String(leagueObj.id ?? "all");

    return {
      title: `${home} vs ${away}`,
      source: `${league} • ${country} • ${status}`,
      date,
      leagueId,
      league,
      url: `https://www.google.com/search?q=${encodeURIComponent(config.searchQuery(home, away))}`,
    };
  });
}

function parseSport(value: string | null): SportsType {
  return value === "football" ? "football" : "basketball";
}

function buildEndpoints(sport: SportsType, leagueId: string | null) {
  const config = SPORT_CONFIG[sport];
  const now = new Date();
  const leagueParam = leagueId && leagueId !== "all" ? `&league=${leagueId}` : "";
  const formatDate = (date: Date) => date.toISOString().slice(0, 10);
  const today = formatDate(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const tomorrowDate = new Date(now);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const yesterday = formatDate(yesterdayDate);
  const tomorrow = formatDate(tomorrowDate);

  if (sport === "football") {
    // API-Sports Free Plan erlaubt aktuell nur bestimmte Saisons (z. B. 2022–2024).
    // Deshalb fixen wir die Season auf den höchsten frei verfügbaren Wert.
    const freePlanSeason = "2024";
    return [
      `${config.endpointBase}?date=${today}${leagueParam}&season=${freePlanSeason}`,
      `${config.endpointBase}?date=${yesterday}${leagueParam}&season=${freePlanSeason}`,
      `${config.endpointBase}?date=${tomorrow}${leagueParam}&season=${freePlanSeason}`,
    ];
  }

  if (leagueId && leagueId !== "all") {
    // Für Free-Pläne liefern date-basierte Requests oft 0 Einträge.
    // Mit `last` + fixer Saison zeigen wir die letzten verfügbaren Liga-Spiele (z. B. NBA).
    const freePlanSeason = "2024";
    return [
      `${config.endpointBase}?league=${leagueId}&season=${freePlanSeason}&last=20`,
      `${config.endpointBase}?league=${leagueId}&season=${freePlanSeason}&date=${today}`,
      `${config.endpointBase}?league=${leagueId}&season=${freePlanSeason}&date=${yesterday}`,
    ];
  }

  return [
    `${config.endpointBase}?date=${today}${leagueParam}`,
    `${config.endpointBase}?date=${yesterday}${leagueParam}`,
    `${config.endpointBase}?date=${tomorrow}${leagueParam}`,
  ];
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
    const league = params.get("league");

    const endpointCandidates = buildEndpoints(sport, league);
    let payloadToUse: SportsNewsApiPayload | null = null;
    let lastApiErrorMessage = "Unbekannter API-Fehler";

    for (const endpoint of endpointCandidates) {
      const response = await fetch(endpoint, {
        headers: {
          "x-apisports-key": apiKey,
        },
        next: { revalidate: 900 },
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        lastApiErrorMessage = "API hat kein JSON geliefert. Prüfe Key/Plan.";
        continue;
      }

      let payload: SportsNewsApiPayload = {};
      try {
        payload = (await response.json()) as SportsNewsApiPayload;
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
        : `HTTP ${response.status}`;
    }

    if (!payloadToUse) {
      return NextResponse.json({
        items: [],
        warning: `API-Sports Fehler: ${lastApiErrorMessage}.`,
      });
    }

    const items = mapFixturesToItems(payloadToUse.response ?? [], sport);
    const leagues = [
      { id: "all", name: "Alle Ligen" },
      ...SPORT_CONFIG[sport].leagues,
    ];

    const freePlanInfoWarning =
      sport === "football"
        ? "Free-Plan Hinweis: Fußball-Daten werden über Season 2024 geladen."
        : league && league !== "all"
          ? "Free-Plan Hinweis: Liga-Ansicht nutzt Season 2024 mit den letzten verfügbaren Spielen."
          : null;

    return NextResponse.json({
      sport,
      leagues,
      items,
      warning:
        items.length > 0
          ? freePlanInfoWarning
          : freePlanInfoWarning
            ? `${freePlanInfoWarning} Keine Spiele gefunden.`
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