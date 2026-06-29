import type { Exercise, Workout } from "@/lib/training-data";
import { findGameStatByDateAndContext } from "@/lib/game-stats";
import { buildGeneratedWorkout } from "@/lib/player-workout-engine";
import type { DayKey } from "@/lib/planner";
import { buildWeeklyPlan, type WeekConfig } from "@/lib/planner";
import { loadTrainingGoalsBundle } from "@/lib/training-goals";
import {
  HIDE_ALL_AUTO_WORKOUTS_ID,
  MANUAL_DAY_WORKOUTS_KEY,
  calendarBlocksTrainingForDate,
  readDailyPlanMap,
  readHiddenAutoWorkoutsMap,
  readManualDayDisabledMap,
  readManualPlanOverrides,
  storedRegenerationSignals,
  type PlannedWorkoutTag,
} from "@/lib/activity-calendar";
import { gamePlanId, isCatalogGameWorkoutId } from "@/lib/game-plan-ids";
import { spieltagCardNotes, SPIELTAG_CARD_SUBCATEGORY } from "@/lib/spieltag-defaults";
import { getWarmupWorkouts, isWarmupWorkout } from "@/lib/warmup-workouts";
import type { CachedDaySuggestion } from "@/lib/weekly-suggestions-cache";
import { readWeeklySuggestionsCache } from "@/lib/weekly-suggestions-cache";
import { sumExerciseIdsDurationMin, roundUpToNearestFive } from "@/lib/workout-duration";
import { loadExercises, loadWorkouts } from "@/lib/training-storage";

const SELECTED_WARMUP_BY_DATE_KEY = "bt.selected-warmup-by-date.v1";
const PROFILE_LOCAL_CACHE_KEY = "profile_cache_v4";

export type DayWorkoutCard = {
  id: string;
  title: string;
  sport: string;
  subcategory: string;
  notes: string;
  workoutId?: string;
  manualWorkoutId?: string;
  autoSuggestion?: CachedDaySuggestion & { exerciseIds?: string[]; exercises?: string[] };
  durationMin: number;
  kind?: "training" | "game" | "game_training";
};

export type ManualDayWorkoutEntry = {
  id: string;
  title: string;
  sport: "Basketball" | "Gym" | "Home" | "Regeneration" | "Rest";
  subcategory: string;
  notes?: string;
  exerciseIds: string[];
  durationMin?: number;
};

export type ProfilePlanEntry = {
  minutes: number;
  sessionType: string;
};

