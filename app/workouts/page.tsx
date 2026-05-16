"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type MetricKey } from "@/lib/training-data";
import { loadExercises, loadWorkouts } from "@/lib/training-storage";
import { appendWorkoutSession, getWorkoutSessions } from "@/lib/session-storage";
import {
  CompletedWorkoutHistoryEntry,
  type SetLog,
  type WorkoutExercise,
  type WorkoutPlan,
  WorkoutProgress,
  WORKOUT_OVERRIDE_PREFIX,
  WORKOUT_HISTORY_KEY,
  WEEKLY_WORKOUT_PLAN,
  buildSetLogKey,
  buildWorkoutStorageKey,
  getDefaultWorkoutProgress,
  getDateForWeekday,
  getTodayWorkoutPlan,
  getWorkoutPlanForDay,
  parseSetRpe,
  parseWorkoutProgress,
  toLocalDateKey,
} from "@/lib/workout";
import { appendWorkoutXpEntry } from "@/lib/level-system";

import {
  MANUAL_DAY_WORKOUTS_KEY,
  dayHasRegenerationCoverage,
  hideAutoWorkoutCardForDate,
  readManualDayDisabledMap,
  writeManualDayDisabledMap,
} from "@/lib/activity-calendar";
import { sumExerciseIdsDurationMin } from "@/lib/workout-duration";
import {
  consumeWeeklyWorkoutPayload,
  peekWeeklyWorkoutPayload,
  parseWeeklyAutoWorkoutRaw,
  type WeeklyWorkoutTransferPayload,
} from "@/lib/weekly-workout-nav";
import { buildGeneratedWorkout } from "@/lib/player-workout-engine";
import { pullProgressFromCloud, pushProgressToCloud } from "@/lib/progress-sync";
import { getTipsForWorkoutContext, loadPerformanceTips, type PerformanceTip } from "@/lib/performance-tips";
import { countTrackedSetsInLogs } from "@/lib/workout-session-metrics";
import WorkoutTimer from "@/components/WorkoutTimer";
import PerformanceTipsAccordion from "@/components/PerformanceTipsAccordion";
import {
  applyGymGoalsAfterSession,
  formatGymGoalSummary,
  getActiveGymGoalForExercise,
  loadTrainingGoalsBundle,
} from "@/lib/training-goals";

const CUSTOM_SUBCATEGORY_KEY = "bt.custom-subcategories.v1";
const MOBILE_EXERCISE_PREVIEW_COUNT = 8;

const METRIC_KEYS_BY_WORKOUT_SPORT: Partial<Record<WorkoutPlan["sport"], MetricKey[]>> = {
  Gym: ["weight", "reps"],
  Basketball: ["reps", "time", "makes", "misses", "points", "distance"],
  Home: ["reps", "time", "weight", "completed"],
  Regeneration: ["time", "distance", "reps", "completed"],
};

function filterMetricKeysForSport(sport: WorkoutPlan["sport"], keys: MetricKey[]): MetricKey[] {
  const allow = METRIC_KEYS_BY_WORKOUT_SPORT[sport];
  if (!allow) return keys;
  const next = keys.filter((key) => allow.includes(key));
  return next.length > 0 ? next : keys;
}

