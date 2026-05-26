import { NextResponse } from "next/server";
import type { CoachSession14dItem, CoachWorkoutCatalogItem } from "@/lib/coach-training-context";
import { buildCoachHeuristicResponse } from "@/lib/coach-heuristic";
import { readLlmCache, stableCoachPayloadHash, writeLlmCache } from "@/lib/coach-llm-cache";
import { sanitizeCoachWorkoutByDay } from "@/lib/coach-workout-by-day";
import { buildTeamCoachHeuristic } from "@/lib/team-coach-heuristic";
import { normalizeOpponentStyles } from "@/lib/opponent-styles";
import type { TeamMemberView } from "@/lib/team-types";
import { type DayKey, type DayMode, type WeekConfig, getDefaultWeekConfig } from "@/lib/planner";

export const runtime = "edge";

type CoachContextItem = {
  date: string;
  category: string;
  subcategory: string;
  setCount: number;
  rpe: number | null;
  makes?: number | null;
  attempts?: number | null;
  weightKg?: number | null;
  reps?: number | null;
};

type CoachGameItem = {
  date: string;
  context: "game" | "game_training";
  points: number | null;
  assists: number | null;
  rebounds: number | null;
  steals: number | null;
};

type CoachPayload = {
  position?: string;
  playStyle?: string;
  level?: number;
  mesocyclePhase?: "base" | "build" | "peak" | "deload";
  recentSessions?: CoachContextItem[];
  recentGames?: CoachGameItem[];
  focus?: string;
  /** Anthropometrische / Profil-Daten für individuelleren Plan. */
  profile?: {
    heightCm?: number | null;
    weightKg?: number | null;
    bodyFatPct?: number | null;
    wingspanCm?: number | null;
    standingReachCm?: number | null;
    age?: number | null;
    fullName?: string | null;
  };
  /** Woche-Verfügbarkeit (Mo–So mit Mode + Minuten). */
  weekAvailability?: Record<
    string,
    { mode: string; minutes: number }
  >;
  /** Aktive Ziele aus Training-Goals (z. B. Wurfquote-Ziel). */
  activeGoals?: string[];
  /** Verletzungs-/Schon-Übungen, die nicht progredieren sollen. */
  injuryExerciseNames?: string[];
  /** Workout-Katalog (Kurz) — IDs für `coachWorkoutByDay` im Wochenplan. */
  workoutCatalog?: CoachWorkoutCatalogItem[];
  /** Abgeschlossene Workouts der letzten 14 Tage (lokal aggregiert). */
  recentTraining14d?: CoachSession14dItem[];
  /** Häufigkeit „Kategorie:Unterkategorie“ in den letzten 14 Tagen. */
  subcategoryCounts14d?: Record<string, number>;
  /** `weekly_plan` liefert optional `weekConfig` für die Wochenplanung. */
  intent?: "coaching" | "weekly_plan" | "team_advice";
  /** Team-Kader für Team-Empfehlungen (aggregierte KPIs pro Spieler). */
  teamRoster?: Array<{
    displayName: string;
    position?: string | null;
    playStyle?: string | null;
    formScore?: number;
    formTone?: "green" | "yellow" | "red";
    formReasons?: string[];
    recentGames?: number;
    recentWorkouts?: number;
  }>;
  /** Gegner-Profil für Matchup-Empfehlungen. */
  opponentProfile?: {
    name?: string;
    styles?: string[];
  };
  /** Freitext der Spieler:in („Was beschäftigt mich diese Woche?“) — fließt in die Coach-Kurzdiagnose ein. */
  coachNote?: string;
  /** Einmal erfasste Kennenlern-Antworten (lokal), als Fließtext für den Coach */
  playerIntakeSummary?: string;
  /** Server-Cache überspringen (z. B. manuelles „Coach aktualisieren“). */
  skipCache?: boolean;
};

const DAY_KEYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const DAY_MODES: DayMode[] = [
  "unavailable",
  "rest",
  "recovery",
  "game_day",
  "game_training",
  "basketball_training",
  "gym",
  "custom",
];

function normalizeDayMode(value: unknown): DayMode | null {
  if (typeof value !== "string") return null;
  return DAY_MODES.includes(value as DayMode) ? (value as DayMode) : null;
}