function readSelectedWarmupByDate(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(SELECTED_WARMUP_BY_DATE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function readManualWorkoutsByDate(): Record<string, ManualDayWorkoutEntry[]> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(MANUAL_DAY_WORKOUTS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, ManualDayWorkoutEntry[]>;
  } catch {
    return {};
  }
}

function buildAutoWorkoutId(dayIndex: number, sport: string) {
  if (sport === "Regeneration") return `auto-weekly-recovery-${dayIndex}`;
  return `auto-weekly-${dayIndex}`;
}

function computeWorkoutDuration(workout: Workout, exercisesById: Record<string, Exercise>) {
  return sumExerciseIdsDurationMin(workout.exerciseIds, exercisesById);
}

function buildRecoverySuggestion(day: DayKey, exercises: Exercise[]): CachedDaySuggestion & {
  exerciseIds: string[];
  exercises: string[];
} {
  const generated = buildGeneratedWorkout({
    day,
    category: "Regeneration",
    subcategory: "Mobilität & Dehnung",
    targetMinutes: 15,
    exercisePool: exercises,
  });
  return {
    title: generated.name,
    durationMin: generated.durationMin,
    notes: `Kurz-Recovery: ${generated.notes}`,
    sport: generated.category,
    subcategory: generated.subcategory,
    exerciseIds: generated.exerciseIds,
    exercises: generated.exerciseNames,
  };
}

function getGameCardsFromTags(
  dateKey: string,
  tags: PlannedWorkoutTag[],
  fallbackMinutes: number,
  sessionType?: string,
): DayWorkoutCard[] {
  const cards: DayWorkoutCard[] = [];
  const hasManualOverride = readManualPlanOverrides().has(dateKey);
  const hasSpieltag = tags.includes("Spieltag") || (!hasManualOverride && sessionType === "game");
  const hasSpieltraining = tags.includes("Spieltraining") || (!hasManualOverride && sessionType === "game-training");

  if (hasSpieltag) {
    const prep = findGameStatByDateAndContext(dateKey, "game");
    cards.push({
      id: gamePlanId(dateKey, "game"),
      title: prep?.opponentLabel?.trim() || "Spieltag",
      sport: "Basketball",
      subcategory: SPIELTAG_CARD_SUBCATEGORY,
      notes: spieltagCardNotes(prep?.notes),
      durationMin: 0,
      kind: "game",
    });
  }
  if (hasSpieltraining) {
    const prep = findGameStatByDateAndContext(dateKey, "game_training");
    cards.push({
      id: gamePlanId(dateKey, "game_training"),
      title: prep?.opponentLabel?.trim() || "Spieltraining",
      sport: "Basketball",
      subcategory: "Spieltraining",
      notes: prep?.notes?.trim() || "",
      durationMin: Math.max(0, fallbackMinutes || 45),
      kind: "game_training",
    });
  }
  return cards;
}

function isGamePlanCard(card: DayWorkoutCard) {
  return card.kind === "game" || card.kind === "game_training";
}

function stripCatalogGamePlaceholders(cards: DayWorkoutCard[]) {
  const hasPlanGame = cards.some(isGamePlanCard);
  if (!hasPlanGame) return cards;
  return cards.filter((card) => !isCatalogGameWorkoutId(card.id) && !isCatalogGameWorkoutId(card.workoutId));
}

function isRegenerationCard(card: DayWorkoutCard) {
  return card.sport === "Regeneration" || card.subcategory.toLowerCase().includes("recovery");
}

function isWarmupCard(card: DayWorkoutCard) {
  return isWarmupWorkout({
    id: card.workoutId ?? card.manualWorkoutId ?? card.id,
    name: card.title,
    category: card.sport === "Basketball" ? "Basketball" : "Gym",
    subcategory: card.subcategory,
    level: 1,
    exerciseIds: [],
  });
}

function toSuggestion(card: CachedDaySuggestion | null | undefined) {
  if (!card || card.sport === "-") return null;
  return card;
}

export function getProfilePlanEntryForDay(dayKey: DayKey): ProfilePlanEntry | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PROFILE_LOCAL_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      profile?: { favorite_position?: string | null };
      playStyle?: string;
      weekConfig?: WeekConfig;
      weeklyGoalSessions?: number;
    };
    const mesocyclePhase = loadTrainingGoalsBundle().mesocyclePhase;
    const computed = buildWeeklyPlan({
      position: parsed.profile?.favorite_position ?? "sg",
      playStyle: parsed.playStyle ?? "balanced",
      weekConfig: parsed.weekConfig ?? ({} as WeekConfig),
      weeklyGoalSessions: parsed.weeklyGoalSessions ?? 3,
      mesocyclePhase,
    });
    const entry = computed.find((item) => item.day === dayKey);
    if (!entry) return null;
    return { minutes: entry.minutes, sessionType: entry.sessionType };
  } catch {
    return null;
  }
}

export type BuildDayWorkoutCardsInput = {
  dayIndex: number;
  dateKey: string;
  dayKey: DayKey;
  suggestedWorkout?: CachedDaySuggestion | null;
  autoSuggestedWorkout?: CachedDaySuggestion | null;
  profilePlan?: ProfilePlanEntry | null;
  dayManualEntries?: ManualDayWorkoutEntry[];
  exercisesById?: Record<string, Exercise>;
  warmupCatalogWorkouts?: Workout[];
  dailyTags?: PlannedWorkoutTag[];
};

