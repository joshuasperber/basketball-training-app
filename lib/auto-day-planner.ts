import { type DayKey } from "@/lib/planner";

export type SessionType = "basketball" | "gym" | "recovery" | "rest";

export type DayAvailability = {
  day: DayKey;
  available: boolean;
  minutes: number;
  allowedSessionTypes: Array<"basketball" | "gym">;
};

export type AutoPlannerInput = {
  trainingDaysTarget: number;
  availabilities: DayAvailability[];
  preferBasketballRatio: number; // 0..1 (z.B. 0.6 = 60% Basketball)
};

export type PlannedSlot = {
  day: DayKey;
  sessionType: SessionType;
  minutes: number;
  reason: string;
};

const DAY_ORDER: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeMinutes(minutes: number) {
  return clamp(Math.round(minutes), 0, 180);
}

function canDo(day: DayAvailability, type: "basketball" | "gym") {
  return day.available && day.allowedSessionTypes.includes(type) && day.minutes > 0;
}

function pickLowestLoadDay(
  candidates: DayAvailability[],
  loadMap: Record<DayKey, number>,
): DayAvailability | null {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const loadDiff = (loadMap[a.day] ?? 0) - (loadMap[b.day] ?? 0);
    if (loadDiff !== 0) return loadDiff;
    return DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
  })[0];
}

export function buildAutoDayPlan(input: AutoPlannerInput): PlannedSlot[] {
  const target = clamp(input.trainingDaysTarget, 0, 7);
  const basketballRatio = clamp(input.preferBasketballRatio, 0, 1);

  const byDay = new Map(input.availabilities.map((a) => [a.day, a]));
  const orderedAvailability = DAY_ORDER.map((day) =>
    byDay.get(day) ?? {
      day,
      available: false,
      minutes: 0,
      allowedSessionTypes: ["basketball", "gym"] as Array<"basketball" | "gym">,
    },
  );

  const possibleDays = orderedAvailability.filter((d) => d.available && d.minutes > 0);
  const effectiveTarget = Math.min(target, possibleDays.length);

  const basketballTarget = Math.round(effectiveTarget * basketballRatio);
  const gymTarget = effectiveTarget - basketballTarget;

  const loadMap: Record<DayKey, number> = {
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0,
    saturday: 0,
    sunday: 0,
  };

  const slotMap: Record<DayKey, PlannedSlot> = {
    monday: { day: "monday", sessionType: "rest", minutes: 0, reason: "Kein Slot geplant." },
    tuesday: { day: "tuesday", sessionType: "rest", minutes: 0, reason: "Kein Slot geplant." },
    wednesday: { day: "wednesday", sessionType: "rest", minutes: 0, reason: "Kein Slot geplant." },
    thursday: { day: "thursday", sessionType: "rest", minutes: 0, reason: "Kein Slot geplant." },
    friday: { day: "friday", sessionType: "rest", minutes: 0, reason: "Kein Slot geplant." },
    saturday: { day: "saturday", sessionType: "rest", minutes: 0, reason: "Kein Slot geplant." },
    sunday: { day: "sunday", sessionType: "rest", minutes: 0, reason: "Kein Slot geplant." },
  };

  // 1) Basketball-Slots setzen (nur auf Tagen, an denen Basketball erlaubt ist)
  for (let i = 0; i < basketballTarget; i += 1) {
    const openBasketballDays = orderedAvailability.filter(
      (d) => canDo(d, "basketball") && slotMap[d.day].sessionType === "rest",
    );
    const picked = pickLowestLoadDay(openBasketballDays, loadMap);
    if (!picked) break;

    const minutes = normalizeMinutes(picked.minutes);
    slotMap[picked.day] = {
      day: picked.day,
      sessionType: "basketball",
      minutes,
      reason: "Automatisch geplant: Basketball möglich und priorisiert.",
    };
    loadMap[picked.day] += minutes;
  }

  // 2) Gym-Slots setzen (nur auf Tagen, an denen Gym erlaubt ist)
  for (let i = 0; i < gymTarget; i += 1) {
    const openGymDays = orderedAvailability.filter(
      (d) => canDo(d, "gym") && slotMap[d.day].sessionType === "rest",
    );
    const picked = pickLowestLoadDay(openGymDays, loadMap);
    if (!picked) break;

    const minutes = normalizeMinutes(picked.minutes);
    slotMap[picked.day] = {
      day: picked.day,
      sessionType: "gym",
      minutes,
      reason: "Automatisch geplant: Gym möglich und zur Balance ergänzt.",
    };
    loadMap[picked.day] += minutes;
  }

  // 3) Falls Ziel noch nicht erreicht: mit erlaubten Tagen auffüllen (basketball/gym je nach Tag)
  const assignedCount = Object.values(slotMap).filter((s) => s.sessionType === "basketball" || s.sessionType === "gym").length;
  let stillMissing = Math.max(0, effectiveTarget - assignedCount);

  while (stillMissing > 0) {
    const openDays = orderedAvailability.filter((d) => d.available && d.minutes > 0 && slotMap[d.day].sessionType === "rest");
    if (!openDays.length) break;

    const picked = pickLowestLoadDay(openDays, loadMap);
    if (!picked) break;

    const type: "basketball" | "gym" =
      picked.allowedSessionTypes.includes("basketball") ? "basketball" : "gym";

    const minutes = normalizeMinutes(picked.minutes);
    slotMap[picked.day] = {
      day: picked.day,
      sessionType: type,
      minutes,
      reason: "Automatisch geplant: freier Slot basierend auf Tagesverfügbarkeit.",
    };
    loadMap[picked.day] += minutes;
    stillMissing -= 1;
  }

  // 4) Verfügbare, aber nicht genutzte Tage -> recovery
  orderedAvailability.forEach((d) => {
    if (!d.available || d.minutes <= 0) {
      slotMap[d.day] = {
        day: d.day,
        sessionType: "rest",
        minutes: 0,
        reason: "Nicht verfügbar.",
      };
      return;
    }

    if (slotMap[d.day].sessionType === "rest") {
      slotMap[d.day] = {
        day: d.day,
        sessionType: "recovery",
        minutes: Math.min(30, normalizeMinutes(d.minutes)),
        reason: "Verfügbar, aber kein Haupttraining eingeplant.",
      };
    }
  });

  return DAY_ORDER.map((day) => slotMap[day]);
}