function mergeWeekConfigFromPayload(payload: CoachPayload): WeekConfig {
  const base = getDefaultWeekConfig();
  const avail = payload.weekAvailability;
  if (!avail) return base;
  const next = { ...base };
  DAY_KEYS.forEach((day) => {
    const row = avail[day];
    if (!row || typeof row !== "object") return;
    const mode = normalizeDayMode((row as { mode?: unknown }).mode);
    const minutes = Number((row as { minutes?: unknown }).minutes);
    if (mode) {
      next[day] = {
        mode,
        minutes: Number.isFinite(minutes) && minutes >= 0 ? minutes : next[day].minutes,
      };
    }
  });
  return next;
}

function applyLlmWeekPatch(base: WeekConfig, raw: unknown): WeekConfig {
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const next = { ...base };
  DAY_KEYS.forEach((day) => {
    const row = obj[day];
    if (!row || typeof row !== "object") return;
    const mode = normalizeDayMode((row as { mode?: unknown }).mode);
    const minutes = Number((row as { minutes?: unknown }).minutes);
    if (mode) {
      next[day] = {
        mode,
        minutes: Number.isFinite(minutes) && minutes >= 0 ? Math.min(240, minutes) : base[day].minutes,
      };
    }
  });
  return next;
}

function buildTeamAdviceFromPayload(payload: CoachPayload) {
  const members: TeamMemberView[] = (payload.teamRoster ?? []).map((player, index) => ({
    id: `roster-${index}`,
    userId: `roster-${index}`,
    role: "player",
    displayName: player.displayName,
    position: player.position ?? null,
    playStyle: player.playStyle ?? null,
    shareLevel: "summary",
    form: {
      score: player.formScore ?? 50,
      trend: "stable",
      tone: player.formTone ?? "yellow",
      reasons: player.formReasons ?? [],
    },
    recentGames: player.recentGames ?? 0,
    recentWorkouts: player.recentWorkouts ?? 0,
  }));

  return buildTeamCoachHeuristic({
    members,
    opponentName: payload.opponentProfile?.name,
    opponentStyles: normalizeOpponentStyles(payload.opponentProfile?.styles ?? []),
  });
}

const COACH_PERSONA_CORE =
  "Du bist der feste **Hauptcoach** eines Basketballspieler:in (Amateur bis ambitionierter Verein). Du sprichst durchgehend in der **Du-Form**: nah, respektvoll, ohne Marketing-Floskeln. Du gibst **konkrete** Hinweise (Was? Wie oft? Womit?), keine leeren Motivationssätze.";

const COACH_JSON_ONLY = " Antworte AUSSCHLIESSLICH mit gültigem JSON, ohne Markdown außerhalb des JSON.";

function parseLlmJsonObject(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const stripped = trimmed.replace(/```json\s*|\s*```/g, "").trim();
    try {
      parsed = JSON.parse(stripped);
    } catch {
      return {};
    }
  }
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

async function fetchChatCompletionJson(
  config: NonNullable<ReturnType<typeof resolveLlmConfig>>,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts: { max_tokens: number; temperature: number },
): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      response_format: { type: "json_object" },
      temperature: opts.temperature,
      max_tokens: opts.max_tokens,
    }),
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`${config.providerLabel.toUpperCase()} HTTP ${response.status}${errorBody ? `: ${errorBody.slice(0, 200)}` : ""}`);
  }
  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? "";
}

