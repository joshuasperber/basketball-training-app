import { NextResponse } from "next/server";
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
  /** `weekly_plan` liefert optional `weekConfig` für die Wochenplanung. */
  intent?: "coaching" | "weekly_plan";
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
}> {
  if (payload.intent === "weekly_plan") {
    const sessions = payload.recentSessions ?? [];
    const games = payload.recentGames ?? [];
    const profile = payload.profile ?? {};
    const merged = mergeWeekConfigFromPayload(payload);
    const availabilityLine = payload.weekAvailability
      ? Object.entries(payload.weekAvailability)
          .map(([day, cfg]) => `${day}=${cfg.mode}(${cfg.minutes}m)`)
          .join(", ")
      : JSON.stringify(merged);

    const weeklyUser = `Erstelle einen vollständigen Wochen-Trainingsplan (Mo-So) als JSON.

[Spieler]
Position: ${payload.position ?? "unbekannt"} | Spielstil: ${payload.playStyle ?? "unbekannt"} | Level: ${payload.level ?? "?"} | Phase: ${payload.mesocyclePhase ?? "build"}
Körper: ${profile.heightCm ?? "?"} cm · ${profile.weightKg ?? "?"} kg · KFA ${profile.bodyFatPct ?? "?"}%

[Verfügbarkeit / Vorgabe]
${availabilityLine}

[Letzte Sessions (Auszug)]
${JSON.stringify(sessions).slice(0, 1200)}

[Letzte Spiele]
${JSON.stringify(games).slice(0, 500)}

[JSON-Schema]
Antworte NUR mit JSON:
{
  "headline": string (max 6 Wörter),
  "bullets": string[] (3-5 kurze Sätze: Begründung der Woche),
  "weekConfig": {
    "monday": {"mode":"gym"|"basketball_training"|"game_training"|"game_day"|"recovery"|"custom"|"unavailable"|"rest","minutes":number},
    ... alle 7 englischen Tage ...
  }
}

Regeln:
- Nutze die Verfügbarkeit als harte Vorgabe: nur an Tagen mit Zeit schwere Einheiten; mindestens 1 recovery pro Woche wenn möglich.
- Minuten realistisch (30-90 typisch), game_day eher kürzer.
- PG/SG: mehr basketball_training; Bigs: mehr gym + finishing; hohe KFA: +1 conditioning/leichte Einheit.
`;

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content:
              'Du bist ein Basketball-S&C-Coach. Antworte AUSSCHLIESSLICH mit gültigem JSON {"headline":string,"bullets":string[],"weekConfig":object}.',
          },
          { role: "user", content: weeklyUser },
        ],
        response_format: { type: "json_object" },
        temperature: 0.45,
        max_tokens: 900,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`${config.providerLabel.toUpperCase()} HTTP ${response.status}${errorBody ? `: ${errorBody.slice(0, 200)}` : ""}`);
    }
    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    let parsed: { headline?: string; bullets?: string[]; weekConfig?: unknown } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const stripped = content.replace(/```json\s*|\s*```/g, "").trim();
      try {
        parsed = JSON.parse(stripped);
      } catch {
        parsed = {};
      }
    }
    const aiWeek = applyLlmWeekPatch(merged, parsed.weekConfig);
    const weekConfig = aiWeek;
    return {
      headline: parsed.headline?.trim() || "Deine KI-Woche",
      bullets:
        Array.isArray(parsed.bullets) && parsed.bullets.length > 0
          ? parsed.bullets.slice(0, 6)
          : ["Plan erstellt — im Profil kannst du Tage feinjustieren."],
      weekConfig,
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

  const userPrompt = `Du bist ein präziser Basketball- und Krafttrainings-Coach. Antworte auf Deutsch, knapp, mit 3-5 konkret umsetzbaren Empfehlungen für die nächste Woche.

[Spieler]
Position: ${payload.position ?? "unbekannt"} | Spielstil: ${payload.playStyle ?? "unbekannt"} | Level: ${payload.level ?? "?"} | Phase: ${payload.mesocyclePhase ?? "build"}
Körper: ${profileLine || "keine Angaben"}
${injuryLine}

[Verfügbarkeit pro Woche]
${availabilityLine}

[Aktive Ziele]
${goalsLine}

[Fokus]
${payload.focus ?? "Allgemein – ganzheitlich (Skill, Kraft, Regeneration)"}

[Letzte ${sessions.length} Sessions]
${JSON.stringify(sessions).slice(0, 1600)}

[Letzte ${games.length} Spiele]
${JSON.stringify(games).slice(0, 700)}

[Aufgabe]
Berücksichtige die Verfügbarkeit (wenn 3 Tage frei → kompakter Plan, wenn 5+ → Periodisierung möglich), Körperdaten (z. B. höheres Gewicht → mehr Knie-/Hüft-Mobility, höheres KFA → mehr Conditioning, große Spannweite → Drives ausnutzen), Position und Spielstil (PG braucht mehr Handles, C mehr Post + Rim Protection).
Gib die Antwort als JSON mit Feldern "headline" (max 6 Wörter) und "bullets" (Array, jeweils 1 konkret umsetzbarer Satz, max 5).`;

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: "Du bist ein scharfer, präziser Basketball-Performance-Coach. Antworte AUSSCHLIESSLICH mit gültigem JSON im Format {\"headline\":string,\"bullets\":string[]}." },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.6,
      max_tokens: 380,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`${config.providerLabel.toUpperCase()} HTTP ${response.status}${errorBody ? `: ${errorBody.slice(0, 200)}` : ""}`);
  }
  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  let parsed: { headline?: string; bullets?: string[] } = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    // Manche Modelle wrappen JSON in Markdown-Codeblöcke – einmal aufräumen.
    const stripped = content.replace(/```json\s*|\s*```/g, "").trim();
    try {
      parsed = JSON.parse(stripped);
    } catch {
      parsed = {};
    }
  }
  return {
    headline: parsed.headline?.trim() || "Coach-Empfehlung",
    bullets:
      Array.isArray(parsed.bullets) && parsed.bullets.length > 0
        ? parsed.bullets
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
