import type { LeagueBundle } from "@/lib/league";

export type LeagueChangeEntry = {
  id: string;
  at: string;
  userId: string;
  userLabel: string;
  summary: string;
};

export type SharedLeagueConflict = {
  localBundle: LeagueBundle;
  remoteBundle: LeagueBundle | null;
  remoteVersion: number;
  remoteUpdatedAt: string | null;
  history: LeagueChangeEntry[];
};

function changedIds<T extends { id: string }>(left: T[], right: T[]) {
  const leftById = new Map(left.map((entry) => [entry.id, JSON.stringify(entry)]));
  const rightById = new Map(right.map((entry) => [entry.id, JSON.stringify(entry)]));
  const ids = new Set([...leftById.keys(), ...rightById.keys()]);
  return [...ids].filter((id) => leftById.get(id) !== rightById.get(id));
}

export function summarizeLeagueChange(previous: LeagueBundle, next: LeagueBundle) {
  if (next.schedule.length > previous.schedule.length) return "Spiel zum Saisonplan hinzugefügt";
  if (next.schedule.length < previous.schedule.length) return "Spiel aus dem Saisonplan entfernt";
  if (changedIds(previous.schedule, next.schedule).length > 0) return "Spiel, Teilnahme oder Boxscore aktualisiert";
  if (next.players.length > previous.players.length) return "Spieler zum Kader hinzugefügt";
  if (next.players.length < previous.players.length) return "Spieler aus dem Kader entfernt";
  if (changedIds(previous.players, next.players).length > 0) return "Spielerprofil aktualisiert";
  if (next.opponents.length > previous.opponents.length) return "Gegner hinzugefügt";
  if (next.opponents.length < previous.opponents.length) return "Gegner entfernt";
  if (changedIds(previous.opponents, next.opponents).length > 0) return "Gegner oder Saisonzuordnung aktualisiert";
  if (next.seasons.length > previous.seasons.length) return "Saison angelegt";
  if (changedIds(previous.seasons, next.seasons).length > 0) return "Saison aktualisiert";
  if (next.leagues.length > previous.leagues.length) return "Liga angelegt";
  if (changedIds(previous.leagues, next.leagues).length > 0) return "Liga aktualisiert";
  if (JSON.stringify(previous.ownTeam) !== JSON.stringify(next.ownTeam)) return "Eigenes Team aktualisiert";
  return "Ligadaten aktualisiert";
}

export function normalizeLeagueHistory(value: unknown): LeagueChangeEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Partial<LeagueChangeEntry>;
    if (typeof raw.id !== "string" || typeof raw.at !== "string" || typeof raw.summary !== "string") return [];
    return [{
      id: raw.id,
      at: raw.at,
      userId: typeof raw.userId === "string" ? raw.userId : "",
      userLabel: typeof raw.userLabel === "string" ? raw.userLabel : "Teammitglied",
      summary: raw.summary,
    }];
  }).slice(-30);
}

export function formatLeagueHistoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Zeitpunkt unbekannt";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(date);
}