async function runWeeklyPlanCombined(
  payload: CoachPayload,
  config: NonNullable<ReturnType<typeof resolveLlmConfig>>,
  merged: WeekConfig,
): Promise<{
  headline: string;
  bullets: string[];
  weekConfig: WeekConfig;
  coachWorkoutByDay: Partial<Record<DayKey, string>> | undefined;
}> {
  const profile = payload.profile ?? {};
  const coachNote = (payload.coachNote ?? "").trim().slice(0, 400);
  const intakeSummary = (payload.playerIntakeSummary ?? "").trim().slice(0, 900);
  const availabilityLine = payload.weekAvailability
    ? Object.entries(payload.weekAvailability)
        .map(([day, cfg]) => `${day}=${cfg.mode}(${cfg.minutes}m)`)
        .join(", ")
    : JSON.stringify(merged);
  const training14Json = JSON.stringify(payload.recentTraining14d ?? []).slice(0, 1200);
  const countsJson = JSON.stringify(payload.subcategoryCounts14d ?? {}).slice(0, 400);
  const catalogJson = JSON.stringify(payload.workoutCatalog ?? []).slice(0, 2200);
  const sessionsJson = JSON.stringify(payload.recentSessions ?? []).slice(0, 700);
  const gamesJson = JSON.stringify(payload.recentGames ?? []).slice(0, 350);

  const user = `Erstelle Wochenplan als JSON (Du-Form in bullets).
Pos ${payload.position ?? "?"} | Stil ${payload.playStyle ?? "?"} | L${payload.level ?? "?"} | ${payload.mesocyclePhase ?? "build"}
Körper ${profile.heightCm ?? "?"}cm ${profile.weightKg ?? "?"}kg KFA${profile.bodyFatPct ?? "?"}%
Verfügbarkeit: ${availabilityLine}
Ziele: ${payload.activeGoals?.slice(0, 5).join("; ") || "keine"}
Schon: ${payload.injuryExerciseNames?.slice(0, 6).join(", ") || "keine"}
${coachNote ? `Notiz: ${coachNote}\n` : ""}${intakeSummary ? `Intake: ${intakeSummary}\n` : ""}
Training14d: ${training14Json}
Counts: ${countsJson}
Sessions: ${sessionsJson}
Spiele: ${gamesJson}
Katalog-IDs: ${catalogJson}

JSON: {"headline":string,"bullets":string[4-5],"weekConfig":{7 Tage mode+minutes},"coachWorkoutByDay":{7 Tage id|null}}
Regeln: Verfügbarkeit respektieren; 1 recovery wenn möglich; gym nur Gym-IDs; basketball/game nur Basketball-IDs; variiere Unterkategorien; injury beachten.`;

  const content = await fetchChatCompletionJson(
    config,
    [
      {
        role: "system",
        content: `${COACH_PERSONA_CORE} Ein Aufruf: Kurzdiagnose + Wochenplan als JSON.${COACH_JSON_ONLY}`,
      },
      { role: "user", content: user },
    ],
    { max_tokens: 900, temperature: 0.4 },
  );

  const parsed = parseLlmJsonObject(content);
  const weekConfig = applyLlmWeekPatch(merged, parsed.weekConfig);
  const coachWorkoutByDay = sanitizeCoachWorkoutByDay(parsed.coachWorkoutByDay, weekConfig, payload.workoutCatalog);
  return {
    headline: typeof parsed.headline === "string" && parsed.headline.trim() ? parsed.headline.trim().slice(0, 80) : "Deine Woche",
    bullets:
      Array.isArray(parsed.bullets) && parsed.bullets.length > 0
        ? parsed.bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 6)
        : ["Woche an Verfügbarkeit angepasst.", "Belastung dosieren und Regeneration einplanen."],
    weekConfig,
    coachWorkoutByDay,
  };
}

function resolveLlmConfig() {
  const explicitBase = process.env.OPENAI_BASE_URL?.replace(/\/$/, "");
  const openaiKey = process.env.OPENAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const groqModel = process.env.GROQ_MODEL;
  const explicitModel = process.env.OPENAI_COACH_MODEL;

  if (explicitBase && openaiKey) {
    return {
      baseUrl: explicitBase,
      apiKey: openaiKey,
      model: explicitModel ?? "gpt-4o-mini",
      providerLabel: "custom",
    };
  }
  if (groqKey) {
    return {
      baseUrl: (process.env.GROQ_BASE_URL?.replace(/\/$/, "")) || "https://api.groq.com/openai/v1",
      apiKey: groqKey,
      model: groqModel ?? explicitModel ?? "llama-3.1-8b-instant",
      providerLabel: "groq",
    };
  }
  if (openaiKey) {
    return {
      baseUrl: "https://api.openai.com/v1",
      apiKey: openaiKey,
      model: explicitModel ?? "gpt-4o-mini",
      providerLabel: "openai",
    };
  }
  return null;
}

