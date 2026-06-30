export type CoachHeuristicSession = {
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

export type CoachHeuristicGame = {
  date: string;
  context: "game" | "game_training";
  points: number | null;
  assists: number | null;
  rebounds: number | null;
  steals: number | null;
};

export type CoachHeuristicPayload = {
  mesocyclePhase?: "base" | "build" | "peak" | "deload";
  recentSessions?: CoachHeuristicSession[];
  recentGames?: CoachHeuristicGame[];
};

export function buildCoachHeuristicResponse(payload: CoachHeuristicPayload) {
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

  const shootingSessions = basketballSessions.filter(
    (s) =>
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
    observations.push(
      "In den letzten Einheiten fehlte Basketball-spezifisches Training. Plan diese Woche mindestens 2 Basketball-Skill-Sessions.",
    );
  }
  if (gymSessions.length === 0 && sessions.length > 0) {
    observations.push(
      "Krafttraining war zuletzt selten — 2 Gym-Einheiten/Woche stabilisieren Power und reduzieren Verletzungsrisiko.",
    );
  }

  const gamePoints = games.reduce((sum, g) => sum + (g.points ?? 0), 0);
  const gameCount = games.filter((g) => g.context === "game").length;
  if (gameCount > 0) {
    const avg = Math.round((gamePoints / gameCount) * 10) / 10;
    observations.push(
      `Ø ${avg} Punkte über deine letzten ${gameCount} Spiele. Game-Stats zur Trainingsplanung nutzen — schwache Bereiche gezielt vorbereiten.`,
    );
  }

  if (payload.mesocyclePhase === "deload") {
    observations.push("Du bist in der Deload-Phase: 60-70% Volumen, lockere Bewegungen, Schlaf priorisieren.");
  } else if (payload.mesocyclePhase === "peak") {
    observations.push(
      "Peak-Phase: weniger Volumen, höhere Intensität & Spielnähe. Halte Pausen länger (≥2 Min zwischen schweren Sätzen).",
    );
  } else if (payload.mesocyclePhase === "build") {
    observations.push("Aufbau-Phase: bewusst +10-15% Volumen pro Woche. Eine Deload-Woche alle 4-6 Wochen einplanen.");
  }

  if (observations.length === 0) {
    observations.push(
      "Noch wenig Daten — protokolliere mindestens 5 Workouts und 2 Spiele, dann liefere ich konkretere Tipps. KI-Tipps: „Coach aktualisieren“.",
    );
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
