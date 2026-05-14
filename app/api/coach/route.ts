import { NextResponse } from "next/server";
import type { CoachSession14dItem, CoachWorkoutCatalogItem } from "@/lib/coach-training-context";
import { sanitizeCoachWorkoutByDay } from "@/lib/coach-workout-by-day";
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
  intent?: "coaching" | "weekly_plan";
  /** Freitext der Spieler:in („Was beschäftigt mich diese Woche?“) — fließt in die Coach-Kurzdiagnose ein. */
  coachNote?: string;
  /** Einmal erfasste Kennenlern-Antworten (lokal), als Fließtext für den Coach */
  playerIntakeSummary?: string;
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

function buildHeuristicResponse(payload: CoachPayload) {
  const sessions = payload.recentSessions ?? [];
  const games = payload.recentGames ?? [];
  const observations: string[] = [];

  const basketballSessions = sessions.filter((s) => s.category === "Basketball");
  const gymSessions = sessions.filter((s) => s.category === "Gym");
  const avgRpe = (() => {
    const rpes = sessions.map((s) => s.rpe).filter((value): value is number => Number.isFinite(value));
    if (rpes.length === 0) return null;
    return Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10;
  })();

  const shootingSessions = basketballSessions.filter((s) =>
    s.subcategory?.toLowerCase().includes("shooting") || s.subcategory?.toLowerCase().includes("finishing"),
  );
  const makes = shootingSessions.reduce((sum, s) => sum + (s.makes ?? 0), 0);
  const attempts = shootingSessions.reduce((sum, s) => sum + (s.attempts ?? 0), 0);
  const shotPct = attempts > 0 ? Math.round((makes / attempts) * 100) : null;

  if (shotPct !== null) {
    if (shotPct < 50) {
      observations.push(
        `Deine Wurfquote in den letzten Einheiten liegt bei ${shotPct}% (${makes}/${attempts}). Reduziere Distanz und arbeite mit Form-Shooting-Blöcken vor jedem Workout.`,
      );
    } else if (shotPct >= 70) {
      observations.push(
        `${shotPct}% Quote (${makes}/${attempts}) ist stark. Erhöhe jetzt die Schwierigkeit: Off-Dribble Pullups oder Game-Speed-Bewegungen.`,
      );
    } else {
      observations.push(
        `Solide ${shotPct}% Wurfquote. Konsistent halten – pro Session ein Spot mit 10er-Blöcken bis 8/10 Treffer.`,
      );
    }
  }

  if (avgRpe !== null) {
    if (avgRpe >= 8.5) {
      observations.push(
        `Durchschnittliche RPE liegt bei ${avgRpe}/10 — das ist sehr hoch. Plane eine Deload-Phase oder leichte Wochen ein, sonst leidet die Erholung.`,
      );
    } else if (avgRpe <= 5.5 && sessions.length > 0) {
      observations.push(
        `RPE liegt im Schnitt bei ${avgRpe}/10. Du hast Reserven — erhöhe Volumen oder Intensität gezielt in 1-2 Einheiten pro Woche.`,
      );
    }
  }

  if (basketballSessions.length === 0 && sessions.length > 0) {
    observations.push("In den letzten Einheiten fehlte Basketball-spezifisches Training. Plan diese Woche mindestens 2 Basketball-Skill-Sessions.");
  }
  if (gymSessions.length === 0 && sessions.length > 0) {
    observations.push("Krafttraining war zuletzt selten — 2 Gym-Einheiten/Woche stabilisieren Power und reduzieren Verletzungsrisiko.");
  }

  const gamePoints = games.reduce((sum, g) => sum + (g.points ?? 0), 0);
  const gameCount = games.filter((g) => g.context === "game").length;
  if (gameCount > 0) {
    const avg = Math.round((gamePoints / gameCount) * 10) / 10;
    observations.push(`Ø ${avg} Punkte über deine letzten ${gameCount} Spiele. Game-Stats zur Trainingsplanung nutzen — schwache Bereiche gezielt vorbereiten.`);
  }

  if (payload.mesocyclePhase === "deload") {
    observations.push("Du bist in der Deload-Phase: 60-70% Volumen, lockere Bewegungen, Schlaf priorisieren.");
  } else if (payload.mesocyclePhase === "peak") {
    observations.push("Peak-Phase: weniger Volumen, höhere Intensität & Spielnähe. Halte Pausen länger (≥2 Min zwischen schweren Sätzen).");
  } else if (payload.mesocyclePhase === "build") {
    observations.push("Aufbau-Phase: bewusst +10-15% Volumen pro Woche. Eine Deload-Woche alle 4-6 Wochen einplanen.");
  }

  if (observations.length === 0) {
    observations.push("Noch wenig Daten — protokolliere mindestens 5 Workouts und 2 Spiele, dann liefere ich konkretere Tipps.");
  }

  return {
    headline:
      payload.mesocyclePhase === "deload"
        ? "Erhol dich smart"
        : payload.mesocyclePhase === "peak"
          ? "Auf den Punkt scharf"
          : "Nächste Schritte",
    bullets: observations,
    source: "heuristic" as const,
  };
}