async function callLlm(
  payload: CoachPayload,
  config: NonNullable<ReturnType<typeof resolveLlmConfig>>,
): Promise<{
  headline: string;
  bullets: string[];
  source: "llm";
  provider: string;
  model: string;
  weekConfig?: WeekConfig;
  coachWorkoutByDay?: Partial<Record<DayKey, string>>;
}> {
  if (payload.intent === "weekly_plan") {
    const merged = mergeWeekConfigFromPayload(payload);
    const plan = await runWeeklyPlanCombined(payload, config, merged);
    return {
      headline: plan.headline,
      bullets: plan.bullets,
      weekConfig: plan.weekConfig,
      coachWorkoutByDay: plan.coachWorkoutByDay,
      source: "llm",
      provider: config.providerLabel,
      model: config.model,
    };
  }

  const sessions = payload.recentSessions ?? [];
  const games = payload.recentGames ?? [];
  const profile = payload.profile ?? {};
  const coachNoteLine = (payload.coachNote ?? "").trim().slice(0, 400);
  const intakeSummaryLine = (payload.playerIntakeSummary ?? "").trim().slice(0, 900);
  const training14Slice = JSON.stringify(payload.recentTraining14d ?? []).slice(0, 900);
  const availabilityLine = payload.weekAvailability
    ? Object.entries(payload.weekAvailability)
        .map(([day, cfg]) => `${day}=${cfg.mode}(${cfg.minutes}m)`)
        .join(", ")
    : "k.A.";

  const userPrompt = `Kurz-Tipps (Du-Form, 4-5 Bullets, konkret).
Pos ${payload.position ?? "?"} | ${payload.playStyle ?? "?"} | L${payload.level ?? "?"} | ${payload.mesocyclePhase ?? "build"}
Verfügbarkeit: ${availabilityLine}
Ziele: ${payload.activeGoals?.slice(0, 4).join("; ") || "keine"}
${coachNoteLine ? `Notiz: ${coachNoteLine}\n` : ""}${intakeSummaryLine ? `Intake: ${intakeSummaryLine}\n` : ""}
Training14d: ${training14Slice}
Sessions: ${JSON.stringify(sessions).slice(0, 700)}
Spiele: ${JSON.stringify(games).slice(0, 350)}
JSON: {"headline":string max 6 Wörter,"bullets":string[]}`;

  const content = await fetchChatCompletionJson(
    config,
    [
      {
        role: "system",
        content: `${COACH_PERSONA_CORE} Kurz-Tipps, kein Wochen-Gantt.${COACH_JSON_ONLY}`,
      },
      { role: "user", content: userPrompt },
    ],
    { max_tokens: 380, temperature: 0.5 },
  );

  const parsedObj = parseLlmJsonObject(content);
  const parsed = { headline: parsedObj.headline as string | undefined, bullets: parsedObj.bullets as unknown };
  return {
    headline: typeof parsed.headline === "string" && parsed.headline.trim() ? parsed.headline.trim().slice(0, 90) : "Coach-Empfehlung",
    bullets:
      Array.isArray(parsed.bullets) && parsed.bullets.length > 0
        ? parsed.bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 8)
        : ["Kein Output erhalten — bitte später erneut versuchen."],
    source: "llm" as const,
    provider: config.providerLabel,
    model: config.model,
  };
}

export async function POST(request: Request) {
  let payload: CoachPayload;
  try {
    payload = (await request.json()) as CoachPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.intent === "team_advice") {
    return NextResponse.json(buildTeamAdviceFromPayload(payload));
  }

  const config = resolveLlmConfig();
  if (!config) {
    if (payload.intent === "weekly_plan") {
      const week = mergeWeekConfigFromPayload(payload);
      return NextResponse.json({
        headline: "Wochenplan (offline)",
        bullets: [
          "Ohne LLM-API-Key: Plan aus deiner Verfügbarkeit übernommen — trage Groq/OpenAI in Vercel ein für einen KI-feinjustierten Plan.",
          "Halte 1–2 Regenerationstage pro Woche, wenn die Belastung hoch ist.",
        ],
        weekConfig: week,
        source: "heuristic" as const,
      });
    }
    return NextResponse.json(buildCoachHeuristicResponse(payload));
  }

  const intentKey = payload.intent ?? "coaching";
  if (config && !payload.skipCache) {
    const cacheKey = stableCoachPayloadHash(intentKey, payload as unknown as Record<string, unknown>);
    const cached = readLlmCache(cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  if (config) {
    try {
      const aiResponse = await callLlm(payload, config);
      if (!payload.skipCache) {
        const cacheKey = stableCoachPayloadHash(intentKey, payload as unknown as Record<string, unknown>);
        writeLlmCache(cacheKey, aiResponse);
      }
      return NextResponse.json(aiResponse);
    } catch (error) {
      if (payload.intent === "weekly_plan") {
        const week = mergeWeekConfigFromPayload(payload);
        return NextResponse.json({
          headline: "Wochenplan (Fallback)",
          bullets: ["KI temporär nicht erreichbar — Plan aus deiner Verfügbarkeit erstellt."],
          weekConfig: week,
          source: "heuristic" as const,
          warning: error instanceof Error ? error.message : "LLM-Fallback aktiv",
        });
      }
      const fallback = buildCoachHeuristicResponse(payload);
      return NextResponse.json({
        ...fallback,
        warning: error instanceof Error ? error.message : "LLM-Fallback aktiv",
      });
    }
  }
}