export function buildDayWorkoutCards(input: BuildDayWorkoutCardsInput): DayWorkoutCard[] {
  if (typeof window === "undefined") return [];

  const {
    dayIndex,
    dateKey,
    dayKey,
    profilePlan = null,
    dayManualEntries = readManualWorkoutsByDate()[dateKey] ?? [],
    exercisesById = Object.fromEntries(loadExercises().map((exercise) => [exercise.id, exercise])),
    warmupCatalogWorkouts = getWarmupWorkouts(loadWorkouts()),
    dailyTags = readDailyPlanMap()[dateKey] ?? [],
  } = input;

  const cacheEntry = readWeeklySuggestionsCache()[dayKey];
  const suggestedWorkout = toSuggestion(input.suggestedWorkout ?? cacheEntry?.suggested ?? null);
  const autoSuggestedWorkout = toSuggestion(
    input.autoSuggestedWorkout ?? cacheEntry?.autoSuggested ?? cacheEntry?.suggested ?? null,
  );

  const hiddenCardIds = new Set(readHiddenAutoWorkoutsMap()[dateKey] ?? []);
  const autoWorkoutsHidden = hiddenCardIds.has(HIDE_ALL_AUTO_WORKOUTS_ID);
  const isDayDisabled = readManualDayDisabledMap()[dateKey] === true;
  const calendarBlocksTraining = calendarBlocksTrainingForDate(dateKey, {
    sessionType: profilePlan?.sessionType,
    minutes: profilePlan?.minutes,
  });
  const gameCards = getGameCardsFromTags(dateKey, dailyTags, profilePlan?.minutes ?? 0, profilePlan?.sessionType);
  const hasGamePlan = gameCards.length > 0;
  const hasManualWorkout = dayManualEntries.length > 0;
  const visibleSuggestedWorkout = autoWorkoutsHidden && hasManualWorkout ? null : suggestedWorkout;
  const isRestDisplay =
    !hasManualWorkout &&
    !hasGamePlan &&
    (isDayDisabled ||
      calendarBlocksTraining ||
      (visibleSuggestedWorkout?.durationMin ?? 0) <= 0 ||
      visibleSuggestedWorkout?.sport === "-");

  let workoutCards: DayWorkoutCard[] = [];
  const shouldAddRecoveryCard =
    !isRestDisplay &&
    !calendarBlocksTraining &&
    autoSuggestedWorkout?.sport !== "Regeneration" &&
    !storedRegenerationSignals(dateKey) &&
    dayManualEntries[0]?.sport !== "Rest";

  if (dayManualEntries.length > 0) {
    dayManualEntries.forEach((manualEntry) => {
      workoutCards.push({
        id: manualEntry.id,
        title: manualEntry.title,
        sport: manualEntry.sport,
        subcategory: manualEntry.subcategory,
        notes: manualEntry.notes || "Manuell geplant.",
        manualWorkoutId: manualEntry.id,
        durationMin:
          manualEntry.durationMin ??
          (manualEntry.exerciseIds?.length
            ? sumExerciseIdsDurationMin(manualEntry.exerciseIds, exercisesById)
            : suggestedWorkout?.durationMin ?? 0),
      });
    });
  }

  if (
    autoSuggestedWorkout &&
    !hasGamePlan &&
    !isDayDisabled &&
    !autoWorkoutsHidden &&
    !calendarBlocksTraining &&
    !isCatalogGameWorkoutId(autoSuggestedWorkout.workoutId)
  ) {
    const autoWorkoutId = autoSuggestedWorkout.workoutId ?? buildAutoWorkoutId(dayIndex, autoSuggestedWorkout.sport);
    if (!hiddenCardIds.has(autoWorkoutId)) {
      workoutCards.push({
        id: autoWorkoutId,
        title: autoSuggestedWorkout.title,
        sport: autoSuggestedWorkout.sport,
        subcategory: autoSuggestedWorkout.subcategory,
        notes: autoSuggestedWorkout.notes,
        workoutId: autoWorkoutId,
        autoSuggestion: autoSuggestedWorkout.workoutId ? undefined : autoSuggestedWorkout,
        durationMin: roundUpToNearestFive(autoSuggestedWorkout.durationMin),
      });
    }
  }

  if (shouldAddRecoveryCard) {
    const recoverySuggestion = buildRecoverySuggestion(dayKey, Object.values(exercisesById));
    const recoveryCardId = `recovery-${dateKey}`;
    const recoveryWorkoutId = buildAutoWorkoutId(dayIndex, recoverySuggestion.sport);
    if (!hiddenCardIds.has(recoveryCardId)) {
      workoutCards.push({
        id: recoveryCardId,
        title: recoverySuggestion.title,
        sport: recoverySuggestion.sport,
        subcategory: recoverySuggestion.subcategory,
        notes: recoverySuggestion.notes,
        workoutId: recoveryWorkoutId,
        autoSuggestion: recoverySuggestion,
        durationMin: recoverySuggestion.durationMin,
      });
    }
  }

  if (hasGamePlan) {
    const existingWarmupCards = workoutCards.filter(isWarmupCard);
    workoutCards = workoutCards.filter((card) => !isWarmupCard(card));
    const selectedWarmupByDate = readSelectedWarmupByDate();
    const visibleWarmups = warmupCatalogWorkouts.filter((workout) => !hiddenCardIds.has(workout.id));
    const selectedWarmupId = selectedWarmupByDate[dateKey] ?? visibleWarmups[0]?.id;
    const workout = visibleWarmups.find((item) => item.id === selectedWarmupId) ?? visibleWarmups[0];
    if (workout) {
      workoutCards.push({
        id: workout.id,
        title: workout.name,
        sport: workout.category,
        subcategory: workout.subcategory,
        notes: workout.notes ?? "Warm-Up vor Spieltag/Spieltraining.",
        workoutId: workout.id,
        durationMin: computeWorkoutDuration(workout, exercisesById),
      });
    } else if (existingWarmupCards[0]) {
      workoutCards.push(existingWarmupCards[0]);
    }
  }

  if (gameCards.length > 0) {
    workoutCards.push(...gameCards.filter((card) => !hiddenCardIds.has(card.id)));
  }

  workoutCards = stripCatalogGamePlaceholders(workoutCards);

  return [...workoutCards].sort((left, right) => {
    const leftRecovery = isRegenerationCard(left);
    const rightRecovery = isRegenerationCard(right);
    if (leftRecovery === rightRecovery) return 0;
    return leftRecovery ? 1 : -1;
  });
}

