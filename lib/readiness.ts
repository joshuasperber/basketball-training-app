export const READINESS_STORAGE_KEY = "bt.readiness-history.v1";
export const READINESS_UPDATED_EVENT = "bt:readiness-updated";

export type ReadinessEntry = {
  date: string;
  energy: number;
  freshness: number;
  motivation: number;
  updatedAt: string;
};

export type WeeklyFocus = {
  eyebrow: string;
  title: string;
  detail: string;
  href: string;
  action: string;
  tone: "brand" | "calm" | "progress";
};

function validScore(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null;
}
export function normalizeReadinessHistory(value: unknown): Record<string, ReadinessEntry> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, ReadinessEntry> = {};
  for (const [date, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !raw || typeof raw !== "object") continue;
    const item = raw as Partial<ReadinessEntry>;
    const energy = validScore(item.energy);
    const freshness = validScore(item.freshness);
    const motivation = validScore(item.motivation);
    if (energy == null || freshness == null || motivation == null) continue;
    result[date] = {
      date,
      energy,
      freshness,
      motivation,
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : `${date}T12:00:00.000Z`,
    };
  }
  return result;
}

export function loadReadinessHistory() {
  if (typeof window === "undefined") return {};
  try {
    return normalizeReadinessHistory(JSON.parse(window.localStorage.getItem(READINESS_STORAGE_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

export function saveReadinessEntry(entry: ReadinessEntry) {
  if (typeof window === "undefined") return;
  const history = loadReadinessHistory();
  history[entry.date] = entry;
  const recent = Object.fromEntries(Object.entries(history).sort(([left], [right]) => right.localeCompare(left)).slice(0, 120));
  window.localStorage.setItem(READINESS_STORAGE_KEY, JSON.stringify(recent));
  window.dispatchEvent(new Event(READINESS_UPDATED_EVENT));
}

export function readinessAverage(entry: ReadinessEntry | null | undefined) {
  if (!entry) return null;
  return Math.round(((entry.energy + entry.freshness + entry.motivation) / 3) * 10) / 10;
}

export function buildWeeklyFocus(options: {
  readiness?: ReadinessEntry | null;
  nextGame?: { date: string; opponent: string } | null;
  today: string;
  completed: number;
  planned: number;
  hasTodayPlan: boolean;
}): WeeklyFocus {
  const average = readinessAverage(options.readiness);
  if (average != null && average <= 2.5) {
    return {
      eyebrow: "Heute zählt Erholung",
      title: "Belastung bewusst reduzieren",
      detail: "Deine Tagesform ist niedrig. Wähle Mobility, lockeres Shooting oder Regeneration und prüfe morgen erneut.",
      href: "/training",
      action: "Leichte Einheit wählen",
      tone: "calm",
    };
  }

  if (options.nextGame) {
    const dayDelta = Math.round((new Date(`${options.nextGame.date}T12:00:00`).getTime() - new Date(`${options.today}T12:00:00`).getTime()) / 86_400_000);
    if (dayDelta >= 0 && dayDelta <= 2) {
      return {
        eyebrow: dayDelta === 0 ? "Spieltag" : `Spiel in ${dayDelta} Tag${dayDelta === 1 ? "" : "en"}`,
        title: `Fokus: ${options.nextGame.opponent}`,
        detail: "Scouting prüfen, Verfügbarkeit bestätigen und mit frischen Beinen in das Spiel gehen.",
        href: "/liga",
        action: "Game Center öffnen",
        tone: "brand",
      };
    }
  }

  if (options.planned > 0 && options.completed < options.planned) {
    const remaining = options.planned - options.completed;
    return {
      eyebrow: "Wochenfokus",
      title: `${remaining} geplante Einheit${remaining === 1 ? "" : "en"} offen`,
      detail: options.hasTodayPlan ? "Deine nächste sinnvolle Aktion liegt bereits im heutigen Plan." : "Plane die nächste Einheit so, dass sie realistisch in deine Woche passt.",
      href: options.hasTodayPlan ? "/weekly-workout" : "/training",
      action: options.hasTodayPlan ? "Heutigen Plan öffnen" : "Einheit planen",
      tone: "progress",
    };
  }

  return {
    eyebrow: "Wochenfokus",
    title: "Rhythmus halten",
    detail: "Dein Plan ist im Soll. Nutze die nächste Einheit für saubere Qualität statt zusätzliches Volumen.",
    href: "/stats",
    action: "Fortschritt ansehen",
    tone: "progress",
  };
}