/**
 * Erkennt automatisch, welcher LLM-Provider konfiguriert ist.
 * Reihenfolge: explizite OPENAI_BASE_URL > GROQ_API_KEY > OPENAI_API_KEY (echtes OpenAI).
 * Damit sind Groq, OpenRouter, Mistral, Ollama (lokal) und OpenAI ohne Code-Änderung nutzbar.
 */
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

type WeeklyCoachBrief = {
  athleteReadiness: string;
  weeklyStoryline: string;
  priorities: string[];
  cautions: string[];
  openingLine: string;
};

function normalizeWeeklyBrief(raw: Record<string, unknown>): WeeklyCoachBrief {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown, max: number) =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, max) : [];
  return {
    athleteReadiness: str(raw.athleteReadiness).slice(0, 200) || "nicht näher beschrieben",
    weeklyStoryline: str(raw.weeklyStoryline).slice(0, 900) || "",
    priorities: arr(raw.priorities, 5),
    cautions: arr(raw.cautions, 4),
    openingLine: str(raw.openingLine).slice(0, 220) || "",
  };
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

async function runWeeklyCoachBriefPhase(
  payload: CoachPayload,
  config: NonNullable<ReturnType<typeof resolveLlmConfig>>,
  merged: WeekConfig,
): Promise<WeeklyCoachBrief> {
  const sessions = payload.recentSessions ?? [];
  const games = payload.recentGames ?? [];
  const profile = payload.profile ?? {};
  const coachNote = (payload.coachNote ?? "").trim().slice(0, 600);
  const intakeSummary = (payload.playerIntakeSummary ?? "").trim().slice(0, 2000);
  const availabilityLine = payload.weekAvailability
    ? Object.entries(payload.weekAvailability)
        .map(([day, cfg]) => `${day}=${cfg.mode}(${cfg.minutes}m)`)
        .join(", ")
    : JSON.stringify(merged);
  const training14Json = JSON.stringify(payload.recentTraining14d ?? []).slice(0, 2800);
  const countsJson = JSON.stringify(payload.subcategoryCounts14d ?? {}).slice(0, 800);
  const displayName = profile.fullName?.trim() || "Athlet";

  const user = `**Phase 1 – Kurzgespräch vor der Wochenplanung**

Du hast gerade ${displayName} neben dir. Lies die Fakten, dann fasse **ehrlich und persönlich** ein, wie die kommende Woche Sinn macht — noch **ohne** konkrete Tages-JSON-Planung.

[Spieler]
Position: ${payload.position ?? "unbekannt"} | Spielstil: ${payload.playStyle ?? "unbekannt"} | Level: ${payload.level ?? "?"} | Phase: ${payload.mesocyclePhase ?? "build"}
Körper: ${profile.heightCm ?? "?"} cm · ${profile.weightKg ?? "?"} kg · KFA ${profile.bodyFatPct ?? "?"}% · Alter: ${typeof profile.age === "number" && profile.age > 0 ? `${profile.age} J.` : "?"}

[Verfügbarkeit]
${availabilityLine}

[Aktive Ziele]
${payload.activeGoals?.length ? payload.activeGoals.slice(0, 8).join("; ") : "keine gelistet"}

[Schon / Verletzungsliste]
${payload.injuryExerciseNames?.length ? payload.injuryExerciseNames.slice(0, 10).join(", ") : "keine"}

[Fokus aus App]
${payload.focus ?? "Allgemein – ganzheitlich"}

${coachNote ? `[Was die Spieler:in dir persönlich sagt]\n${coachNote}\n` : ""}
${intakeSummary ? `[Kennenlernen – Antworten vom Start-Chat]\n${intakeSummary}\n` : ""}

[Training letzte 14 Tage – Rohlog]
${training14Json}

[Unterkategorien-Häufigkeit]
${countsJson}

[Letzte Sessions kompakt]
${JSON.stringify(sessions).slice(0, 1000)}

[Letzte Spiele]
${JSON.stringify(games).slice(0, 450)}

Antworte NUR mit JSON:
{
  "openingLine": string (1 Satz, Du-Form, optional mit Vornamen wenn aus dem Namen ableitbar),
  "athleteReadiness": string (1 kurzer Satz: frisch / müde / Überlast / unsicher — nach Daten begründen),
  "weeklyStoryline": string (2–4 Sätze Du-Form: narrative Linie der Woche, wie ein Coach sie erklärt),
  "priorities": string[] (max 4, je ein konkretes Trainingsziel für die Woche),
  "cautions": string[] (max 3, was du vermeiden oder dosieren würdest)
}`;

  const content = await fetchChatCompletionJson(
    config,
    [
      {
        role: "system",
        content: `${COACH_PERSONA_CORE} Du führst jetzt ein **Kurzgespräch** und strukturierst deine Einschätzung als JSON.${COACH_JSON_ONLY}`,
      },
      { role: "user", content: user },
    ],
    { max_tokens: 650, temperature: 0.62 },
  );
  const parsed = parseLlmJsonObject(content);
  const brief = normalizeWeeklyBrief(parsed);
  if (!brief.weeklyStoryline && brief.priorities.length === 0) {
    return {
      ...brief,
      weeklyStoryline:
        "Wir gehen pragmatisch vor: Belastung an deine Verfügbarkeit koppeln, eine klare Schwerpunkt-Schiene halten und genug Raum für Regeneration lassen.",
      openingLine: brief.openingLine || "Alles klar — ich setze die Woche für dich zusammen.",
    };
  }
  return brief;
}

