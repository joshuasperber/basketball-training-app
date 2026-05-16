type AppRouterLike = {
  push: (href: string) => void;
};

export type WeeklyWorkoutTransferPayload = {
  title: string;
  sport: string;
  subcategory: string;
  notes?: string;
  exerciseIds?: string[];
  exercises?: string[];
  workoutId?: string;
};

const STORAGE_KEY = "bt.weekly-workout-transfer.v1";
const MAX_ENTRIES = 12;

function readStore(): Record<string, WeeklyWorkoutTransferPayload> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, WeeklyWorkoutTransferPayload>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, WeeklyWorkoutTransferPayload>) {
  if (typeof window === "undefined") return;
  const keys = Object.keys(store);
  const trimmed =
    keys.length <= MAX_ENTRIES
      ? store
      : Object.fromEntries(keys.slice(-MAX_ENTRIES).map((key) => [key, store[key]!]));
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function stashWeeklyWorkoutPayload(payload: WeeklyWorkoutTransferPayload): string {
  const id = `wt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const store = readStore();
    store[id] = payload;
    writeStore(store);
    return id;
  } catch {
    return "";
  }
}

export function consumeWeeklyWorkoutPayload(id: string): WeeklyWorkoutTransferPayload | null {
  if (!id || typeof window === "undefined") return null;
  const store = readStore();
  const payload = store[id] ?? null;
  if (payload) {
    delete store[id];
    writeStore(store);
  }
  return payload;
}

export function peekWeeklyWorkoutPayload(id: string): WeeklyWorkoutTransferPayload | null {
  if (!id || typeof window === "undefined") return null;
  return readStore()[id] ?? null;
}

export type WeeklyWorkoutNavCard = {
  id: string;
  title: string;
  sport: string;
  subcategory: string;
  notes?: string;
  manualWorkoutId?: string;
  workoutId?: string;
  autoSuggestion?: WeeklyWorkoutTransferPayload;
};

function payloadFromCard(card: WeeklyWorkoutNavCard): WeeklyWorkoutTransferPayload {
  if (card.autoSuggestion) {
    return {
      title: card.autoSuggestion.title,
      sport: card.autoSuggestion.sport,
      subcategory: card.autoSuggestion.subcategory,
      notes: card.autoSuggestion.notes,
      exerciseIds: card.autoSuggestion.exerciseIds,
      exercises: card.autoSuggestion.exercises,
      workoutId: card.autoSuggestion.workoutId ?? card.workoutId,
    };
  }
  return {
    title: card.title,
    sport: card.sport,
    subcategory: card.subcategory,
    notes: card.notes,
    workoutId: card.workoutId,
  };
}

function isSyntheticWorkoutId(workoutId?: string) {
  return Boolean(workoutId?.startsWith("auto-") || workoutId?.startsWith("recovery-"));
}

function encodeAutoWorkoutQuery(payload: WeeklyWorkoutTransferPayload): string | null {
  try {
    return encodeURIComponent(JSON.stringify(payload));
  } catch {
    return null;
  }
}

export function buildWeeklyWorkoutNavPath(
  day: number,
  mode: "start" | "edit" | "add",
  card?: WeeklyWorkoutNavCard | null,
): string {
  if (mode === "add") {
    return `/workouts?day=${day}&manual=1`;
  }
  if (!card) {
    return `/workouts?day=${day}`;
  }

  if (mode === "edit") {
    if (card.manualWorkoutId) {
      return `/workouts?day=${day}&manual=1&manualWorkoutId=${encodeURIComponent(card.manualWorkoutId)}`;
    }
    const payload = payloadFromCard(card);
    const payloadId = stashWeeklyWorkoutPayload(payload);
    if (payloadId) {
      let path = `/workouts?day=${day}&manual=1&replaceCardId=${encodeURIComponent(card.id)}&workoutPayloadId=${encodeURIComponent(payloadId)}`;
      if (card.workoutId && !isSyntheticWorkoutId(card.workoutId)) {
        path += `&workoutId=${encodeURIComponent(card.workoutId)}`;
      }
      return path;
    }
    const encoded = encodeAutoWorkoutQuery(payload);
    return encoded
      ? `/workouts?day=${day}&manual=1&replaceCardId=${encodeURIComponent(card.id)}&autoWorkout=${encoded}`
      : `/workouts?day=${day}&manual=1&replaceCardId=${encodeURIComponent(card.id)}`;
  }

  if (card.manualWorkoutId) {
    return `/workouts?day=${day}&manualWorkoutId=${encodeURIComponent(card.manualWorkoutId)}`;
  }

  const hasSyntheticId = isSyntheticWorkoutId(card.workoutId);
  if (card.autoSuggestion || hasSyntheticId || !card.workoutId) {
    const payload = payloadFromCard(card);
    const payloadId = stashWeeklyWorkoutPayload(payload);
    if (payloadId) {
      return `/workouts?day=${day}&workoutPayloadId=${encodeURIComponent(payloadId)}`;
    }
    const encoded = encodeAutoWorkoutQuery(payload);
    return encoded ? `/workouts?day=${day}&autoWorkout=${encoded}` : `/workouts?day=${day}`;
  }

  return `/workouts?day=${day}&workoutId=${encodeURIComponent(card.workoutId)}`;
}

export function navigateToWeeklyWorkout(
  router: AppRouterLike,
  options: { day: number; mode: "start" | "edit" | "add"; card?: WeeklyWorkoutNavCard | null },
) {
  const path = buildWeeklyWorkoutNavPath(options.day, options.mode, options.card);
  router.push(path);
}

/** Parst `autoWorkout`-Query (ein- oder doppelt encodiert) oder Transfer-Payload. */
export function parseWeeklyAutoWorkoutRaw(
  raw: string | null | undefined,
): WeeklyWorkoutTransferPayload | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const attempts = [
    trimmed,
    (() => {
      try {
        return decodeURIComponent(trimmed);
      } catch {
        return null;
      }
    })(),
    (() => {
      try {
        return decodeURIComponent(decodeURIComponent(trimmed));
      } catch {
        return null;
      }
    })(),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate) as WeeklyWorkoutTransferPayload;
      if (parsed?.title) return parsed;
    } catch {
      // next attempt
    }
  }
  return null;
}
