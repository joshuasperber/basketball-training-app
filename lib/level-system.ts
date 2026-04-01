export type WorkoutXpEntry = {
  id: string;
  date: string;
  workoutId: string;
  workoutTitle: string;
  exerciseXp: number;
  workoutXp: number;
  totalXp: number;
  achievedSets: number;
  totalSets: number;
  qualityScore: number;
};

export type ProgressionState = {
  totalXp: number;
  level: number;
  deloadActive: boolean;
  overloadDetectedAt: string | null;
  updatedAt: string;
};

const XP_HISTORY_KEY = "bt.xp-history.v1";
const XP_PROGRESSION_KEY = "bt.progression.v1";

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDaysBetween(fromISO: string, toDate: Date) {
  const from = new Date(fromISO);
  const fromDate = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toDateOnly = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
  const diffMs = toDateOnly.getTime() - fromDate.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function canUseStorage() {
  return typeof window !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;

  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) return fallback;

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getXpHistory() {
  return readJson<WorkoutXpEntry[]>(XP_HISTORY_KEY, []);
}

export function getDefaultProgressionState(): ProgressionState {
  return {
    totalXp: 0,
    level: 1,
    deloadActive: false,
    overloadDetectedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

export function getProgressionState() {
  return readJson<ProgressionState>(XP_PROGRESSION_KEY, getDefaultProgressionState());
}

export function getXpForNextLevel(level: number) {
  return Math.round(100 * Math.pow(level, 1.5));
}

export function getLevelFromXp(totalXp: number) {
  let level = 1;
  let consumedXp = 0;
  let xpForCurrentLevel = getXpForNextLevel(level);

  while (totalXp >= consumedXp + xpForCurrentLevel) {
    consumedXp += xpForCurrentLevel;
    level += 1;
    xpForCurrentLevel = getXpForNextLevel(level);
  }

  return {
    level,
    xpIntoLevel: totalXp - consumedXp,
    xpForCurrentLevel,
  };
}

function getXpInRange(entries: WorkoutXpEntry[], startInclusive: Date, endInclusive: Date) {
  return entries
    .filter((entry) => {
      const date = new Date(entry.date);
      return date >= startInclusive && date <= endInclusive;
    })
    .reduce((sum, entry) => sum + entry.totalXp, 0);
}

export function detectOverload(entries: WorkoutXpEntry[], referenceDate = new Date()) {
  const endCurrent = new Date(referenceDate);
  endCurrent.setHours(23, 59, 59, 999);
  const startCurrent = new Date(endCurrent);
  startCurrent.setDate(endCurrent.getDate() - 6);
  startCurrent.setHours(0, 0, 0, 0);

  const endPrevious = new Date(startCurrent);
  endPrevious.setDate(startCurrent.getDate() - 1);
  endPrevious.setHours(23, 59, 59, 999);
  const startPrevious = new Date(endPrevious);
  startPrevious.setDate(endPrevious.getDate() - 6);
  startPrevious.setHours(0, 0, 0, 0);

  const currentWeekXp = getXpInRange(entries, startCurrent, endCurrent);
  const previousWeekXp = getXpInRange(entries, startPrevious, endPrevious);
  const currentWeekSessions = entries.filter((entry) => {
    const date = new Date(entry.date);
    return date >= startCurrent && date <= endCurrent;
  }).length;

  if (previousWeekXp <= 0) {
    return {
      overload: false,
      currentWeekXp,
      previousWeekXp,
      ratio: 1,
      currentWeekSessions,
    };
  }

  const ratio = currentWeekXp / previousWeekXp;
  const overload = ratio >= 1.35 && currentWeekSessions >= 4;

  return {
    overload,
    currentWeekXp,
    previousWeekXp,
    ratio,
    currentWeekSessions,
  };
}

export function syncProgressionByDate(referenceDate = new Date()) {
  const previousState = getProgressionState();
  const previousLevel = getLevelFromXp(previousState.totalXp).level;
  const daysSinceUpdate = getDaysBetween(previousState.updatedAt, referenceDate);

  if (daysSinceUpdate <= 0) {
    return { progression: previousState, levelDelta: 0, daysDecayed: 0 };
  }

  const decayPerDay = 20;
  const decayedXp = Math.max(0, previousState.totalXp - daysSinceUpdate * decayPerDay);
  const levelData = getLevelFromXp(decayedXp);

  const nextState: ProgressionState = {
    ...previousState,
    totalXp: decayedXp,
    level: levelData.level,
    updatedAt: referenceDate.toISOString(),
  };

  writeJson(XP_PROGRESSION_KEY, nextState);
  return {
    progression: nextState,
    levelDelta: levelData.level - previousLevel,
    daysDecayed: daysSinceUpdate,
  };
}

export function appendWorkoutXpEntry(entry: WorkoutXpEntry) {
  const history = getXpHistory();
  const nextHistory = [entry, ...history.filter((item) => item.id !== entry.id)].slice(0, 365);
  writeJson(XP_HISTORY_KEY, nextHistory);

  const synced = syncProgressionByDate(new Date(entry.date));
  const previousState = synced.progression;
  const previousLevel = getLevelFromXp(previousState.totalXp).level;
  const effectiveXp = previousState.deloadActive ? Math.round(entry.totalXp * 0.6) : entry.totalXp;
  const totalXp = previousState.totalXp + effectiveXp;
  const levelData = getLevelFromXp(totalXp);
  const overload = detectOverload(nextHistory, new Date(entry.date));

  const nextState: ProgressionState = {
    totalXp,
    level: levelData.level,
    deloadActive: overload.overload,
    overloadDetectedAt: overload.overload ? entry.date : previousState.overloadDetectedAt,
    updatedAt: new Date().toISOString(),
  };

  writeJson(XP_PROGRESSION_KEY, nextState);
  return {
    entry: { ...entry, totalXp: effectiveXp },
    progression: nextState,
    overload,
    levelDelta: levelData.level - previousLevel,
    dateKey: toDateKey(new Date(entry.date)),
  };
}