import {
  LEAGUE_OWN_TEAM_ID,
  createId,
  findDuplicateLeagueGame,
  normalizeLeagueStartTime,
  type LeagueBundle,
  type LeagueGameKind,
  type LeagueScheduleEntry,
} from "@/lib/league";

export type LeagueCsvPreviewRow = {
  line: number;
  date: string;
  startTime: string;
  kind: LeagueGameKind;
  homeTeam: string;
  awayTeam: string;
  venueName?: string;
  venueAddress?: string;
  meetingTime?: string;
  travelMinutes?: number;
};

export type LeagueCsvImportPlan = {
  rows: LeagueCsvPreviewRow[];
  errors: string[];
  delimiter: "," | ";";
};

function parseCsvLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s_-]+/g, "");
}

function dateKey(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return match ? `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}` : "";
}

function gameKind(value: string): LeagueGameKind {
  const normalized = value.trim().toLowerCase();
  return normalized.includes("test") || normalized.includes("training") || normalized === "friendly"
    ? "game_training"
    : "game";
}

function headerIndex(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(header));
}

export function parseLeagueScheduleCsv(text: string): LeagueCsvImportPlan {
  const normalizedText = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  const firstLine = normalizedText.split("\n")[0] ?? "";
  const delimiter: "," | ";" = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const lines = normalizedText.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return { rows: [], errors: ["Die CSV-Datei enthält keine Spielzeilen."], delimiter };
  const headers = parseCsvLine(lines[0]!, delimiter).map(normalizeHeader);
  const indexes = {
    date: headerIndex(headers, ["datum", "date", "spieltag"]),
    time: headerIndex(headers, ["zeit", "uhrzeit", "spielzeit", "time", "tipoff"]),
    kind: headerIndex(headers, ["art", "typ", "type", "kind"]),
    home: headerIndex(headers, ["heim", "heimteam", "home", "hometeam"]),
    away: headerIndex(headers, ["auswarts", "auswartsteam", "gast", "away", "awayteam"]),
    venue: headerIndex(headers, ["spielort", "halle", "venue", "location"]),
    address: headerIndex(headers, ["adresse", "hallenadresse", "address"]),
    meeting: headerIndex(headers, ["treffpunkt", "treffzeit", "meetingtime"]),
    travel: headerIndex(headers, ["anfahrtszeit", "anfahrtsminuten", "travelminutes"]),
  };
  const missing = [indexes.date < 0 ? "Datum" : null, indexes.time < 0 ? "Spielzeit" : null, indexes.home < 0 ? "Heimteam" : null, indexes.away < 0 ? "Auswärtsteam" : null].filter(Boolean);
  if (missing.length > 0) return { rows: [], errors: [`Pflichtspalten fehlen: ${missing.join(", ")}.`], delimiter };

  const rows: LeagueCsvPreviewRow[] = [];
  const errors: string[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const cells = parseCsvLine(lines[index]!, delimiter);
    const line = index + 1;
    const date = dateKey(cells[indexes.date] ?? "");
    const startTime = normalizeLeagueStartTime(cells[indexes.time] ?? "") ?? "";
    const homeTeam = (cells[indexes.home] ?? "").trim();
    const awayTeam = (cells[indexes.away] ?? "").trim();
    if (!date || !startTime || !homeTeam || !awayTeam || homeTeam.toLocaleLowerCase("de-DE") === awayTeam.toLocaleLowerCase("de-DE")) {
      errors.push(`Zeile ${line}: Datum, Zeit oder Teams sind ungültig.`);
      continue;
    }
    const rawTravel = indexes.travel >= 0 ? Number(cells[indexes.travel]) : NaN;
    rows.push({
      line,
      date,
      startTime,
      kind: indexes.kind >= 0 ? gameKind(cells[indexes.kind] ?? "") : "game",
      homeTeam,
      awayTeam,
      venueName: indexes.venue >= 0 ? cells[indexes.venue]?.trim() || undefined : undefined,
      venueAddress: indexes.address >= 0 ? cells[indexes.address]?.trim() || undefined : undefined,
      meetingTime: indexes.meeting >= 0 ? normalizeLeagueStartTime(cells[indexes.meeting]) : undefined,
      travelMinutes: Number.isFinite(rawTravel) && rawTravel >= 0 ? Math.round(rawTravel) : undefined,
    });
  }
  return { rows, errors, delimiter };
}

function teamKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE");
}