function newManualDayWorkoutId(editingId: string | null): string {
  if (editingId) return editingId;
  return `manual-day-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const DEFAULT_MANUAL_TITLE = "Manuelles Workout";

/**
 * Leitet einen sinnvollen Workout-Titel aus den ausgewählten Übungen ab.
 * - 1 Übung: Übungsname.
 * - Alle aus einer Subcategory: "{Subcategory} Fokus" oder "{Subcategory} Komplett" ab 4 Übungen.
 * - 2 Subcategories: "{Sub1} + {Sub2}".
 * - 3+ Subcategories: "{Category} Mix (n Übungen)".
 */
function deriveSmartWorkoutTitle(
  category: "Basketball" | "Gym" | "Home" | "Regeneration",
  exercises: ReturnType<typeof loadExercises>,
): string {
  if (exercises.length === 0) return DEFAULT_MANUAL_TITLE;
  if (exercises.length === 1) return exercises[0].name;

  const subcatCounts = new Map<string, number>();
  exercises.forEach((exercise) => {
    const sub = exercise.subcategory?.trim() || category;
    subcatCounts.set(sub, (subcatCounts.get(sub) ?? 0) + 1);
  });
  const sortedSubs = [...subcatCounts.entries()].sort((a, b) => b[1] - a[1]);
  const subcategories = sortedSubs.map(([sub]) => sub);

  if (subcategories.length === 1) {
    const sub = subcategories[0];
    if (exercises.length >= 4) return `${sub} Komplett`;
    return `${sub} Fokus`;
  }

  if (subcategories.length === 2) {
    return `${subcategories[0]} + ${subcategories[1]}`;
  }

  return `${category} Mix (${exercises.length} Übungen)`;
}

type ManualDayWorkout = {
  id: string;
  title: string;
  sport: "Basketball" | "Gym" | "Home" | "Regeneration" | "Rest";
  subcategory: string;
  notes: string;
  exerciseIds: string[];
  basketballMode?: "basketball_training" | "game_training" | "game";
  durationMin?: number;
};

type BasketballMode = "basketball_training" | "game_training" | "game";

function loadHistory(): CompletedWorkoutHistoryEntry[] {
  const rawHistory = window.localStorage.getItem(WORKOUT_HISTORY_KEY);
  if (!rawHistory) return [];
  try {
    return JSON.parse(rawHistory) as CompletedWorkoutHistoryEntry[];
  } catch {
    return [];
  }
}

function persistHistoryEntry(entry: CompletedWorkoutHistoryEntry) {
  const rawHistory = window.localStorage.getItem(WORKOUT_HISTORY_KEY);

  try {
    const parsed = rawHistory ? (JSON.parse(rawHistory) as CompletedWorkoutHistoryEntry[]) : [];
    const nextHistory = [entry, ...parsed.filter((item) => item.id !== entry.id)].slice(0, 365);
    window.localStorage.setItem(WORKOUT_HISTORY_KEY, JSON.stringify(nextHistory));
  } catch {
    window.localStorage.setItem(WORKOUT_HISTORY_KEY, JSON.stringify([entry]));
  }
}

function normalizeExerciseFamily(name: string) {
  return name
    .toLowerCase()
    .replace(/\s*-\s*(rechts|links|right|left)\b/g, "")
    .replace(/\s*[-–]?\s*\d+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildGroupedExercisesByFamily(params: {
  exerciseIds: string[];
  category: "Basketball" | "Gym" | "Home" | "Regeneration";
  subcategory: string;
  exercises: ReturnType<typeof loadExercises>;
}) {
  const baseExercises = params.exerciseIds
    .map((exerciseId) => params.exercises.find((exercise) => exercise.id === exerciseId))
    .filter((exercise): exercise is NonNullable<typeof exercise> => Boolean(exercise && exercise.category === params.category));

  const familyKeys = new Set(baseExercises.map((exercise) => normalizeExerciseFamily(exercise.name)));
  const grouped = params.exercises.filter(
    (exercise) =>
      exercise.category === params.category &&
      exercise.subcategory === params.subcategory &&
      familyKeys.has(normalizeExerciseFamily(exercise.name)),
  );

  const merged = [...baseExercises, ...grouped];
  const uniqueById = new Map(merged.map((exercise) => [exercise.id, exercise]));
  return Array.from(uniqueById.values());
}

function expandExercisesWithFamily(params: {
  selectedExerciseIds: string[];
  category: "Basketball" | "Gym" | "Home" | "Regeneration";
  subcategory?: string;
  exercises: ReturnType<typeof loadExercises>;
}) {
  const selected = params.selectedExerciseIds
    .map((exerciseId) => params.exercises.find((exercise) => exercise.id === exerciseId))
    .filter((exercise): exercise is NonNullable<typeof exercise> => Boolean(exercise && exercise.category === params.category));
  if (!selected.length) return [];
  const families = new Set(selected.map((exercise) => normalizeExerciseFamily(exercise.name)));
  const related = params.exercises.filter(
    (exercise) =>
      exercise.category === params.category &&
      (!params.subcategory || exercise.subcategory === params.subcategory) &&
      families.has(normalizeExerciseFamily(exercise.name)),
  );
  const unique = new Map([...selected, ...related].map((exercise) => [exercise.id, exercise]));
  return Array.from(unique.values());
}

function getExercisePrimaryTargetValue(exercise: ReturnType<typeof loadExercises>[number]) {
  const metricOrder: MetricKey[] = exercise.metricKeys?.length ? exercise.metricKeys : ["reps"];
  const primaryMetric: MetricKey = metricOrder[0];
  const primaryTarget = exercise.targetByMetric?.[primaryMetric];
  if (primaryTarget !== undefined) return primaryTarget;

  return (
    exercise.targetByMetric?.reps ??
    exercise.targetByMetric?.makes ??
    exercise.targetByMetric?.time ??
    exercise.targetByMetric?.points ??
    exercise.targetByMetric?.distance ??
    exercise.targetByMetric?.weight ??
    exercise.targetValue ??
    12
  );
}

function buildExerciseSets(exercise: ReturnType<typeof loadExercises>[number]) {
  const setCount = Math.max(1, exercise.setCount ?? 1);
  const perSetTargets = exercise.setTargetsByMetric ?? [];
  return Array.from({ length: setCount }, (_, index) => {
    const perSet = perSetTargets[index];
    const fallbackKg = exercise.trackingType === "weight" ? exercise.targetByMetric?.weight ?? exercise.targetValue ?? 0 : 0;
    const fallbackReps = getExercisePrimaryTargetValue(exercise);
    return {
      targetKg: perSet?.weight ?? fallbackKg,
      targetReps:
        perSet?.reps ??
        perSet?.makes ??
        perSet?.time ??
        perSet?.points ??
        fallbackReps,
    };
  });
}

function buildBasketballWarmupExerciseIds(params: {
  exercises: ReturnType<typeof loadExercises>;
  minutes: number;
}) {
  const preferredOrder = ["Handles", "Shooting", "Finishing"];
  const pool = params.exercises.filter(
    (exercise) =>
      exercise.category === "Basketball" &&
      preferredOrder.includes(exercise.subcategory),
  );
  const sorted = [...pool].sort((left, right) => {
    const leftIdx = preferredOrder.indexOf(left.subcategory);
    const rightIdx = preferredOrder.indexOf(right.subcategory);
    if (leftIdx !== rightIdx) return leftIdx - rightIdx;
    return left.name.localeCompare(right.name);
  });

  let total = 0;
  const selected: string[] = [];
  sorted.forEach((exercise) => {
    if (selected.length >= 8) return;
    if (total >= params.minutes && selected.length >= 3) return;
    selected.push(exercise.id);
    total += Math.max(5, exercise.durationMin || 10);
  });
  return selected;
}

function WorkoutsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dayParam = searchParams.get("day");
  const workoutIdParam = searchParams.get("workoutId");
  const autoWorkoutParam = searchParams.get("autoWorkout");
  const workoutPayloadIdParam = searchParams.get("workoutPayloadId");
  const manualWorkoutIdParam = searchParams.get("manualWorkoutId");
  const replaceCardIdParam = searchParams.get("replaceCardId");
  const manualParam = searchParams.get("manual");
  const selectedDay = dayParam !== null ? Number(dayParam) : null;
  const todayDayIndex = useMemo(() => new Date().getDay(), []);
  const effectiveDay = selectedDay !== null && Number.isInteger(selectedDay) ? selectedDay : todayDayIndex;
  const dateKey = useMemo(
    () => toLocalDateKey(getDateForWeekday(effectiveDay)),
    [effectiveDay],
  );
  const overrideStorageKey = `${WORKOUT_OVERRIDE_PREFIX}${dateKey}`;
  const [overrideWorkoutId, setOverrideWorkoutId] = useState<string | null>(null);
  const workoutOptions = useMemo(() => Object.values(WEEKLY_WORKOUT_PLAN), []);
  const trainingWorkouts = useMemo(() => loadWorkouts(), []);
  const trainingExercises = useMemo(() => loadExercises(), []);
  const [manualWorkout, setManualWorkout] = useState<WorkoutPlan | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualCategory, setManualCategory] = useState<"Basketball" | "Gym" | "Home" | "Regeneration">("Basketball");
  const [manualBasketballMode, setManualBasketballMode] = useState<BasketballMode>("basketball_training");
  const [manualSubcategory, setManualSubcategory] = useState("");
  const [manualSearch, setManualSearch] = useState("");
  const [manualTemplateWorkoutId, setManualTemplateWorkoutId] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [selectedManualExerciseIds, setSelectedManualExerciseIds] = useState<string[]>([]);
  const [showAllManualExercises, setShowAllManualExercises] = useState(false);
  const [showAllProgressExercises, setShowAllProgressExercises] = useState(false);
  const [manualStorageVersion, setManualStorageVersion] = useState(0);
  const [setValidationError, setSetValidationError] = useState<string | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);
  const [completionBanner, setCompletionBanner] = useState<string | null>(null);
  const [showRecoveryPrompt, setShowRecoveryPrompt] = useState(false);
  const [pendingManualEntry, setPendingManualEntry] = useState<ManualDayWorkout | null>(null);
  const [pendingStartImmediately, setPendingStartImmediately] = useState(false);
  const [performanceTips, setPerformanceTips] = useState<PerformanceTip[]>([]);
  const [showTipsReminder, setShowTipsReminder] = useState(false);
  const [customSubcategoriesByCategory, setCustomSubcategoriesByCategory] = useState<Record<"Basketball" | "Gym" | "Home" | "Regeneration", string[]>>({
    Basketball: [],
    Gym: [],
    Home: [],
    Regeneration: [],
  });
  const [weeklyTransferPayload, setWeeklyTransferPayload] = useState<WeeklyWorkoutTransferPayload | null>(null);
  const [sessionWorkout, setSessionWorkout] = useState<WorkoutPlan>(() => getTodayWorkoutPlan());
  const [progress, setProgress] = useState<WorkoutProgress>(() =>
    getDefaultWorkoutProgress(toLocalDateKey(new Date()), getTodayWorkoutPlan()),
  );
  const [selectedMetricByExercise, setSelectedMetricByExercise] = useState<Record<number, MetricKey>>({});
  const [trainingGoalsSnap, setTrainingGoalsSnap] = useState(0);

  useEffect(() => {
    setIsClientReady(true);
    void pullProgressFromCloud();
  }, []);

  useEffect(() => {
    const handler = () => setTrainingGoalsSnap((value) => value + 1);
    window.addEventListener("bt:training-goals-updated", handler);
    return () => window.removeEventListener("bt:training-goals-updated", handler);
  }, []);

  useEffect(() => {
    const refreshTips = () => setPerformanceTips(loadPerformanceTips());
    refreshTips();
    window.addEventListener("storage", refreshTips);
    window.addEventListener("focus", refreshTips);
    window.addEventListener("bt:performance-tips-updated", refreshTips);
    return () => {
      window.removeEventListener("storage", refreshTips);
      window.removeEventListener("focus", refreshTips);
      window.removeEventListener("bt:performance-tips-updated", refreshTips);
    };
  }, []);

  useEffect(() => {
    const loadCustomSubcategories = () => {
      const raw = window.localStorage.getItem(CUSTOM_SUBCATEGORY_KEY);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Partial<Record<"Basketball" | "Gym" | "Home" | "Regeneration", string[]>>;
        setCustomSubcategoriesByCategory({
          Basketball: parsed.Basketball ?? [],
          Gym: parsed.Gym ?? [],
          Home: parsed.Home ?? [],
          Regeneration: parsed.Regeneration ?? [],
        });
      } catch {
        // noop
      }
    };

    loadCustomSubcategories();
    window.addEventListener("storage", loadCustomSubcategories);
    return () => window.removeEventListener("storage", loadCustomSubcategories);
  }, []);

  useEffect(() => {
    if (!workoutPayloadIdParam) {
      setWeeklyTransferPayload(null);
      return;
    }
    setWeeklyTransferPayload(peekWeeklyWorkoutPayload(workoutPayloadIdParam));
  }, [workoutPayloadIdParam]);

  useEffect(() => {
    if (manualParam === "1" || !workoutPayloadIdParam || !weeklyTransferPayload) return;
    consumeWeeklyWorkoutPayload(workoutPayloadIdParam);
  }, [manualParam, workoutPayloadIdParam, weeklyTransferPayload]);

  const buildPlanFromWeeklyPayload = useCallback(
    (parsed: WeeklyWorkoutTransferPayload): WorkoutPlan | null => {
      const sport =
        parsed.sport === "Gym" || parsed.sport === "Home" || parsed.sport === "Regeneration"
          ? parsed.sport
          : parsed.sport === "-" || parsed.sport === "Rest"
            ? "Rest"
            : "Basketball";
      const exerciseNames = parsed.exercises?.filter(Boolean) ?? [];
      const exerciseIds = parsed.exerciseIds ?? [];
      if (!parsed.title) return null;
      if (sport === "Rest") {
        return {
          id: `auto-weekly-rest-${effectiveDay}`,
          title: parsed.title,
          sport: "Rest",
          subcategory: parsed.subcategory ?? "Keine Zeit",
          exercises: [],
        };
      }
      const hasExercises = exerciseIds.length > 0 || exerciseNames.length > 0;
      if (!hasExercises) return null;
      const autoWorkoutId =
        parsed.workoutId ??
        (sport === "Regeneration" ? `auto-weekly-recovery-${effectiveDay}` : `auto-weekly-${effectiveDay}`);

      return {
        id: autoWorkoutId,
        title: parsed.title,
        sport,
        subcategory: parsed.subcategory ?? "-",
        exercises:
          exerciseIds.length > 0
            ? exerciseIds
                .map((exerciseId) => trainingExercises.find((exercise) => exercise.id === exerciseId))
                .filter((exercise): exercise is NonNullable<typeof exercise> => Boolean(exercise))
                .map((exercise) => ({
                  name: exercise.name,
                  sets: buildExerciseSets(exercise),
                }))
            : exerciseNames.map((name) => ({
                name,
                sets: [{ targetKg: 0, targetReps: sport === "Gym" ? 8 : 20 }],
              })),
      };
    },
    [effectiveDay, trainingExercises],
  );

  const autoWorkoutFromWeekly = useMemo<WorkoutPlan | null>(() => {
    const fromTransfer = weeklyTransferPayload ? buildPlanFromWeeklyPayload(weeklyTransferPayload) : null;
    if (fromTransfer) return fromTransfer;
    const parsed = parseWeeklyAutoWorkoutRaw(autoWorkoutParam);
    if (!parsed) return null;
    return buildPlanFromWeeklyPayload(parsed);
  }, [autoWorkoutParam, buildPlanFromWeeklyPayload, weeklyTransferPayload]);

  const customWorkoutFromCatalog = useMemo<WorkoutPlan | null>(() => {
    if (!workoutIdParam) return null;
    const workout = trainingWorkouts.find((entry) => entry.id === workoutIdParam);
    if (!workout) return null;

    const groupedExercises = buildGroupedExercisesByFamily({
      exerciseIds: workout.exerciseIds,
      category: workout.category,
      subcategory: workout.subcategory,
      exercises: trainingExercises,
    });
    const exercises = groupedExercises
      .map((exercise) => {
        return {
          name: exercise.name,
          sets: buildExerciseSets(exercise),
        };
      });

    if (!exercises.length) return null;

    return {
      id: workout.id,
      title: workout.name,
      sport: workout.category === "Gym" ? "Gym" : workout.category === "Home" ? "Home" : "Basketball",
      subcategory: workout.subcategory,
      exercises,
    };
  }, [trainingExercises, trainingWorkouts, workoutIdParam]);

  const defaultWorkout = useMemo(
    () => (selectedDay !== null && Number.isInteger(selectedDay) ? getWorkoutPlanForDay(selectedDay) : getTodayWorkoutPlan()),
    [selectedDay],
  );

  const selectedOverrideWorkout = useMemo(() => {
    if (!overrideWorkoutId) return null;
    return workoutOptions.find((workout) => workout.id === overrideWorkoutId) ?? null;
  }, [overrideWorkoutId, workoutOptions]);

  const activeWorkoutBase = manualWorkout ?? selectedOverrideWorkout ?? customWorkoutFromCatalog ?? autoWorkoutFromWeekly ?? defaultWorkout;

  useEffect(() => {
    setSessionWorkout(activeWorkoutBase);
  }, [activeWorkoutBase]);

  const workoutForExecution = useMemo<WorkoutPlan>(() => sessionWorkout, [sessionWorkout]);

  const fallbackProgress = useMemo(
    () => getDefaultWorkoutProgress(dateKey, workoutForExecution),
    [dateKey, workoutForExecution],
  );

  const recommendations = useMemo(() => {
    const sessions = getWorkoutSessions();
    const now = new Date();
    const start = new Date(now);
    const dayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dayOffset);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);

    const weeklySessions = sessions.filter((session) => {
      const date = new Date(session.dateISO);
      return date >= start && date < end;
    });

    const completedExerciseIds = new Set<string>();
    weeklySessions.forEach((session) => session.logs.forEach((log) => completedExerciseIds.add(log.exerciseId)));

    const completedSubcategories = new Set(
      weeklySessions.map((session) => session.workoutSubcategory).filter(Boolean),
    );

    const targetSubcategories = ["Handles", "Shooting", "Finishing", "Conditioning", "Oberkörper", "Arme", "Core", "Beine", "Cardio", "Komplett"];
    const missingSubcategories = targetSubcategories.filter((subcategory) => !completedSubcategories.has(subcategory));

    const suggestedExercises = trainingExercises.filter(
      (exercise) =>
        missingSubcategories.includes(exercise.subcategory) &&
        !completedExerciseIds.has(exercise.id),
    );

    return { missingSubcategories, suggestedExercises };
  }, [trainingExercises]);

  const manualSubcategoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            "Komplett",
            ...trainingExercises
              .filter((exercise) => exercise.category === manualCategory)
              .map((exercise) => exercise.subcategory),
            ...(customSubcategoriesByCategory[manualCategory] ?? []),
          ],
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [customSubcategoriesByCategory, manualCategory, trainingExercises],
  );

  const manualTemplateOptions = useMemo(
    () =>
      trainingWorkouts.filter(
        (workout) =>
          workout.category === manualCategory &&
          (!manualSubcategory || workout.subcategory === manualSubcategory),
      ),
    [manualCategory, manualSubcategory, trainingWorkouts],
  );

  const manualExercisePool = useMemo(() => {
    const query = manualSearch.trim().toLowerCase();
    return trainingExercises.filter((exercise) => {
      if (exercise.category !== manualCategory) return false;
      if (manualSubcategory && exercise.subcategory !== manualSubcategory) return false;
      if (!query) return true;
      return `${exercise.name} ${exercise.subcategory}`.toLowerCase().includes(query);
    });
  }, [manualCategory, manualSearch, manualSubcategory, trainingExercises]);

  const previewAutoTitle = useMemo(() => {
    const selected = selectedManualExerciseIds
      .map((exerciseId) => trainingExercises.find((exercise) => exercise.id === exerciseId))
      .filter((exercise): exercise is NonNullable<typeof exercise> => Boolean(exercise));
    if (selected.length === 0) return "";
    return deriveSmartWorkoutTitle(manualCategory, selected);
  }, [manualCategory, selectedManualExerciseIds, trainingExercises]);
  const visibleManualExercisePool = useMemo(
    () =>
      showAllManualExercises
        ? manualExercisePool
        : manualExercisePool.slice(0, MOBILE_EXERCISE_PREVIEW_COUNT),
    [manualExercisePool, showAllManualExercises],
  );
  const visibleProgressExercises = useMemo(
    () =>
      showAllProgressExercises
        ? workoutForExecution.exercises
        : workoutForExecution.exercises.slice(0, MOBILE_EXERCISE_PREVIEW_COUNT),
    [showAllProgressExercises, workoutForExecution.exercises],
  );

  useEffect(() => {
    setShowAllManualExercises(false);
  }, [manualCategory, manualSubcategory, manualSearch]);

  useEffect(() => {
    setShowAllProgressExercises(false);
  }, [workoutForExecution.id]);

  useEffect(() => {
    const rawOverride = window.localStorage.getItem(overrideStorageKey);
    const timer = window.setTimeout(() => {
      if (rawOverride) {
        setOverrideWorkoutId(rawOverride);
      } else {
        setOverrideWorkoutId(null);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [overrideStorageKey]);

  useEffect(() => {
    if (manualParam !== "1" || manualWorkoutIdParam) return;
    if (workoutPayloadIdParam && !weeklyTransferPayload) return;

    const applyPayloadToManualForm = (parsed: WeeklyWorkoutTransferPayload) => {
      if (parsed.sport === "Gym" || parsed.sport === "Home" || parsed.sport === "Regeneration") {
        setManualCategory(parsed.sport);
      } else if (parsed.sport && parsed.sport !== "-" && parsed.sport !== "Rest") {
        setManualCategory("Basketball");
      }
      if (parsed.title) setManualTitle(parsed.title);
      if (parsed.subcategory) setManualSubcategory(parsed.subcategory);
      if (parsed.notes) setManualNotes(parsed.notes);
      if (parsed.exerciseIds?.length) setSelectedManualExerciseIds(parsed.exerciseIds);
    };

    if (weeklyTransferPayload) {
      applyPayloadToManualForm(weeklyTransferPayload);
      if (workoutPayloadIdParam) consumeWeeklyWorkoutPayload(workoutPayloadIdParam);
      return;
    }

    const parsedFromQuery = parseWeeklyAutoWorkoutRaw(autoWorkoutParam);
    if (parsedFromQuery) {
      applyPayloadToManualForm(parsedFromQuery);
      return;
    }

    if (autoWorkoutParam) {
      return;
    }
    if (workoutIdParam) {
      const template = trainingWorkouts.find((entry) => entry.id === workoutIdParam);
      if (template) {
        if (template.category === "Gym" || template.category === "Home" || template.category === "Regeneration") {
          setManualCategory(template.category);
        } else {
          setManualCategory("Basketball");
        }
        setManualTitle(template.name);
        setManualSubcategory(template.subcategory);
        setSelectedManualExerciseIds(template.exerciseIds);
      }
      return;
    }
    setManualTitle("");
    setManualCategory("Basketball");
    setManualBasketballMode("basketball_training");
    setManualSubcategory("");
    setManualSearch("");
    setManualNotes("");
    setSelectedManualExerciseIds([]);
    setManualTemplateWorkoutId("");
    setManualWorkout(null);
  }, [
    autoWorkoutParam,
    dateKey,
    manualParam,
    manualWorkoutIdParam,
    trainingWorkouts,
    weeklyTransferPayload,
    workoutIdParam,
    workoutPayloadIdParam,
  ]);

  useEffect(() => {
    void manualStorageVersion;
    if (manualParam === "1" && !manualWorkoutIdParam) return;
    const raw = window.localStorage.getItem(MANUAL_DAY_WORKOUTS_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, ManualDayWorkout[]>;
      const entries = parsed[dateKey] ?? [];
      if (!entries.length) return;
      const selected =
        (manualWorkoutIdParam
          ? entries.find((entry) => entry.id === manualWorkoutIdParam)
          : null) ?? entries[0];
      if (!selected) return;
      loadSavedManualWorkout(selected, false);
    } catch {
      // noop
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, manualParam, manualStorageVersion, manualWorkoutIdParam]);

  useEffect(() => {
    const parsed = parseWorkoutProgress(
      window.localStorage.getItem(buildWorkoutStorageKey(dateKey)),
      fallbackProgress,
    );
    const isValidForActiveWorkout =
      parsed.workoutId === fallbackProgress.workoutId &&
      parsed.date === fallbackProgress.date;

    const timer = window.setTimeout(() => {
      setProgress(isValidForActiveWorkout ? parsed : fallbackProgress);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dateKey, fallbackProgress]);

  const persistProgress = (next: WorkoutProgress) => {
    setProgress(next);
    window.localStorage.setItem(buildWorkoutStorageKey(dateKey), JSON.stringify(next));
  };

  const isGymWorkout = workoutForExecution.sport === "Gym";
  const isRestDay = workoutForExecution.sport === "Rest";
  const safeExerciseIndex = Math.min(
    Math.max(progress.exerciseIndex, 0),
    Math.max(0, workoutForExecution.exercises.length - 1),
  );
  const currentExercise = workoutForExecution.exercises[safeExerciseIndex] ?? workoutForExecution.exercises[0];
  const safeSetIndex = Math.min(
    Math.max(progress.setIndex, 0),
    Math.max(0, (currentExercise?.sets.length ?? 1) - 1),
  );
  const currentSet = currentExercise?.sets[safeSetIndex] ?? { targetKg: 0, targetReps: 0 };
  const currentLogKey = buildSetLogKey(safeExerciseIndex, safeSetIndex);
  const currentLog = progress.logs[currentLogKey] ?? { weight: "", reps: "", tries: "", makes: "", misses: "", note: "", completed: false, rpe: "" };

  const parseNonNegative = (value?: string) => {
    const parsed = Number(value ?? "");
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
  };

  const shootingRepsTotal = parseNonNegative(currentLog.reps) || parseNonNegative(currentLog.tries);

  const lastSetCompletedAtIso = useMemo(() => {
    let best = "";
    for (const log of Object.values(progress.logs)) {
      if (log?.completedAtIso && log.completedAtIso > best) {
        best = log.completedAtIso;
      }
    }
    return best || undefined;
  }, [progress.logs]);

  const exerciseMeta = useMemo(() => {
    const lookup = new Map(trainingExercises.map((exercise) => [exercise.name, exercise]));
    return workoutForExecution.exercises.map((exercise) => lookup.get(exercise.name) ?? null);
  }, [trainingExercises, workoutForExecution.exercises]);
  
  const currentExerciseMeta = exerciseMeta[safeExerciseIndex];

  const gymGoalHint = useMemo(() => {
    void trainingGoalsSnap;
    if (!isGymWorkout || !currentExerciseMeta?.id) return null;
    const bundle = loadTrainingGoalsBundle();
    if (bundle.injuryExerciseIds.includes(currentExerciseMeta.id)) {
      return { kind: "injury" as const };
    }
    const goal = getActiveGymGoalForExercise(currentExerciseMeta.id);
    return goal ? { kind: "goal" as const, goal } : null;
  }, [isGymWorkout, currentExerciseMeta?.id, trainingGoalsSnap]);

  const rawMetricOptions = (currentExerciseMeta?.metricKeys?.length ? currentExerciseMeta.metricKeys : ["reps"]) as MetricKey[];
  const currentMetricOptions = filterMetricKeysForSport(workoutForExecution.sport, rawMetricOptions);
  const activeMetric = selectedMetricByExercise[safeExerciseIndex] ?? currentMetricOptions[0];
  const tracksRepsAndMakes =
    !isGymWorkout &&
    currentMetricOptions.includes("makes") &&
    currentMetricOptions.includes("reps");
  const usesCompletedToggle = currentMetricOptions.includes("completed");

  const workoutNotes = useMemo(() => {
    const fromCatalog = customWorkoutFromCatalog ? trainingWorkouts.find((workout) => workout.id === customWorkoutFromCatalog.id)?.notes : null;
    return fromCatalog ?? null;
  }, [customWorkoutFromCatalog, trainingWorkouts]);

  const currentBasketballMode: BasketballMode = useMemo(() => {
    if (workoutForExecution.sport !== "Basketball") return "basketball_training";
    const sub = workoutForExecution.subcategory.trim().toLowerCase();
    if (sub === "spiel") return "game";
    if (sub === "spieltraining") return "game_training";
    return "basketball_training";
  }, [workoutForExecution.sport, workoutForExecution.subcategory]);

  const activePerformanceTips = useMemo(
    () =>
      getTipsForWorkoutContext({
        tips: performanceTips,
        basketballMode: currentBasketballMode,
        subcategory: workoutForExecution.subcategory,
      }),
    [currentBasketballMode, performanceTips, workoutForExecution.subcategory],
  );

  const hasSetStarted = (exerciseIndex: number, setIndex: number) => {
    const key = buildSetLogKey(exerciseIndex, setIndex);
    const log = progress.logs[key];
    if (!log) return false;
    const reps = Number(log.reps) || 0;
    const weight = Number(log.weight) || 0;
    const tries = parseNonNegative(log.reps) || parseNonNegative(log.tries);
    const makes = Number(log.makes) || 0;
    const misses = Number(log.misses) || 0;
    return reps > 0 || weight > 0 || tries > 0 || makes > 0 || misses > 0 || log.completed === true;
  };

  const getExerciseStatus = (exerciseIndex: number): "not_started" | "in_progress" | "completed" => {
    const exercise = workoutForExecution.exercises[exerciseIndex];
    const startedSets = exercise.sets.filter((_, setIndex) => hasSetStarted(exerciseIndex, setIndex)).length;
    if (startedSets <= 0) return "not_started";
    if (startedSets >= exercise.sets.length) return "completed";
    return "in_progress";
  };

  const jumpToExercise = (exerciseIndex: number) => {
    const exercise = workoutForExecution.exercises[exerciseIndex];
    const nextSetIndex = exercise.sets.findIndex((_, setIndex) => !hasSetStarted(exerciseIndex, setIndex));
    persistProgress({
      ...progress,
      exerciseIndex,
      setIndex: nextSetIndex >= 0 ? nextSetIndex : Math.max(0, exercise.sets.length - 1),
      status: progress.status === "not_started" ? "in_progress" : progress.status,
    });
  };

  const updateCurrentLog = (field: "weight" | "reps" | "tries" | "makes" | "misses" | "note", value: string) => {
    setSetValidationError(null);
    persistProgress({
      ...progress,
      logs: {
        ...progress.logs,
        [currentLogKey]: {
          ...currentLog,
          [field]: value,
        },
      },
    });
  };

  const patchCurrentLog = (patch: Partial<SetLog>) => {
    setSetValidationError(null);
    persistProgress({
      ...progress,
      logs: {
        ...progress.logs,
        [currentLogKey]: {
          ...currentLog,
          ...patch,
        },
      },
    });
  };
  const updateCompletionLog = (value: boolean) => {
    setSetValidationError(null);
    persistProgress({
      ...progress,
      logs: {
        ...progress.logs,
        [currentLogKey]: {
          ...currentLog,
          completed: value,
        },
      },
    });
  };

  const selectMetric = (metric: MetricKey) => {
    setSelectedMetricByExercise((previous) => ({ ...previous, [safeExerciseIndex]: metric }));
  };

  const toggleManualExercise = (exerciseId: string) => {
    setSelectedManualExerciseIds((previous) =>
      previous.includes(exerciseId) ? previous.filter((id) => id !== exerciseId) : [...previous, exerciseId],
    );
  };

  const moveManualExercise = (exerciseId: string, direction: "up" | "down") => {
    setSelectedManualExerciseIds((previous) => {
      const index = previous.indexOf(exerciseId);
      if (index < 0) return previous;
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= previous.length) return previous;
      const next = [...previous];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  };

  const applyTemplateWorkout = (workoutId: string) => {
    const workout = trainingWorkouts.find((entry) => entry.id === workoutId);
    if (!workout) return;
    setManualCategory(workout.category);
    setManualSubcategory(workout.subcategory);
    setManualTitle(workout.name);
    setSelectedManualExerciseIds(workout.exerciseIds);
    setManualTemplateWorkoutId(workout.id);
  };
    const buildManualWorkoutPlan = (entry: ManualDayWorkout): WorkoutPlan | null => {
    if (entry.sport === "Rest") {
      return {
        id: entry.id,
        title: entry.title,
        sport: "Rest",
        subcategory: entry.subcategory,
        exercises: [],
      };
    }
    const selectedExercises = entry.exerciseIds
      .map((exerciseId) => trainingExercises.find((exercise) => exercise.id === exerciseId))
      .filter((exercise): exercise is NonNullable<typeof exercise> => Boolean(exercise));
    if (!selectedExercises.length) return null;
    return {
      id: entry.id,
      title: entry.title,
      sport: entry.sport,
      subcategory: entry.subcategory,
      exercises: selectedExercises.map((exercise) => ({
        name: exercise.name,
        sets: buildExerciseSets(exercise),
      })),
    };
  };

  const buildAutoRecoveryEntry = (targetDateKey: string): ManualDayWorkout | null => {
    const generated = buildGeneratedWorkout({
      day: "monday",
      category: "Regeneration",
      subcategory: "Mobilität & Dehnung",
      targetMinutes: 15,
      exercisePool: trainingExercises,
    });

    if (!generated.exerciseIds.length) return null;

    return {
      id: `auto-recovery-${targetDateKey}-${Date.now()}`,
      title: generated.name,
      sport: "Regeneration",
      subcategory: generated.subcategory,
      notes: generated.notes,
      exerciseIds: generated.exerciseIds,
    };
  };

  const applyRecoverySuggestionChoice = (
    choice: "none" | "today" | "tomorrow",
    store: Record<string, ManualDayWorkout[]>,
  ) => {
    const dailyRaw = window.localStorage.getItem("bt.daily-plan.v1");
    const daily = dailyRaw ? (JSON.parse(dailyRaw) as Record<string, string[]>) : {};
    const baseDate = new Date(`${dateKey}T00:00:00`);
    if (choice === "tomorrow") {
      baseDate.setDate(baseDate.getDate() + 1);
    }
    if (choice !== "none") {
      const targetDateKey = toLocalDateKey(baseDate);
      const nextTags = new Set([...(daily[targetDateKey] ?? []), "Regeneration", "Recovery:Mobilität & Dehnung"]);
      daily[targetDateKey] = Array.from(nextTags);
      const existing = store[targetDateKey] ?? [];
      const hasRecovery = existing.some((entry) => entry.sport === "Regeneration");
      if (!hasRecovery) {
        const recoveryEntry = buildAutoRecoveryEntry(targetDateKey);
        if (recoveryEntry) {
          store[targetDateKey] = [recoveryEntry, ...existing];
        }
      }
      window.localStorage.setItem("bt.daily-plan.v1", JSON.stringify(daily));
    }
  };

    const persistManualWorkoutForDay = (entry: ManualDayWorkout, startImmediately: boolean, recoveryChoice: "none" | "today" | "tomorrow") => {

    const raw = window.localStorage.getItem(MANUAL_DAY_WORKOUTS_KEY);
    let store: Record<string, ManualDayWorkout[]> = {};
    if (raw) {
      try {
        store = JSON.parse(raw) as Record<string, ManualDayWorkout[]>;
      } catch {
        store = {};
      }
    }
    if (entry.sport !== "Regeneration") {
      applyRecoverySuggestionChoice(recoveryChoice, store);
    }
    const existingForDate = store[dateKey] ?? [];
    const isReplacingAutoCard = Boolean(replaceCardIdParam && !manualWorkoutIdParam);
    if (replaceCardIdParam) {
      hideAutoWorkoutCardForDate(dateKey, replaceCardIdParam);
    }
    store[dateKey] = isReplacingAutoCard
      ? [entry]
      : [
          entry,
          ...existingForDate.filter((item) => item.id !== manualWorkoutIdParam && item.id !== entry.id),
        ];

    window.localStorage.setItem(MANUAL_DAY_WORKOUTS_KEY, JSON.stringify(store));
    window.dispatchEvent(new Event("bt:plan-updated"));

    const disabledMap = readManualDayDisabledMap();
    if (disabledMap[dateKey]) {
      const nextDisabled = { ...disabledMap };
      delete nextDisabled[dateKey];
      writeManualDayDisabledMap(nextDisabled);
    }
    const selectedMinutes = entry.exerciseIds.reduce((sum, exerciseId) => {
      const exercise = trainingExercises.find((entry) => entry.id === exerciseId);
      return sum + (exercise?.durationMin ?? 10);
    }, 0);

    syncProfileDayConfig(effectiveDay, entry.sport, Math.ceil(selectedMinutes * 1.1 / 5) * 5);
    setManualStorageVersion((previous) => previous + 1);
    loadSavedManualWorkout(entry, false);

    if (startImmediately) {
      const plan = buildManualWorkoutPlan(entry);
      if (plan) {
        setManualWorkout(plan);
      }
      router.replace(`/workouts?day=${effectiveDay}`);
      return;
    }

    router.push("/Weekly-Workout");
  };
  const saveManualWorkoutForDay = (startImmediately: boolean) => {
    const isBasketball = manualCategory === "Basketball";
    const isStructuredBasketball = isBasketball && manualBasketballMode !== "basketball_training";
    const generatedIds = isStructuredBasketball
      ? buildBasketballWarmupExerciseIds({
          exercises: trainingExercises,
          minutes: manualBasketballMode === "game" ? 60 : 30,
        })
      : [];
    const sourceExerciseIds = isStructuredBasketball ? generatedIds : selectedManualExerciseIds;
    if (sourceExerciseIds.length <= 0) return;
    const selectedExercises = expandExercisesWithFamily({
      selectedExerciseIds: sourceExerciseIds,
      category: manualCategory,
      subcategory: isStructuredBasketball ? undefined : manualSubcategory || undefined,
      exercises: trainingExercises,
    });

    const selectedOrder = new Map(sourceExerciseIds.map((id, index) => [id, index]));
    const orderedExerciseIds = selectedExercises
      .sort((left, right) => {
        const leftIndex = selectedOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = selectedOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        return left.name.localeCompare(right.name);
      })
      .map((exercise) => exercise.id);

    const trimmedManualTitle = manualTitle.trim();
    const userProvidedTitle =
      trimmedManualTitle.length > 0 && trimmedManualTitle !== DEFAULT_MANUAL_TITLE
        ? trimmedManualTitle
        : "";
    const autoDerivedTitle = deriveSmartWorkoutTitle(manualCategory, selectedExercises);

    const exercisesById = Object.fromEntries(trainingExercises.map((exercise) => [exercise.id, exercise]));
    const durationMin = sumExerciseIdsDurationMin(orderedExerciseIds, exercisesById);

    const nextEntry: ManualDayWorkout = {
      id: newManualDayWorkoutId(manualWorkoutIdParam),
      durationMin,
      title:
        isStructuredBasketball
          ? manualBasketballMode === "game"
            ? "Spiel Warmup"
            : "Spieltraining Warmup"
          : userProvidedTitle || autoDerivedTitle,
      sport: manualCategory,
      subcategory:
        isStructuredBasketball
          ? manualBasketballMode === "game"
            ? "Spiel"
            : "Spieltraining"
          : manualSubcategory.trim() || selectedExercises[0]?.subcategory || "Keine Zeit",
      notes: manualNotes.trim(),
      exerciseIds: orderedExerciseIds,
      basketballMode: isBasketball ? manualBasketballMode : undefined,
    };

    if (manualCategory !== "Regeneration") {
      if (dayHasRegenerationCoverage(dateKey)) {
        persistManualWorkoutForDay(nextEntry, startImmediately, "none");
        return;
      }
      setPendingManualEntry(nextEntry);
      setPendingStartImmediately(startImmediately);
      setShowRecoveryPrompt(true);
      return;
    }

    persistManualWorkoutForDay(nextEntry, startImmediately, "none");
  };

  function loadSavedManualWorkout(entry: ManualDayWorkout, shouldRoute = true) {
  setOverrideWorkoutId(null);
  window.localStorage.removeItem(overrideStorageKey);

  if (entry.sport === "Rest") {
    setManualTitle(entry.title);
    setManualSubcategory(entry.subcategory);
    setSelectedManualExerciseIds([]);
    setManualWorkout({
      id: entry.id,
      title: entry.title,
      sport: "Rest",
      subcategory: entry.subcategory,
      exercises: [],
    });
    return;
  }

  setManualCategory(entry.sport); // jetzt typ-sicher: kein "Rest" mehr möglich
  if (entry.sport === "Basketball") {
    setManualBasketballMode(entry.basketballMode ?? "basketball_training");
  }
  setManualSubcategory(entry.subcategory);
  setManualTitle(entry.title);
  setSelectedManualExerciseIds(entry.exerciseIds);

  const plannedWorkout = buildManualWorkoutPlan(entry);
  if (!plannedWorkout) return;
  setManualWorkout(plannedWorkout);

  if (shouldRoute) {
    router.push("/Weekly-Workout");
  }
  }

  const syncProfileDayConfig = (
    dayIndex: number,
    category: "Basketball" | "Gym" | "Home" | "Regeneration" | "Rest",
    minutes: number,
  ) => {
    const dayMap: Record<number, "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday"> = {
      0: "sunday",
      1: "monday",
      2: "tuesday",
      3: "wednesday",
      4: "thursday",
      5: "friday",
      6: "saturday",
    };
    const dayKey = dayMap[((dayIndex % 7) + 7) % 7];
    const rawProfileCache = window.localStorage.getItem("profile_cache_v4");
    if (!rawProfileCache || !dayKey) return;
    try {
      const parsed = JSON.parse(rawProfileCache) as {
        weekConfig?: Record<string, { mode: string; minutes: number }>;
      };
      const currentWeek = parsed.weekConfig ?? {};
      const nextMode =
        category === "Gym"
          ? "gym"
          : category === "Rest"
            ? "unavailable"
             : category === "Basketball"
              ? "basketball_training"
              : category === "Regeneration"
                ? "recovery"
                : "custom";
      parsed.weekConfig = {
        ...currentWeek,
        [dayKey]: {
          mode: nextMode,
          minutes: Math.max(0, Math.round(minutes)),
        },
      };
      window.localStorage.setItem("profile_cache_v4", JSON.stringify(parsed));
      window.dispatchEvent(new Event("bt:plan-updated"));
    } catch {
      // noop
    }
  };

  const addSetToCurrentExercise = () => {
    if (!currentExercise) return;
    const baseSet = currentExercise.sets[safeSetIndex] ?? currentExercise.sets[currentExercise.sets.length - 1] ?? { targetKg: 0, targetReps: 0 };
    setSessionWorkout((previous) => {
      const nextExercises: WorkoutExercise[] = previous.exercises.map((exercise, index) => {
        if (index !== safeExerciseIndex) return exercise;
        return {
          ...exercise,
          sets: [...exercise.sets, { ...baseSet }],
        };
      });
      return {
        ...previous,
        exercises: nextExercises,
      };
    });
  };

  const jumpToSet = (setIndex: number) => {
    const nowIso = new Date().toISOString();
    persistProgress({
      ...progress,
      setIndex,
      status: progress.status === "not_started" ? "in_progress" : progress.status,
      startedAtIso: progress.status === "not_started" ? (progress.startedAtIso ?? nowIso) : progress.startedAtIso,
    });
  };

  const startWorkout = () => {
    if (activePerformanceTips.length > 0 && workoutForExecution.sport === "Basketball") {
      setShowTipsReminder(true);
      return;
    }
    persistProgress({
      ...progress,
      status: "in_progress",
      startedAtIso: progress.startedAtIso ?? new Date().toISOString(),
    });
  };
  const completeWorkout = () => {
    const completedProgress: WorkoutProgress = {
      ...progress,
      status: "completed",
      endedAtIso: new Date().toISOString(),
    };
    persistProgress(completedProgress);

    const nowIso = new Date().toISOString();
    const sessionLogs = workoutForExecution.exercises.flatMap((exercise, exerciseIndex) => {
      const exerciseDef = trainingExercises.find((item) => item.name === exercise.name);
      if (!exerciseDef) return [];
      return exercise.sets.map((_, setIndex) => {
        const log = completedProgress.logs[buildSetLogKey(exerciseIndex, setIndex)];
        const makes = parseNonNegative(log?.makes);
        const repsTotal = parseNonNegative(log?.reps);
        const triesLegacy = parseNonNegative(log?.tries);
        const misses = parseNonNegative(log?.misses);
        const computedTries = repsTotal > 0 ? repsTotal : triesLegacy > 0 ? triesLegacy : makes + misses;
        const computedMisses = computedTries > 0 ? Math.max(0, computedTries - makes) : misses;
        const fallbackReps = parseNonNegative(log?.reps);
        const usesCompletionFlag = exerciseDef.metricKeys.includes("completed");
        const isCompleted = usesCompletionFlag ? log?.completed === true : true;
        const completedValue = !isCompleted ? null : makes > 0 ? makes : fallbackReps > 0 ? fallbackReps : null;
        const rpe = parseSetRpe(log?.rpe);
        return {
          exerciseId: exerciseDef.id,
          completedValue,
          note: (log?.note ?? "").trim(),
          made: makes > 0 ? makes : null,
          misses: computedMisses > 0 ? computedMisses : null,
          attempts: computedTries > 0 ? computedTries : null,
          weightKg: parseNonNegative(log?.weight) || null,
          completed: isCompleted,
          rpe: rpe ?? null,
        };
      });
    });

    const historyEntry: CompletedWorkoutHistoryEntry = {
      id: `${completedProgress.date}-${completedProgress.workoutId}`,
      date: completedProgress.date,
      workoutId: completedProgress.workoutId,
      title: completedProgress.title,
      sport: completedProgress.sport,
      subcategory: completedProgress.subcategory,
      totalSets: countTrackedSetsInLogs(sessionLogs),
      totalReps: sessionLogs.reduce((sum, log) => sum + Math.max(0, log.completedValue ?? log.made ?? 0), 0),
      totalVolumeKg: sessionLogs.reduce(
        (sum, log) =>
          sum + Math.max(0, log.completedValue ?? log.made ?? 0) * Math.max(0, log.weightKg ?? 0),
        0,
      ),
    };

    persistHistoryEntry(historyEntry);

    if (sessionLogs.length > 0) {
      const rpeSamples = sessionLogs.map((l) => l.rpe).filter((v): v is number => typeof v === "number");
      const avgRpe =
        rpeSamples.length > 0 ? Math.round((rpeSamples.reduce((a, b) => a + b, 0) / rpeSamples.length) * 10) / 10 : null;
      const startMs = completedProgress.startedAtIso ? new Date(completedProgress.startedAtIso).getTime() : NaN;
      const endMs = completedProgress.endedAtIso ? new Date(completedProgress.endedAtIso).getTime() : NaN;
      const durationSeconds =
        Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
          ? Math.max(60, Math.round((endMs - startMs) / 1000))
          : Math.max(300, sessionLogs.length * 180);

      const sessionEntry = {
        id: `ws-${Date.now()}-${completedProgress.workoutId}`,
        dateISO: new Date(`${dateKey}T12:00:00`).toISOString(),
        workoutId: completedProgress.workoutId,
        workoutName: completedProgress.title,
        workoutCategory: completedProgress.sport,
        workoutSubcategory: completedProgress.subcategory,
        sessionNotes: "",
        durationSeconds,
        avgRpe,
        logs: sessionLogs,
      };
      appendWorkoutSession(sessionEntry);
      if (completedProgress.sport === "Gym") {
        applyGymGoalsAfterSession(sessionEntry);
      }
    }
    let achievedSets = 0;
    let totalSets = 0;
    let completedSetCount = 0;
    const completedExercises = new Set<number>();
    workoutForExecution.exercises.forEach((exercise, exerciseIndex) => {
      const exerciseDef = trainingExercises.find((item) => item.name === exercise.name);
      const usesCompletionFlag = Boolean(exerciseDef?.metricKeys.includes("completed"));
      exercise.sets.forEach((set, setIndex) => {
        totalSets += 1;
        const log = completedProgress.logs[buildSetLogKey(exerciseIndex, setIndex)];
        const reps = Number(log?.reps) || 0;
        const makes = Number(log?.makes) || 0;
        const weight = Number(log?.weight) || 0;
        const tries = parseNonNegative(log?.reps) || parseNonNegative(log?.tries);
        const misses = Number(log?.misses) || 0;
        const setCompleted = log?.completed ?? true;
        const effectiveReps = makes > 0 ? makes : reps;
        const repsMet = effectiveReps >= set.targetReps;
        const weightMet = set.targetKg <= 0 || weight >= set.targetKg;
        const completionCounted = usesCompletionFlag && log?.completed === true;
        if (
          setCompleted &&
          (effectiveReps > 0 || weight > 0 || tries > 0 || misses > 0 || makes > 0 || completionCounted)
        ) {
          completedSetCount += 1;
          completedExercises.add(exerciseIndex);
        }
        if (setCompleted && repsMet && weightMet) {
          achievedSets += 1;
        }
      });
    });

    const qualityScore = totalSets > 0 ? achievedSets / totalSets : 0;
    const completedMinutes = workoutForExecution.exercises.reduce((sum, workoutExercise, exerciseIndex) => {
      const meta = exerciseMeta[exerciseIndex];
      const exerciseDef = trainingExercises.find((item) => item.name === workoutExercise.name);
      const usesCompletionFlag = Boolean(exerciseDef?.metricKeys.includes("completed"));
      const anyCompleted = workoutExercise.sets.some((_, setIndex) => {
        const log = completedProgress.logs[buildSetLogKey(exerciseIndex, setIndex)];
        const reps = Number(log?.reps) || 0;
        const makes = Number(log?.makes) || 0;
        const weight = Number(log?.weight) || 0;
        const tries = parseNonNegative(log?.reps) || parseNonNegative(log?.tries);
        const misses = Number(log?.misses) || 0;
        return (
          (log?.completed ?? true) &&
          (reps > 0 ||
            makes > 0 ||
            weight > 0 ||
            tries > 0 ||
            misses > 0 ||
            (usesCompletionFlag && log?.completed === true))
        );
      });
      if (!anyCompleted) return sum;
      return sum + Math.max(1, meta?.durationMin ?? 8);
    }, 0);
    const targetMakes = workoutForExecution.exercises.reduce((sum, _, exerciseIndex) => {
      const meta = exerciseMeta[exerciseIndex];
      return sum + Math.max(0, meta?.targetByMetric?.makes ?? 0);
    }, 0);
    const actualMakes = workoutForExecution.exercises.reduce((sum, exercise, exerciseIndex) => {
      return (
        sum +
        exercise.sets.reduce((inner, _, setIndex) => {
          const log = completedProgress.logs[buildSetLogKey(exerciseIndex, setIndex)];
          return inner + (Number(log?.makes) || 0);
        }, 0)
      );
    }, 0);
    const percentFactor = targetMakes > 0 ? Math.min(1.5, Math.max(0.5, actualMakes / targetMakes)) : 1;
    const durationFactor = Math.min(2, Math.max(1, completedMinutes / 20));
    const completedExerciseCount = Math.min(completedExercises.size, completedSetCount);
    const completedWorkoutCount = completedExerciseCount > 0 ? 1 : 0;
    const boundedWorkoutCount = Math.min(completedWorkoutCount, completedExerciseCount, completedSetCount);
    const exerciseXp = Math.round(completedExerciseCount * 12 * durationFactor);
    const workoutXp = boundedWorkoutCount > 0 ? Math.round((20 + qualityScore * 30) * percentFactor) : 0;
    const regenerationEntries = loadHistory().filter((entry) => entry.sport === "Regeneration").slice(-7);
    const regenerationLoad = regenerationEntries.reduce((sum, entry) => sum + Math.max(1, entry.totalSets || 1), 0);
    const recoveryMultiplier = Math.min(1.25, 1 + regenerationLoad / 50);
    const totalXp = Math.round((exerciseXp + workoutXp) * recoveryMultiplier);

    const xpResult = appendWorkoutXpEntry({
      id: `${completedProgress.date}-${completedProgress.workoutId}`,
      date: completedProgress.date,
      workoutId: completedProgress.workoutId,
      workoutTitle: completedProgress.title,
      exerciseXp,
      workoutXp,
      totalXp,
      achievedSets: Math.min(achievedSets, completedSetCount),
      totalSets: Math.max(1, completedSetCount),
      qualityScore,
    });

    if (xpResult.levelDelta > 0) {
      window.alert(`🎉 Level-Up! +${xpResult.levelDelta} Level`);
    } else if (xpResult.levelDelta < 0) {
      window.alert(`⬇️ Level-Down: ${Math.abs(xpResult.levelDelta)} Level verloren`);
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = toLocalDateKey(tomorrow);
    const todayKey = toLocalDateKey(new Date());
    const dailyRaw = window.localStorage.getItem("bt.daily-plan.v1");
    const daily = dailyRaw ? JSON.parse(dailyRaw) as Record<string, string[]> : {};
    const tomorrowHasRecovery = (daily[tomorrowKey] ?? []).some((tag) => tag === "Regeneration");
    const todayIsRecoveryOnly = completedProgress.sport === "Regeneration";
    if (!todayIsRecoveryOnly && !tomorrowHasRecovery) {
      const todayTags = new Set([...(daily[todayKey] ?? []), "Regeneration", "Recovery:Mobilität & Dehnung"]);
      daily[todayKey] = Array.from(todayTags);
      window.localStorage.setItem("bt.daily-plan.v1", JSON.stringify(daily));
      setCompletionBanner("Stark! Workout abgeschlossen ✅ Regeneration wurde für heute hinzugefügt.");
    } else {
      setCompletionBanner("Stark! Workout abgeschlossen ✅");
    }
    void pushProgressToCloud();
    router.push("/stats");
  };

  const finishSet = () => {
    if (tracksRepsAndMakes) {
      const makes = parseNonNegative(currentLog.makes);
      const triesInput = shootingRepsTotal;
      if (triesInput > 0 && makes > triesInput) {
        setSetValidationError("Makes dürfen nicht größer als Reps sein.");
        return;
      }
      if (makes > 0 && triesInput <= 0) {
        setSetValidationError("Bitte auch Reps angeben, damit die Quote berechnet werden kann.");
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const updatedLog = { ...currentLog, completedAtIso: nowIso };
    const updatedLogs = { ...progress.logs, [currentLogKey]: updatedLog };
    const isLastSetInExercise = safeSetIndex === currentExercise.sets.length - 1;
    const isLastExercise = safeExerciseIndex === workoutForExecution.exercises.length - 1;

    if (isLastExercise && isLastSetInExercise) {
      const next: WorkoutProgress = {
        ...progress,
        logs: updatedLogs,
        status: "completed",
        endedAtIso: nowIso,
      };
      persistProgress(next);
      completeWorkout();
      return;
    }

    if (isLastSetInExercise) {
      persistProgress({
        ...progress,
        logs: updatedLogs,
        exerciseIndex: safeExerciseIndex + 1,
        setIndex: 0,
        status: "in_progress",
        startedAtIso: progress.startedAtIso ?? nowIso,
      });
      return;
    }

    persistProgress({
      ...progress,
      logs: updatedLogs,
      setIndex: safeSetIndex + 1,
      status: "in_progress",
      startedAtIso: progress.startedAtIso ?? nowIso,
    });
  };

  if (!isClientReady) {
    return <main className="app-container">Workouts werden geladen…</main>;
  }

  return (
    <main className="app-container animate-in">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="page-eyebrow">Training</p>
          <h1 className="page-title">Workout</h1>
          <p className="page-subtitle">Hier planst und startest du dein Training.</p>
          <p className="mt-1 text-xs text-emerald-300">XP-Multiplikator steigt durch Regeneration (gedeckelt).</p>
        </div>
        <Link href="/tips" className="btn btn-ghost btn-sm">Tipps &amp; Notizen</Link>
      </header>
      {activePerformanceTips.length > 0 && workoutForExecution.sport === "Basketball" ? (
        <section className="mt-3 rounded-xl border border-cyan-700 bg-cyan-950/30 p-3">
          <p className="text-xs uppercase tracking-wide text-cyan-300">Aktive Fokus-Tipps</p>
          <PerformanceTipsAccordion tips={activePerformanceTips} basketballMode={currentBasketballMode} className="mt-2" />
        </section>
      ) : null}
      {manualParam !== "1" ? (

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-xl font-semibold">{workoutForExecution.title}</h2>
        <p className="mt-1 text-sm text-zinc-400">Sport: {workoutForExecution.sport}</p>
        <p className="mt-1 text-sm text-zinc-400">Unterkategorie: {workoutForExecution.subcategory}</p>
        {workoutNotes ? <p className="mt-1 text-sm text-zinc-500">Notiz: {workoutNotes}</p> : null}

        {effectiveDay === todayDayIndex && !manualWorkout && !workoutIdParam && !autoWorkoutParam && !manualWorkoutIdParam && manualParam !== "1" ? (
          <label className="mt-3 block text-sm text-zinc-300">
            Heutiges Workout manuell wählen
            <select
              value={selectedOverrideWorkout?.id ?? defaultWorkout.id}
              onChange={(event) => {
                const nextWorkoutId = event.target.value;
                const nextIsDefault = nextWorkoutId === defaultWorkout.id;
                const nextOverride = nextIsDefault ? null : nextWorkoutId;
                setOverrideWorkoutId(nextOverride);
                if (nextOverride) {
                  window.localStorage.setItem(overrideStorageKey, nextOverride);
                } else {
                  window.localStorage.removeItem(overrideStorageKey);
                }
                const nextWorkout =
                  workoutOptions.find((workout) => workout.id === nextWorkoutId) ?? defaultWorkout;
                persistProgress(getDefaultWorkoutProgress(dateKey, nextWorkout));
              }}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            >
              {workoutOptions.map((workout) => (
                <option key={workout.id} value={workout.id}>
                  {workout.title} ({workout.sport} • {workout.subcategory})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-zinc-500">
              Bei Änderung wird das heutige Protokoll zurückgesetzt und neue Zukunfts-Vorschläge angepasst.
            </p>
          </label>
        ) : null}
        {effectiveDay === todayDayIndex && manualWorkout ? (
          <p className="mt-3 text-xs text-emerald-300">
            Manuelles Workout für heute aktiv. Die Standard-Auswahl ist ausgeblendet.
          </p>
        ) : null}
      </section>
      ) : null}

      {manualParam === "1" ? (
        <section className="mt-4 app-card">
          <p className="section-eyebrow">
            {manualWorkoutIdParam || replaceCardIdParam ? "Workout bearbeiten" : "Workout planen"}
          </p>
          <h2 className="section-title mt-1">
            {manualWorkoutIdParam || replaceCardIdParam ? "Plan anpassen" : "Manuelles Workout"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {manualWorkoutIdParam || replaceCardIdParam
              ? "Speichern ersetzt das bisherige Workout an diesem Tag — es wird kein zweites angelegt."
              : "Wähle Übungen und speichere den Tag im Weekly-Plan."}
          </p>
          <p className="mt-2 text-xs text-faint">
            Fehlende Unterkategorien diese Woche: {recommendations.missingSubcategories.join(", ") || "keine"}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select
              value={manualCategory}
              onChange={(event) => {
                const nextCategory = event.target.value as "Basketball" | "Gym" | "Home" | "Regeneration";
                setManualCategory(nextCategory);
                if (nextCategory === "Basketball") {
                  setManualBasketballMode("basketball_training");
                }
                setManualSubcategory("");
                setManualTemplateWorkoutId("");
                setSelectedManualExerciseIds([]);
              }}
              className="input w-full"
            >
              <option value="Basketball">Basketball</option>
              <option value="Gym">Gym</option>
              <option value="Home">Home</option>
              <option value="Regeneration">Regeneration</option>
            </select>
            {manualCategory === "Basketball" ? (
              <select
                value={manualBasketballMode}
                onChange={(event) => setManualBasketballMode(event.target.value as BasketballMode)}
                className="input w-full"
              >
                <option value="basketball_training">Basketball-Training</option>
                <option value="game_training">Spieltraining (30 Min Warmup)</option>
                <option value="game">Spiel (60 Min Warmup)</option>
              </select>
            ) : null}
            {manualCategory === "Basketball" && manualBasketballMode !== "basketball_training" ? (
              <p className="sm:col-span-2 text-xs text-emerald-300">
                Warmup wird automatisch erstellt: Handles + Shooting + Finishing.
              </p>
            ) : (
            <select
              value={manualSubcategory}
              onChange={(event) => setManualSubcategory(event.target.value)}
              className="input w-full"
            >
              <option value="">Kein fester Schwerpunkt</option>
              {manualSubcategoryOptions.map((subcategory) => (
                <option key={subcategory} value={subcategory}>
                  {subcategory}
                </option>
              ))}
            </select>
            )}
          </div>
          {manualCategory === "Basketball" && manualBasketballMode !== "basketball_training" ? null : (
          <select
            value={manualTemplateWorkoutId}
            onChange={(event) => applyTemplateWorkout(event.target.value)}
            className="input mt-2 w-full"
          >
            <option value="">Workout-Template optional wählen</option>
            {manualTemplateOptions.map((workout) => (
              <option key={workout.id} value={workout.id}>
                {workout.name}
              </option>
            ))}
          </select>
          )}
          <input
            value={manualTitle}
            onChange={(event) => setManualTitle(event.target.value)}
            className="input mt-3 w-full"
            placeholder={previewAutoTitle ? `Auto: ${previewAutoTitle}` : "Workout-Name (leer = Auto-Name)"}
          />
          {previewAutoTitle && (!manualTitle.trim() || manualTitle.trim() === DEFAULT_MANUAL_TITLE) ? (
            <p className="mt-1 text-xs text-emerald-300">
              ✨ Auto-Name wird verwendet: <span className="font-semibold">{previewAutoTitle}</span>
            </p>
          ) : null}
          <textarea
            value={manualNotes}
            onChange={(event) => setManualNotes(event.target.value)}
            className="input mt-2 w-full"
            placeholder="Notizen"
            rows={2}
          />
          {manualCategory === "Basketball" && manualBasketballMode !== "basketball_training" ? null : (
          <>
            <input
              value={manualSearch}
              onChange={(event) => setManualSearch(event.target.value)}
              className="input mt-3 w-full"
              placeholder="Exercise suchen..."
            />
            <div className="mt-3 max-h-48 space-y-2 overflow-auto rounded-lg border border-zinc-700 p-2">
              {visibleManualExercisePool.map((exercise) => (
                <label key={exercise.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedManualExerciseIds.includes(exercise.id)}
                    onChange={() => toggleManualExercise(exercise.id)}
                  />
                  <span>{exercise.name} <span className="text-zinc-500">({exercise.subcategory})</span></span>
                </label>
              ))}
            </div>
            {manualExercisePool.length > MOBILE_EXERCISE_PREVIEW_COUNT ? (
              <button
                type="button"
                onClick={() => setShowAllManualExercises((current) => !current)}
                className="mt-2 rounded-lg border border-zinc-600 px-3 py-1 text-xs text-zinc-200"
              >
                {showAllManualExercises ? "Weniger anzeigen" : `Mehr anzeigen (${manualExercisePool.length - MOBILE_EXERCISE_PREVIEW_COUNT})`}
              </button>
            ) : null}
            {selectedManualExerciseIds.length > 0 ? (
              <div className="mt-2 space-y-2 rounded-lg border border-zinc-700 p-2">
                <p className="text-xs text-zinc-400">Reihenfolge festlegen</p>
                {selectedManualExerciseIds.map((exerciseId, index) => {
                  const exercise = trainingExercises.find((entry) => entry.id === exerciseId);
                  if (!exercise) return null;
                  return (
                    <div key={`order-${exerciseId}`} className="flex items-center justify-between text-sm">
                      <span>{index + 1}. {exercise.name}</span>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => moveManualExercise(exerciseId, "up")} className="rounded border border-zinc-600 px-2 py-1 text-xs">↑</button>
                        <button type="button" onClick={() => moveManualExercise(exerciseId, "down")} className="rounded border border-zinc-600 px-2 py-1 text-xs">↓</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => saveManualWorkoutForDay(false)} className="btn btn-ghost btn-sm flex-1">
              {manualWorkoutIdParam || replaceCardIdParam ? "Änderungen speichern" : "Für diesen Tag speichern"}
            </button>
            <button type="button" onClick={() => saveManualWorkoutForDay(true)} className="btn btn-primary btn-sm flex-1">
              Speichern & starten
            </button>
            <Link href="/Weekly-Workout" className="btn btn-ghost btn-sm flex-1 text-center">
              Abbrechen
            </Link>
          </div>
        </section>
      ) : null}

      {manualParam !== "1" && progress.status === "completed" ? (
        <section className="mt-4 rounded-2xl border border-emerald-700 bg-emerald-950/40 p-4 text-emerald-200">
          Workout abgeschlossen. Sehr stark! ✅
        </section>
      ) : null}
      {completionBanner ? (
        <section className="mt-4 rounded-2xl border border-cyan-700 bg-cyan-950/40 p-4 text-cyan-100">
          {completionBanner}
        </section>
      ) : null}

      {manualParam !== "1" ? (
        <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-3">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Workout-Fortschritt</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {visibleProgressExercises.map((exercise, index) => {
                const status = getExerciseStatus(index);
                const isActive = index === safeExerciseIndex;
                const badgeClass =
                  status === "completed"
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-200"
                    : status === "in_progress"
                      ? "border-amber-500 bg-amber-500/20 text-amber-200"
                      : "border-zinc-700 bg-zinc-950 text-zinc-300";

                return (
                  <button
                    type="button"
                    key={`${workoutForExecution.id}-progress-${exercise.name}`}
                    onClick={() => jumpToExercise(index)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs ${badgeClass} ${
                      isActive ? "ring-2 ring-indigo-500" : ""
                    }`}
                  >
                    <p className="font-semibold">{exercise.name}</p>
                    <p>
                      {status === "completed"
                        ? "Abgeschlossen"
                        : status === "in_progress"
                          ? "In Arbeit"
                          : "Nicht gestartet"}
                    </p>
                  </button>
                );
              })}
            </div>
            {workoutForExecution.exercises.length > MOBILE_EXERCISE_PREVIEW_COUNT ? (
              <button
                type="button"
                onClick={() => setShowAllProgressExercises((current) => !current)}
                className="mt-3 rounded-lg border border-zinc-600 px-3 py-1 text-xs text-zinc-200"
              >
                {showAllProgressExercises
                  ? "Weniger anzeigen"
                  : `Mehr anzeigen (${workoutForExecution.exercises.length - MOBILE_EXERCISE_PREVIEW_COUNT})`}
              </button>
            ) : null}
          </div>

          {currentExercise ? (
            <article className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
              <div className="mb-4">
                <WorkoutTimer
                  startedAtIso={progress.startedAtIso}
                  lastSetCompletedAtIso={lastSetCompletedAtIso}
                  status={progress.status}
                />
              </div>
              <p className="text-xs uppercase tracking-wide text-zinc-400">
                Exercise {safeExerciseIndex + 1}/{workoutForExecution.exercises.length}
              </p>
              <h3 className="mt-1 text-xl font-semibold">{currentExercise.name}</h3>
              {currentExerciseMeta?.videoUrl ?
                currentExerciseMeta.videoUrl.startsWith("data:video") ?
                  <video
                    controls
                    className="mt-2 max-h-48 w-full max-w-md rounded-lg border border-zinc-600 bg-black"
                    src={currentExerciseMeta.videoUrl}
                  />
                : <a
                    href={currentExerciseMeta.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 rounded-full border border-cyan-500/50 bg-cyan-950/30 px-3 py-1 text-xs text-cyan-100 hover:bg-cyan-900/40"
                  >
                    ▶ Drill-Video ansehen
                  </a>

              : null}
              {gymGoalHint?.kind === "injury" ? (
                <p className="mt-2 rounded-lg border border-amber-600/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
                  Übung für automatische Progression pausiert — weiter trainieren, aber keine Ziel-Zählung.
                </p>
              ) : null}
              {gymGoalHint?.kind === "goal" ? (
                <p className="mt-2 rounded-lg border border-violet-600/50 bg-violet-950/40 px-3 py-2 text-xs text-violet-100">
                  Aktives Ziel: {formatGymGoalSummary(gymGoalHint.goal)}
                </p>
              ) : null}
              {currentExerciseMeta?.notes ? <p className="mt-1 text-xs text-zinc-500">{currentExerciseMeta.notes}</p> : null}
              <p className="text-sm text-zinc-400">
                Satz {safeSetIndex + 1}/{currentExercise.sets.length}
              </p>
              {currentExercise.sets.length > 1 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {currentExercise.sets.map((_, setIdx) => (
                    <button
                      key={`${safeExerciseIndex}-set-tab-${setIdx}`}
                      type="button"
                      onClick={() => jumpToSet(setIdx)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        safeSetIndex === setIdx
                          ? "border-indigo-400 bg-indigo-500/20 text-indigo-100"
                          : "border-zinc-700 bg-zinc-900 text-zinc-300"
                      }`}
                    >
                      Satz {setIdx + 1}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {isGymWorkout ? (
                  <label className="text-sm text-zinc-300">
                    Gewicht (kg)
                    <input
                      value={currentLog.weight}
                      onChange={(event) => updateCurrentLog("weight", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white"
                      inputMode="decimal"
                    />
                  </label>
                ) : null}

                {tracksRepsAndMakes ? (
                  <>
                    <label className="text-sm text-zinc-300">
                      Reps
                      <input
                        value={currentLog.reps || currentLog.tries || ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          const reps = parseNonNegative(value);
                          const makes = parseNonNegative(currentLog.makes);
                          const misses =
                            reps > 0 && makes > 0 ? String(Math.max(0, reps - makes)) : currentLog.misses;
                          patchCurrentLog({ reps: value, tries: "", misses });
                        }}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white"
                        inputMode="numeric"
                        placeholder="z. B. 40"
                      />
                    </label>
                    <label className="text-sm text-zinc-300">
                      Makes
                      <input
                        value={currentLog.makes ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          const total = shootingRepsTotal;
                          const makes = parseNonNegative(value);
                          const misses = total > 0 ? String(Math.max(0, total - makes)) : currentLog.misses;
                          patchCurrentLog({ makes: value, misses });
                        }}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white"
                        inputMode="numeric"
                        placeholder="z. B. 36"
                      />
                    </label>
                    <label className="text-sm text-zinc-300">
                      Misses
                      <div className="mt-1 flex gap-2">
                        <input
                          value={currentLog.misses ?? ""}
                          onChange={(event) => updateCurrentLog("misses", event.target.value)}
                          className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white"
                          inputMode="numeric"
                          placeholder={`Auto: ${Math.max(0, shootingRepsTotal - parseNonNegative(currentLog.makes))}`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const total = shootingRepsTotal;
                            const makes = parseNonNegative(currentLog.makes);
                            const auto = Math.max(0, total - makes);
                            updateCurrentLog("misses", String(auto));
                          }}
                          className="shrink-0 rounded-lg border border-zinc-600 px-3 text-xs font-semibold text-zinc-200"
                          aria-label="Misses automatisch aus Reps minus Makes setzen"
                        >
                          = Reps − Makes
                        </button>
                      </div>
                    </label>
                  </>
                ) : !usesCompletedToggle ? (
                  <label className="text-sm text-zinc-300">
                    {isGymWorkout ? "Reps" : `Wert (${activeMetric}${activeMetric === "time" ? currentExerciseMeta?.timeUnit === "seconds" ? " in Sek." : " in Min." : ""})`}
                    <input
                      value={currentLog.reps}
                      onChange={(event) => updateCurrentLog("reps", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white"
                      inputMode="numeric"
                    />
                  </label>
                ) : null}
                {usesCompletedToggle ? (
                  <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-3">
                    <p className="text-sm text-zinc-300">Geschafft?</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateCompletionLog(true)}
                        className={`rounded-lg px-4 py-3 text-base font-semibold ${currentLog.completed ? "bg-emerald-600 text-white" : "border border-zinc-600 bg-black text-zinc-200"}`}
                      >
                        Ja
                      </button>
                      <button
                        type="button"
                        onClick={() => updateCompletionLog(false)}
                        className={`rounded-lg px-4 py-3 text-base font-semibold ${currentLog.completed === false ? "bg-rose-600 text-white" : "border border-zinc-600 bg-black text-zinc-200"}`}
                      >
                        Nein
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {!isRestDay ? (
                <div className="mt-3">
                  <label className="text-sm text-zinc-300">Satz-Notiz (optional)</label>
                  <input
                    type="text"
                    value={currentLog.note ?? ""}
                    onChange={(event) => updateCurrentLog("note", event.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white"
                    placeholder="z. B. Technik, Ballgefühl …"
                  />
                </div>
              ) : null}

              {!isRestDay ? (
                <div className="mt-3 rounded-xl border border-zinc-700 bg-zinc-900 p-3">
                  <div className="flex items-baseline justify-between">
                    <p className="text-xs uppercase tracking-wide text-zinc-400">Anstrengung (RPE)</p>
                    <p className="text-sm font-semibold text-cyan-200 tabular-nums">
                      {currentLog.rpe ? `${currentLog.rpe}/10` : "—"}
                    </p>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={currentLog.rpe ? Number(currentLog.rpe) : 0}
                    onChange={(event) =>
                      persistProgress({
                        ...progress,
                        logs: {
                          ...progress.logs,
                          [currentLogKey]: {
                            ...currentLog,
                            rpe: event.target.value === "0" ? "" : event.target.value,
                          },
                        },
                      })
                    }
                    className="mt-2 w-full accent-cyan-400"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
                    <span>locker</span>
                    <span>moderat</span>
                    <span>schwer</span>
                    <span>maximal</span>
                  </div>
                </div>
              ) : null}

              {!isGymWorkout && currentMetricOptions.length > 0 && !tracksRepsAndMakes ? (
                <div className="mt-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-400">Attribute auswählen</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {currentMetricOptions.map((metric) => {
                      const isActive = activeMetric === metric;
                      return (
                        <button
                          key={`${safeExerciseIndex}-${metric}`}
                          type="button"
                          onClick={() => selectMetric(metric)}
                          className={`rounded-full border px-3 py-1 text-xs ${
                            isActive
                              ? "border-cyan-400 bg-cyan-500/20 text-cyan-100"
                              : "border-zinc-600 bg-zinc-900 text-zinc-300"
                          }`}
                        >
                          {metric}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="mt-3 text-sm text-zinc-400">
                <p>
                  Ziel: {isGymWorkout ? `${currentSet.targetKg} kg × ${currentSet.targetReps} Reps` : tracksRepsAndMakes ? `${currentExerciseMeta?.targetByMetric?.reps ?? "-"} Reps • ${currentSet.targetReps} Makes` : `${currentSet.targetReps} ${activeMetric === "time" && currentExerciseMeta?.timeUnit === "seconds" ? "Sekunden" : "Treffer/Reps"}`}
                </p>
                <p className="mt-1">
                  Aktuell: {isGymWorkout ? `${currentLog.weight || 0} kg × ${currentLog.reps || 0}` : tracksRepsAndMakes ? `${shootingRepsTotal} Reps • ${currentLog.makes || 0} Makes • ${parseNonNegative(currentLog.misses) || Math.max(0, shootingRepsTotal - parseNonNegative(currentLog.makes))} Misses` : `${currentLog.reps || 0}${activeMetric === "time" ? ` ${currentExerciseMeta?.timeUnit === "seconds" ? "Sek." : "Min."}` : ""}`}
                </p>
                {usesCompletedToggle ? <p className="mt-1">Geschafft: {currentLog.completed ? "Ja" : "Nein"}</p> : null}
              </div>
              {setValidationError ? <p className="mt-2 text-sm text-rose-300">{setValidationError}</p> : null}

              <div className="mt-4 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={progress.status === "in_progress" ? completeWorkout : startWorkout}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                  >
                    {progress.status === "in_progress" ? "Workout beenden" : "Workout starten"}
                  </button>
                  <button
                    type="button"
                    onClick={finishSet}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                  >
                    Satz abschließen
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => jumpToSet(Math.max(0, safeSetIndex - 1))}
                  disabled={safeSetIndex <= 0}
                  className="rounded-lg border border-zinc-600 px-3 py-2 text-xs font-semibold text-zinc-200 disabled:opacity-40"
                >
                  ← Satz zurück
                </button>
                <button
                  type="button"
                  onClick={addSetToCurrentExercise}
                  className="rounded-lg border border-cyan-500 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-950"
                >
                  Satz hinzufügen
                </button>
                <button
                  type="button"
                  onClick={() => jumpToSet(Math.min(currentExercise.sets.length - 1, safeSetIndex + 1))}
                  disabled={safeSetIndex >= currentExercise.sets.length - 1}
                  className="rounded-lg border border-zinc-600 px-3 py-2 text-xs font-semibold text-zinc-200 disabled:opacity-40"
                >
                  Satz vor →
                </button>
                </div>
              </div>
            </article>
          ) : (
            <p className="text-sm text-zinc-500">
              {isRestDay ? "Keine Zeit aktiv – heute ist kein Training geplant." : "Keine Exercise im Workout gefunden."}
            </p>
          )}
        </section>
      ) : null}

      <div className="mt-4">
        <Link href="/Weekly-Workout" className="text-sm text-indigo-300 hover:text-indigo-200">
          ← Zurück zum Weekly Plan
        </Link>
      </div>
      {showTipsReminder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-cyan-600 bg-zinc-900 p-4">
            <h3 className="text-lg font-semibold text-cyan-200">Fokus vor dem Start</h3>
            <p className="mt-1 text-sm text-zinc-300">
              Lies deine Notizen kurz durch, dann starte konzentriert.
            </p>
            <div className="mt-3 max-h-72 overflow-auto pr-1">
              <PerformanceTipsAccordion tips={activePerformanceTips} basketballMode={currentBasketballMode} />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="w-full rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-200"
                onClick={() => setShowTipsReminder(false)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold"
                onClick={() => {
                  setShowTipsReminder(false);
                  const nowIso = new Date().toISOString();
                  persistProgress({
                    ...progress,
                    status: "in_progress",
                    startedAtIso: progress.startedAtIso ?? nowIso,
                  });
                }}
              >
                Jetzt starten
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showRecoveryPrompt && pendingManualEntry ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-cyan-600 bg-zinc-900 p-4">
            <h3 className="text-lg font-semibold text-cyan-200">Regeneration ergänzen?</h3>
            <p className="mt-2 text-sm text-zinc-300">
              Soll zusätzlich ein Regenerations-Workout eingeplant werden?
            </p>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-800"
                onClick={() => {
                  persistManualWorkoutForDay(pendingManualEntry, pendingStartImmediately, "none");
                  setShowRecoveryPrompt(false);
                  setPendingManualEntry(null);
                }}
              >
                Nein
              </button>
              <button
                type="button"
                className="rounded-lg border border-emerald-600 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-900/30"
                onClick={() => {
                  persistManualWorkoutForDay(pendingManualEntry, pendingStartImmediately, "today");
                  setShowRecoveryPrompt(false);
                  setPendingManualEntry(null);
                }}
              >
                Ja, heute nach dem Training
              </button>
              <button
                type="button"
                className="rounded-lg border border-indigo-600 px-3 py-2 text-sm text-indigo-200 hover:bg-indigo-900/30"
                onClick={() => {
                  persistManualWorkoutForDay(pendingManualEntry, pendingStartImmediately, "tomorrow");
                  setShowRecoveryPrompt(false);
                  setPendingManualEntry(null);
                }}
              >
                Ja, morgen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default function WorkoutsPage() {
  return (
    <Suspense fallback={<main className="app-container">Workouts werden geladen…</main>}>
      <WorkoutsPageContent />
    </Suspense>
  );
}
