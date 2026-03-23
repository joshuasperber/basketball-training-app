import { NextResponse } from "next/server";

type ApiSportsNewsItem = {
  title?: string;
  source?: string;
  date?: string;
  url?: string;
  link?: string;
};

type ApiSportsResponse = {
  response?: ApiSportsNewsItem[];
};

const NEWS_ENDPOINTS = [
  "https://v1.nba.api-sports.io/news",
  "https://v1.basketball.api-sports.io/news",
];

export async function GET() {
  const apiKey = process.env.API_SPORTS_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "API_SPORTS_KEY fehlt. Bitte in .env.local setzen, um News von api-sports.io zu laden.",
      },
      { status: 500 },
    );
  }

  for (const endpoint of NEWS_ENDPOINTS) {
    const response = await fetch(endpoint, {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": new URL(endpoint).host,
      },
      next: { revalidate: 900 },
    });

    if (!response.ok) {
      continue;
    }

    const payload = (await response.json()) as ApiSportsResponse;
    const items = (payload.response ?? [])
      .map((item) => ({
        title: item.title ?? "Ohne Titel",
        source: item.source ?? "API-Sports",
        date: item.date ?? new Date().toISOString(),
        url: item.url ?? item.link ?? "https://api-sports.io",
      }))
      .slice(0, 5);

    return NextResponse.json({ items });
  }

  return NextResponse.json(
    {
      error:
        "News-Endpunkt aktuell nicht erreichbar. Prüfe API-Sports Plan oder erlaubte Endpunkte.",
    },
    { status: 502 },
  );
}
