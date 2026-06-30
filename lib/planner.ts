export type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type DayMode =
  | "unavailable"
  | "rest"
  | "recovery"
  | "game_day"
  | "game_training"
  | "basketball_training"
  | "gym"
  | "custom";

export type DayConfig = {
  mode: DayMode;
  minutes: number;
};

export type WeekConfig = Record<DayKey, DayConfig>;

export type MesocyclePhase = "base" | "build" | "peak" | "deload";

export type PlannerInput = {
  position: string;
  playStyle: string;
  weekConfig: WeekConfig;
  weeklyGoalSessions: number;
  /** Optional: aktuelle Periodisierungs-Phase. */
  mesocyclePhase?: MesocyclePhase;
};

export const PHASE_VOLUME_FACTOR: Record<MesocyclePhase, number> = {
  base: 1.0,
  build: 1.12,
  peak: 0.92,
  deload: 0.65,
};

export const PHASE_INTENSITY_HINT: Record<MesocyclePhase, "rest" | "recovery" | "light" | "medium" | "high"> = {
  base: "medium",
  build: "high",
  peak: "high",
  deload: "light",
};

function applyPhaseModifiers(
  minutes: number,
  intensity: PlannedDay["intensity"],
  sessionType: PlannedDay["sessionType"],
  phase: MesocyclePhase | undefined,
): { minutes: number; intensity: PlannedDay["intensity"] } {
  if (!phase || sessionType === "none" || sessionType === "recovery" || sessionType === "game") {
    return { minutes, intensity };
  }
  const factor = PHASE_VOLUME_FACTOR[phase];
  const nextMinutes = Math.max(0, Math.round((minutes * factor) / 5) * 5);
  let nextIntensity: PlannedDay["intensity"] = intensity;
  if (phase === "deload" && (intensity === "high" || intensity === "medium")) {
    nextIntensity = "light";
  } else if (phase === "peak" && intensity === "medium") {
    nextIntensity = "high";
  } else if (phase === "build" && intensity === "medium") {
    nextIntensity = "high";
  }
  return { minutes: nextMinutes, intensity: nextIntensity };
}

export type PlannedDay = {
  day: DayKey;
  minutes: number;
  intensity: "rest" | "recovery" | "light" | "medium" | "high";
  sessionType: "none" | "recovery" | "game" | "game-training" | "basketball" | "gym" | "custom";
  reason: string;
};

/** Anzeige für Weekly-Plan: Spieltag zeigt „Spiel“ statt Minuten. */
export function formatPlannedDayDuration(entry: Pick<PlannedDay, "sessionType" | "minutes">): string {
  if (entry.sessionType === "game") return "Spiel";
  if (entry.minutes <= 0) return "—";
  return `${entry.minutes} Min`;
}

const DAYS: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DAY_TO_INDEX: Record<DayKey, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function normalizeMinutes(mode: DayMode, minutes: number) {
  if (mode === "unavailable" || mode === "rest") return 0;
  if (mode === "game_day") return Math.min(Math.max(minutes, 0), 20);
  if (mode === "game_training") return Math.min(Math.max(minutes, 0), 45);
  return Math.max(minutes, 0);
}

export function buildWeeklyPlan(input: PlannerInput): PlannedDay[] {
  const phase = input.mesocyclePhase;
  const phaseSuffix = phase
    ? ` · Phase: ${({ base: "Basis", build: "Aufbau", peak: "Peak", deload: "Deload" } as const)[phase]}`
    : "";

  return DAYS.map((day) => {
    const config = input.weekConfig[day] ?? { mode: "unavailable", minutes: 0 };
    const baseMinutes = normalizeMinutes(config.mode, config.minutes);

    let raw: PlannedDay;
    switch (config.mode) {
      case "unavailable":
        raw = { day, minutes: 0, intensity: "rest", sessionType: "none", reason: "Keine Zeit" };
        break;
      case "rest":
        raw = { day, minutes: 0, intensity: "recovery", sessionType: "recovery", reason: "Keine Zeit: nur lockeres Auslaufen/Dehnung" };
        break;
      case "recovery":
        raw = { day, minutes: baseMinutes, intensity: "recovery", sessionType: "recovery", reason: "Aktive Regeneration" };
        break;
      case "game_day":
        raw = { day, minutes: 0, intensity: "high", sessionType: "game", reason: "Spieltag" };
        break;
      case "game_training":
        raw = { day, minutes: baseMinutes, intensity: "medium", sessionType: "game-training", reason: "Spieltraining: 15 Min vorab + 30 Min Nachgang" };
        break;
      case "basketball_training":
        raw = {
          day,
          minutes: baseMinutes,
          intensity: "high",
          sessionType: "basketball",
          reason: `${input.position.toUpperCase()} • ${input.playStyle}${phaseSuffix}`,
        };
        break;
      case "gym":
        raw = {
          day,
          minutes: baseMinutes,
          intensity: baseMinutes >= 60 ? "high" : "medium",
          sessionType: "gym",
          reason: `Gym-Fokus${phaseSuffix}`,
        };
        break;
      case "custom":
      default:
        raw = { day, minutes: baseMinutes, intensity: "medium", sessionType: "custom", reason: `Benutzerdefiniert${phaseSuffix}` };
        break;
    }

    const adjusted = applyPhaseModifiers(raw.minutes, raw.intensity, raw.sessionType, phase);
    return { ...raw, minutes: adjusted.minutes, intensity: adjusted.intensity };
  });
}

export function getNextDateForDay(day: DayKey, fromDate = new Date()) {
  const currentDayIndex = fromDate.getDay();
  const targetDayIndex = DAY_TO_INDEX[day];
  const difference = (targetDayIndex - currentDayIndex + 7) % 7;
  const result = new Date(fromDate);
  result.setHours(0, 0, 0, 0);
  result.setDate(fromDate.getDate() + difference);
  return result;
}

export function getDaysStartingToday(fromDate = new Date()): DayKey[] {
  const currentDayIndex = fromDate.getDay();
  const orderedDays = [...DAYS].sort(
    (left, right) =>
      ((DAY_TO_INDEX[left] - currentDayIndex + 7) % 7) -
      ((DAY_TO_INDEX[right] - currentDayIndex + 7) % 7),
  );

  return orderedDays;
}

const ALL_DAY_KEYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** Leerer Rhythmus — bis der Nutzer die Ersteinrichtung abgeschlossen hat. */
export function getEmptyWeekConfig(): WeekConfig {
  return ALL_DAY_KEYS.reduce((acc, day) => {
    acc[day] = { mode: "unavailable", minutes: 0 };
    return acc;
  }, {} as WeekConfig);
}

/** Standard-Wochenrhythmus (wird im Profil überschrieben). */
export function getDefaultWeekConfig(): WeekConfig {
  return {
    monday: { mode: "gym", minutes: 60 },
    tuesday: { mode: "basketball_training", minutes: 45 },
    wednesday: { mode: "game_training", minutes: 45 },
    thursday: { mode: "recovery", minutes: 30 },
    friday: { mode: "basketball_training", minutes: 45 },
    saturday: { mode: "gym", minutes: 60 },
    sunday: { mode: "game_day", minutes: 20 },
  };
}