function manualEntryToSuggestion(
  manualEntry: ManualDayWorkoutEntry,
  exercisesById: Record<string, Exercise>,
  fallbackMinutes: number,
): CachedDaySuggestion {
  return {
    title: manualEntry.title,
    durationMin:
      manualEntry.durationMin ??
      (manualEntry.exerciseIds?.length
        ? sumExerciseIdsDurationMin(manualEntry.exerciseIds, exercisesById)
        : fallbackMinutes),
    notes: manualEntry.notes || "Manuell geplant.",
    sport: manualEntry.sport,
    subcategory: manualEntry.subcategory,
    exerciseIds: manualEntry.exerciseIds,
    exercises: (manualEntry.exerciseIds ?? [])
      .map((exerciseId) => exercisesById[exerciseId]?.name)
      .filter((name): name is string => Boolean(name)),
  };
}

function buildProfileAutoSuggestion(
  dayKey: DayKey,
  profilePlan: ProfilePlanEntry | null,
  exercises: Exercise[],
): CachedDaySuggestion {
  if (!profilePlan || profilePlan.sessionType === "none" || profilePlan.minutes <= 0) {
    return {
      title: "Freier Tag",
      durationMin: 0,
      notes: "Heute ist ein freier Tag. Versuche trotzdem eine kleine aktive Gewohnheit zu schaffen 💪",
      sport: "-",
      subcategory: "Frei",
    };
  }
  if (profilePlan.sessionType === "recovery") {
    return buildRecoverySuggestion(dayKey, exercises);
  }
  const isGameMode =
    profilePlan.sessionType === "game" ||
    profilePlan.sessionType === "game-training" ||
    profilePlan.sessionType === "game_day" ||
    profilePlan.sessionType === "game_training";
  if (isGameMode) {
    return {
      title: profilePlan.sessionType === "game" || profilePlan.sessionType === "game_day" ? "Spieltag Warm-Up" : "Spieltraining Warm-Up",
      durationMin: profilePlan.sessionType === "game" || profilePlan.sessionType === "game_day" ? 20 : 15,
      notes: "Warm-Up vor Spieltag/Spieltraining.",
      sport: "Basketball",
      subcategory: "Warm-Up",
    };
  }
  const category = profilePlan.sessionType === "gym" ? "Gym" : "Basketball";
  const generated = buildGeneratedWorkout({
    day: dayKey,
    category,
    subcategory: category,
    targetMinutes: roundUpToNearestFive(profilePlan.minutes),
    exercisePool: exercises,
  });
  return {
    title: generated.name,
    durationMin: generated.durationMin,
    notes: generated.notes,
    sport: generated.category,
    subcategory: generated.subcategory,
    exerciseIds: generated.exerciseIds,
    exercises: generated.exerciseNames,
  };
}

function resolveDaySuggestions(
  dayKey: DayKey,
  dateKey: string,
  profilePlan: ProfilePlanEntry | null,
): { suggested: CachedDaySuggestion | null; autoSuggested: CachedDaySuggestion | null } {
  const cacheEntry = readWeeklySuggestionsCache()[dayKey];
  if (cacheEntry?.autoSuggested) {
    return {
      suggested: toSuggestion(cacheEntry.suggested ?? cacheEntry.autoSuggested),
      autoSuggested: toSuggestion(cacheEntry.autoSuggested),
    };
  }

  const exercises = loadExercises();
  const exercisesById = Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise]));
  const dayManualEntries = readManualWorkoutsByDate()[dateKey] ?? [];
  const autoSuggested = buildProfileAutoSuggestion(dayKey, profilePlan, exercises);
  const manualFirst = dayManualEntries[0];
  const suggested = manualFirst
    ? manualEntryToSuggestion(manualFirst, exercisesById, profilePlan?.minutes ?? autoSuggested.durationMin)
    : autoSuggested;

  return {
    suggested: toSuggestion(suggested),
    autoSuggested: toSuggestion(autoSuggested),
  };
}

export function isEmptyRestDayCard(card: DayWorkoutCard) {
  return (
    (card.durationMin ?? 0) <= 0 ||
    card.sport === "-" ||
    card.subcategory.toLowerCase() === "frei" ||
    card.title.toLowerCase().includes("freier tag")
  );
}

export function buildDayWorkoutCardsForToday(dayIndex: number, dateKey: string, dayKey: DayKey) {
  const profilePlan = getProfilePlanEntryForDay(dayKey);
  const { suggested, autoSuggested } = resolveDaySuggestions(dayKey, dateKey, profilePlan);
  return buildDayWorkoutCards({
    dayIndex,
    dateKey,
    dayKey,
    profilePlan,
    suggestedWorkout: suggested,
    autoSuggestedWorkout: autoSuggested,
  });
}