async function runWeeklyPlanJsonPhase(
  payload: CoachPayload,
  config: NonNullable<ReturnType<typeof resolveLlmConfig>>,
  merged: WeekConfig,
  brief: WeeklyCoachBrief,
): Promise<{
  headline: string;
  bullets: string[];
  weekConfig: WeekConfig;
  coachWorkoutByDay: Partial<Record<DayKey, string>> | undefined;
}> {
  const sessions = payload.recentSessions ?? [];
  const games = payload.recentGames ?? [];
  const profile = payload.profile ?? {};
  const intakeSummary = (payload.playerIntakeSummary ?? "").trim().slice(0, 2000);
  const availabilityLine = payload.weekAvailability
    ? Object.entries(payload.weekAvailability)
        .map(([day, cfg]) => `${day}=${cfg.mode}(${cfg.minutes}m)`)
        .join(", ")
    : JSON.stringify(merged);

  const training14Json = JSON.stringify(payload.recentTraining14d ?? []).slice(0, 3000);
  const countsJson = JSON.stringify(payload.subcategoryCounts14d ?? {}).slice(0, 900);
  const catalogJson = JSON.stringify(payload.workoutCatalog ?? []).slice(0, 5200);

  const briefBlock = JSON.stringify(
    {
      openingLine: brief.openingLine,
      athleteReadiness: brief.athleteReadiness,
      weeklyStoryline: brief.weeklyStoryline,
      priorities: brief.priorities,
      cautions: brief.cautions,
    },
    null,
    0,
  ).slice(0, 2200);

  const weeklyUser = `**Phase 2 – konkreter Wochenplan**

Zuerst: Deine **eigene Kurzdiagnose** aus Phase 1 (verbindlich, im Plan sichtbar machen):
${briefBlock}

Jetzt setze den **technischen** Wochenplan als JSON um.

[Spieler]
Position: ${payload.position ?? "unbekannt"} | Spielstil: ${payload.playStyle ?? "unbekannt"} | Level: ${payload.level ?? "?"} | Phase: ${payload.mesocyclePhase ?? "build"}
Körper: ${profile.heightCm ?? "?"} cm · ${profile.weightKg ?? "?"} kg · KFA ${profile.bodyFatPct ?? "?"}% · Alter: ${typeof profile.age === "number" && profile.age > 0 ? `${profile.age} J.` : "?"}
${intakeSummary ? `\n[Kennenlernen – Start-Chat]\n${intakeSummary}\n` : ""}

[Verfügbarkeit / harte Vorgabe]
${availabilityLine}

[Bereits trainiert – letzte 14 Tage]
${training14Json}

[Häufigkeit Unterkategorien (14 Tage)]
${countsJson}

[Workout-Katalog – nur diese IDs für coachWorkoutByDay]
${catalogJson}

[Letzte Sessions kompakt]
${JSON.stringify(sessions).slice(0, 900)}

[Letzte Spiele]
${JSON.stringify(games).slice(0, 500)}

[JSON-Schema]
Antworte NUR mit JSON:
{
  "headline": string (max 6 Wörter, emotional-knapp, wie du die Woche betitelst),
  "bullets": string[] (4–6 Sätze, Du-Form: **Begründung** der Woche; mindestens 2 Sätze müssen sich direkt auf priorities/cautions/weeklyStoryline aus der Diagnose beziehen),
  "weekConfig": {
    "monday": {"mode":"gym"|"basketball_training"|"game_training"|"game_day"|"recovery"|"custom"|"unavailable"|"rest","minutes":number},
    ... alle 7 englischen Tage ...
  },
  "coachWorkoutByDay": {
    "monday": "workout-id-aus-katalog" | null,
    ... alle 7 Tage ...
  }
}

Regeln:
- Die Diagnose (Storyline, priorities, cautions) muss im Wochenablauf **sichtbar** werden (z. B. extra recovery wenn cautions Überlast sagen).
- Verfügbarkeit: nur an Tagen mit Zeit schwere Einheiten; mindestens 1 recovery pro Woche wenn möglich.
- Minuten realistisch (30–90 typisch), game_day eher kürzer.
- PG/SG: mehr basketball_training; Bigs: mehr gym + finishing; hohe KFA: +1 conditioning/leichte Einheit.
- coachWorkoutByDay: pro Tag höchstens eine ID aus dem Katalog; null bei rest/unavailable/recovery oder wenn kein passendes Workout.
- gym-Tage nur Gym-Workouts; basketball_training / game_day / game_training NUR Basketball-Workouts aus dem Katalog — niemals eine Gym-ID an einem Basketball- oder Spieltag.
- Variiere Unterkategorien, wenn die 14-Tage-Häufigkeit zeigt, dass eine Schiene schon oft dran war.
- injuryExerciseNames: keine progressionslastigen Blöcke für gelistete Schon-Übungen vorschlagen (Workout-Wahl vermeidet diese Übungen wenn möglich).`;

  const content = await fetchChatCompletionJson(
    config,
    [
      {
        role: "system",
        content: `${COACH_PERSONA_CORE} Du erstellst jetzt den **konkreten Wochenplan** als JSON. Du **musst** die vorherige Kurzdiagnose in Modus, Minuten und Workout-Wahl widerspiegeln.${COACH_JSON_ONLY} coachWorkoutByDay: je englischer Wochentag ein string (Workout-ID aus Katalog) oder null. Strikte Regel: An Tagen mit mode basketball_training, game_training oder game_day darf NUR eine Workout-ID mit category "Basketball" stehen; an gym-Tagen nur "Gym"; an recovery nur Regeneration/Home.`,
      },
      { role: "user", content: weeklyUser },
    ],
    { max_tokens: 1500, temperature: 0.38 },
  );

  const parsed = parseLlmJsonObject(content);
  const aiWeek = applyLlmWeekPatch(merged, parsed.weekConfig);
  const weekConfig = aiWeek;
  const coachWorkoutByDay = sanitizeCoachWorkoutByDay(parsed.coachWorkoutByDay, weekConfig, payload.workoutCatalog);
  return {
    headline: typeof parsed.headline === "string" && parsed.headline.trim() ? parsed.headline.trim().slice(0, 80) : "Deine Woche mit Plan",
    bullets:
      Array.isArray(parsed.bullets) && parsed.bullets.length > 0
        ? parsed.bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 8)
        : [
            brief.openingLine || "Gute Woche dir.",
            ...brief.priorities.slice(0, 2),
            ...brief.cautions.slice(0, 1),
          ].filter(Boolean),
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
      model: groqModel ?? explicitModel ?? "llama-3.3-70b-versatile",
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
    const brief = await runWeeklyCoachBriefPhase(payload, config, merged);
    const plan = await runWeeklyPlanJsonPhase(payload, config, merged, brief);
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
  const profileLine = [
    profile.heightCm ? `${profile.heightCm} cm` : null,
    profile.weightKg ? `${profile.weightKg} kg` : null,
    profile.bodyFatPct ? `KFA ${profile.bodyFatPct}%` : null,
    typeof profile.age === "number" && profile.age > 0 ? `Alter ${profile.age} J.` : null,
    profile.wingspanCm ? `Spannweite ${profile.wingspanCm} cm` : null,
    profile.standingReachCm ? `Standing Reach ${profile.standingReachCm} cm` : null,
  ].filter(Boolean).join(" · ");

  const availabilityLine = payload.weekAvailability
    ? Object.entries(payload.weekAvailability)
        .map(([day, cfg]) => `${day}=${cfg.mode}(${cfg.minutes}m)`)
        .join(", ")
    : "nicht angegeben";

  const goalsLine = payload.activeGoals?.length
    ? payload.activeGoals.slice(0, 6).join("; ")
    : "keine aktiven Ziele";

  const injuryLine = payload.injuryExerciseNames?.length
    ? `Schon-Übungen: ${payload.injuryExerciseNames.slice(0, 6).join(", ")}`
    : "";

  const coachNoteLine = (payload.coachNote ?? "").trim().slice(0, 550);
  const intakeSummaryLine = (payload.playerIntakeSummary ?? "").trim().slice(0, 2000);
  const training14Slice = JSON.stringify(payload.recentTraining14d ?? []).slice(0, 1400);
  const displayFirstName =
    profile.fullName?.trim().split(/\s+/)[0]?.replace(/[^a-zA-ZäöüÄÖÜß'-]/g, "") || null;

  const userPrompt = `Wir besprechen die **nächsten Trainingstage** — wie in einem kurzen 1:1 auf der Bank.${
    displayFirstName ? ` Du sprichst mich mit „${displayFirstName}“ an, wenn es passt.` : ""
  }

[Voraussetzungen]
Position: ${payload.position ?? "unbekannt"} | Spielstil: ${payload.playStyle ?? "unbekannt"} | Level: ${payload.level ?? "?"} | Phase: ${payload.mesocyclePhase ?? "build"}
Körper: ${profileLine || "keine Angaben"}
${injuryLine}

[Verfügbarkeit pro Woche]
${availabilityLine}

[Aktive Ziele]
${goalsLine}

[Fokus aus der App]
${payload.focus ?? "Allgemein – ganzheitlich (Skill, Kraft, Regeneration)"}

${coachNoteLine ? `[Was ich dir mit auf den Weg gebe / wie es mir gerade geht]\n${coachNoteLine}\n` : ""}
${intakeSummaryLine ? `[Kennenlernen – was ich über mich gesagt habe]\n${intakeSummaryLine}\n` : ""}

[Letzte Workouts – Rohverlauf 14 Tage]
${training14Slice}

[Letzte ${sessions.length} Sessions – Kennzahlen]
${JSON.stringify(sessions).slice(0, 1400)}

[Letzte ${games.length} Spiele]
${JSON.stringify(games).slice(0, 650)}

**Deine Aufgabe**
- **Du-Form**, respektvoll, wie ein echter Trainer — keine Motivations-Floskeln, keine Buzzwords.
- **4–6** Bullets: jeder Bullet **ein** klar umsetzbarer Satz (was, wie oft, worauf achten).
- Nutze **Zahlen** aus Sessions/RPE/Würfen/Spielen, wenn sie da sind; beziehe dich auf meine wöchentliche Notiz und auf den **Kennenlern-Block**, falls vorhanden.
- Wenn Daten dünn sind: sag das ehrlich und schlag trotzdem 2–3 sinnvolle Defaults vor.

Antworte NUR mit JSON: {"headline": string (max 7 Wörter), "bullets": string[] }`;

  const content = await fetchChatCompletionJson(
    config,
    [
      {
        role: "system",
        content: `${COACH_PERSONA_CORE} Du gibst **Kurz-Tipps für die nächsten Tage** (kein vollständiger Wochen-Gantt).${COACH_JSON_ONLY} Format: {"headline":string,"bullets":string[]}.`,
      },
      { role: "user", content: userPrompt },
    ],
    { max_tokens: 560, temperature: 0.55 },
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
    return NextResponse.json(buildHeuristicResponse(payload));
  }

  if (config) {
    try {
      const aiResponse = await callLlm(payload, config);
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
      const fallback = buildHeuristicResponse(payload);
      return NextResponse.json({
        ...fallback,
        warning: error instanceof Error ? error.message : "LLM-Fallback aktiv",
      });
    }
  }
}