export function applyLeagueScheduleCsv(
  bundle: LeagueBundle,
  seasonId: string,
  plan: LeagueCsvImportPlan,
  idFactory: (prefix: string) => string = createId,
) {
  const next: LeagueBundle = {
    ...bundle,
    opponents: bundle.opponents.map((opponent) => ({ ...opponent, seasonIds: [...opponent.seasonIds] })),
    schedule: [...bundle.schedule],
  };
  const teamIds = new Map<string, string>([[teamKey(bundle.ownTeam.name), LEAGUE_OWN_TEAM_ID]]);
  for (const opponent of next.opponents) teamIds.set(teamKey(opponent.name), opponent.id);
  const createdOpponentNames: string[] = [];
  const skippedLines: number[] = [];
  let imported = 0;
  const season = bundle.seasons.find((entry) => entry.id === seasonId);

  const resolveTeam = (name: string) => {
    const key = teamKey(name);
    const existing = teamIds.get(key);
    if (existing) {
      next.opponents = next.opponents.map((opponent) => opponent.id === existing && !opponent.seasonIds.includes(seasonId)
        ? { ...opponent, seasonIds: [...opponent.seasonIds, seasonId] }
        : opponent);
      return existing;
    }
    const id = idFactory("opponent");
    next.opponents.push({ id, seasonIds: [seasonId], name: name.trim().replace(/\s+/g, " "), strengths: "", weaknesses: "", defenseNotes: "", opponentStyles: [], bestPlayerIds: [] });
    teamIds.set(key, id);
    createdOpponentNames.push(name.trim());
    return id;
  };

  for (const row of plan.rows) {
    if ((season?.startDate && row.date < season.startDate) || (season?.endDate && row.date > season.endDate)) {
      skippedLines.push(row.line);
      continue;
    }
    const homeTeamId = resolveTeam(row.homeTeam);
    const awayTeamId = resolveTeam(row.awayTeam);
    const entry: LeagueScheduleEntry = {
      id: idFactory("game"),
      seasonId,
      date: row.date,
      startTime: row.startTime,
      kind: row.kind,
      status: "scheduled",
      homeTeamId,
      awayTeamId,
      opponentId: homeTeamId === LEAGUE_OWN_TEAM_ID ? awayTeamId : awayTeamId === LEAGUE_OWN_TEAM_ID ? homeTeamId : undefined,
      venueName: row.venueName,
      venueAddress: row.venueAddress,
      meetingTime: row.meetingTime,
      travelMinutes: row.travelMinutes ?? null,
      homeScore: null,
      awayScore: null,
      playerStats: [],
      attendance: [],
    };
    if (findDuplicateLeagueGame(next.schedule, entry)) {
      skippedLines.push(row.line);
      continue;
    }
    next.schedule.push(entry);
    imported += 1;
  }
  return { bundle: next, imported, skippedLines, createdOpponentNames };
}

export const LEAGUE_CSV_TEMPLATE = [
  "Datum;Spielzeit;Art;Heimteam;Auswärtsteam;Spielort;Adresse;Treffpunkt;Anfahrtszeit",
  "10.10.2026;18:00;Ligaspiel;Mein Team;City Falcons;Sporthalle Mitte;Musterstraße 1;16:45;35",
].join("\n");

const CSV_EXPORT_HEADER = "Datum;Spielzeit;Art;Heimteam;Auswärtsteam;Spielort;Adresse;Treffpunkt;Anfahrtszeit;Ergebnis";

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  return /[";\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function germanDate(dateKeyValue: string) {
  const [year, month, day] = dateKeyValue.split("-");
  return year && month && day ? `${day}.${month}.${year}` : dateKeyValue;
}

/** Same column layout as the import template, so an export can be re-imported. */
export function buildLeagueScheduleCsv(
  entries: LeagueScheduleEntry[],
  resolveTeamName: (teamId: string | undefined) => string,
): string {
  const rows = [...entries]
    .sort((left, right) => `${left.date}${left.startTime ?? ""}`.localeCompare(`${right.date}${right.startTime ?? ""}`))
    .map((entry) => [
      germanDate(entry.date),
      entry.startTime ?? "",
      entry.kind === "game_training" ? "Testspiel" : "Ligaspiel",
      resolveTeamName(entry.homeTeamId),
      resolveTeamName(entry.awayTeamId),
      entry.venueName ?? "",
      entry.venueAddress ?? "",
      entry.meetingTime ?? "",
      entry.travelMinutes ?? "",
      entry.homeScore != null && entry.awayScore != null ? `${entry.homeScore}:${entry.awayScore}` : "",
    ].map(csvCell).join(";"));
  return [CSV_EXPORT_HEADER, ...rows].join("\n");
}
