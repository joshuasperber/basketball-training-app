"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { WEEKLY_WORKOUT_PATH } from "@/lib/routes";
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
  HIDE_ALL_AUTO_WORKOUTS_ID,
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
import { pullProgressFromCloud } from "@/lib/progress-sync";
import { syncWorkoutSessionsToCloudWithRetry } from "@/lib/sync-workout-sessions";
import { getTipsForWorkoutContext, loadPerformanceTips, type PerformanceTip } from "@/lib/performance-tips";
import { countTrackedSetsInLogs } from "@/lib/workout-session-metrics";
import {
  buildSessionLogFromSet,
  completeShootingValues,
  normalizeMetricKeysForCategory,
  repCountFromSessionLog,
  shouldUseShootingInputs,
  validateSetLogForMetrics,
} from "@/lib/workout-metrics";
import { syncPausedWorkoutRegistry, isWorkoutPausedProgress } from "@/lib/paused-workouts";
import { finishWorkoutSession, setLogHasStarted } from "@/lib/finish-workout-session";
import type { MetricKey } from "@/lib/training-data";
import {
  DEFAULT_MANUAL_TITLE,
  deriveSmartWorkoutTitle,
  type ManualDayWorkout,
  type BasketballMode,
  newManualDayWorkoutId,
  workoutSportToCategory,
  buildGroupedExercisesByFamily,
  expandExercisesWithFamily,
  buildExerciseSets,
  roundWorkoutMinutes,
  roundUpToFiveMinutes,
  getDurationForSetCount,
  getExtraSetDuration,
  buildBasketballWarmupExerciseIds,
} from "@/lib/workout-page-utils";
import { useAppDialog } from "@/components/ui/AppDialogProvider";
import PerformanceTipsAccordion from "@/components/PerformanceTipsAccordion";
import PageHeader from "@/components/PageHeader";
import GradientFadeList from "@/components/GradientFadeList";
import {
  applyGymGoalsAfterSession,
  formatGymGoalSummary,
  getActiveGymGoalForExercise,
  loadTrainingGoalsBundle,
} from "@/lib/training-goals";

const CUSTOM_SUBCATEGORY_KEY = "bt.custom-subcategories.v1";

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
    const serialized = JSON.stringify(nextHistory);
    window.localStorage.setItem(WORKOUT_HISTORY_KEY, serialized);
    window.localStorage.setItem("bt.workout-history.v1", serialized);
  } catch {
    const serialized = JSON.stringify([entry]);
    window.localStorage.setItem(WORKOUT_HISTORY_KEY, serialized);
    window.localStorage.setItem("bt.workout-history.v1", serialized);
  }
}

function WorkoutsPageContent() {
  const router = useRouter();
  const appDialog = useAppDialog();
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
          durationMin: parsed.durationMin,
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
        durationMin: parsed.durationMin,
        exercises:
          exerciseIds.length > 0
            ? exerciseIds
                .map((exerciseId) => trainingExercises.find((exercise) => exercise.id === exerciseId))
                .filter((exercise): exercise is NonNullable<typeof exercise> => Boolean(exercise))
                .map((exercise) => ({
                  exerciseId: exercise.id,
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
          exerciseId: exercise.id,
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
      durationMin: roundWorkoutMinutes(groupedExercises.reduce((sum, exercise) => sum + Math.max(0, exercise.durationMin), 0)),
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

  const activeWorkoutBase = customWorkoutFromCatalog ?? autoWorkoutFromWeekly ?? manualWorkout ?? selectedOverrideWorkout ?? defaultWorkout;
  const isCatalogWorkoutRun = Boolean(customWorkoutFromCatalog && workoutIdParam && !autoWorkoutParam && !workoutPayloadIdParam && !manualWorkoutIdParam);

  useEffect(() => {
    setSessionWorkout(activeWorkoutBase);
  }, [activeWorkoutBase]);

  const workoutForExecution = useMemo<WorkoutPlan>(() => sessionWorkout, [sessionWorkout]);

  const fallbackProgress = useMemo(
    () => getDefaultWorkoutProgress(dateKey, workoutForExecution),
    [dateKey, workoutForExecution],
  );
  const progressStorageKey = useMemo(
    () => `${buildWorkoutStorageKey(dateKey)}-${workoutForExecution.id}`,
    [dateKey, workoutForExecution.id],
  );
  const progressRef = useRef(progress);
  const completionRunLockRef = useRef<string | null>(null);
  const completedSessionKeysRef = useRef<Set<string>>(new Set());
  const dateKeyRef = useRef(dateKey);
  const progressStorageKeyRef = useRef(progressStorageKey);

  useEffect(() => {
    progressRef.current = progress;
    dateKeyRef.current = dateKey;
    progressStorageKeyRef.current = progressStorageKey;
  }, [dateKey, progress, progressStorageKey]);

  useEffect(() => {
    const pauseActiveWorkout = () => {
      const current = progressRef.current;
      if (current.status !== "in_progress") return;

      const paused: WorkoutProgress = {
        ...current,
        status: "not_started",
        startedAtIso: undefined,
        endedAtIso: undefined,
        elapsedSeconds: undefined,
      };

      progressRef.current = paused;
      window.localStorage.setItem(progressStorageKeyRef.current, JSON.stringify(paused));
      window.localStorage.setItem(buildWorkoutStorageKey(dateKeyRef.current), JSON.stringify(paused));
      syncPausedWorkoutRegistry({ progress: paused, progressStorageKey: progressStorageKeyRef.current });
      window.dispatchEvent(new Event("bt:workout-progress-updated"));
      setProgress(paused);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") pauseActiveWorkout();
    };
    const handleNavigationClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      try {
        const url = new URL(link.href);
        if (url.origin === window.location.origin && !url.pathname.startsWith("/workouts")) {
          pauseActiveWorkout();
        }
      } catch {
        // Ignore malformed hrefs.
      }
    };

    window.addEventListener("pagehide", pauseActiveWorkout);
    window.addEventListener("beforeunload", pauseActiveWorkout);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("click", handleNavigationClick, true);
    return () => {
      window.removeEventListener("pagehide", pauseActiveWorkout);
      window.removeEventListener("beforeunload", pauseActiveWorkout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("click", handleNavigationClick, true);
    };
  }, []);

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
    if (!manualWorkoutIdParam && (workoutIdParam || autoWorkoutParam || workoutPayloadIdParam)) return;
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
    const rawForWorkout = window.localStorage.getItem(progressStorageKey);
    const legacyRaw = window.localStorage.getItem(buildWorkoutStorageKey(dateKey));
    const parsed = parseWorkoutProgress(
      rawForWorkout ?? legacyRaw,
      fallbackProgress,
    );
    const isValidForActiveWorkout =
      parsed.workoutId === fallbackProgress.workoutId &&
      parsed.date === fallbackProgress.date &&
      (rawForWorkout != null || parsed.status !== "completed") &&
      (!isCatalogWorkoutRun || parsed.status !== "completed");

    const timer = window.setTimeout(() => {
      const nextProgress = isValidForActiveWorkout ? parsed : fallbackProgress;
      progressRef.current = nextProgress;
      setProgress(nextProgress);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dateKey, fallbackProgress, isCatalogWorkoutRun, progressStorageKey, workoutForExecution.id]);

  const persistProgress = (next: WorkoutProgress) => {
    progressRef.current = next;
    dateKeyRef.current = dateKey;
    progressStorageKeyRef.current = progressStorageKey;
    setProgress(next);
    window.localStorage.setItem(progressStorageKey, JSON.stringify(next));
    window.localStorage.setItem(buildWorkoutStorageKey(dateKey), JSON.stringify(next));
    syncPausedWorkoutRegistry({ progress: next, progressStorageKey });
    window.dispatchEvent(new Event("bt:workout-progress-updated"));
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
  const emptySetLog: SetLog = { weight: "", reps: "", tries: "", makes: "", misses: "", time: "", distance: "", distanceUnit: "m", points: "", note: "", completed: false, rpe: "" };
  const currentLog = progress.logs[currentLogKey] ?? emptySetLog;
  const getCurrentLogFromProgress = (workoutProgress: WorkoutProgress) =>
    workoutProgress.logs[currentLogKey] ?? emptySetLog;

  const parseNonNegative = (value?: string) => {
    const parsed = Number(value ?? "");
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
  };

  const activateProgressForInput = (workoutProgress: WorkoutProgress = progress): WorkoutProgress => {
    if (workoutProgress.status === "in_progress") return workoutProgress;
    return {
      ...workoutProgress,
      status: "in_progress",
      endedAtIso: undefined,
      startedAtIso: undefined,
      elapsedSeconds: undefined,
    };
  };

  const shootingRepsTotal = parseNonNegative(currentLog.reps) || parseNonNegative(currentLog.tries);

  const exerciseMeta = useMemo(() => {
    const byId = new Map(trainingExercises.map((exercise) => [exercise.id, exercise]));
    const byName = new Map(trainingExercises.map((exercise) => [exercise.name, exercise]));
    return workoutForExecution.exercises.map((exercise) =>
      exercise.exerciseId ? byId.get(exercise.exerciseId) ?? byName.get(exercise.name) ?? null : byName.get(exercise.name) ?? null,
    );
  }, [trainingExercises, workoutForExecution.exercises]);
  
  const currentExerciseMeta = exerciseMeta[safeExerciseIndex];
  const workoutCategory = workoutSportToCategory(workoutForExecution.sport);

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
  const currentMetricOptions = workoutCategory ? normalizeMetricKeysForCategory(workoutCategory, rawMetricOptions) : rawMetricOptions;
  const tracksRepsAndMakes = workoutForExecution.sport === "Basketball" && shouldUseShootingInputs(currentMetricOptions);

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

  const hasSetStarted = (exerciseIndex: number, setIndex: number, workoutProgress: WorkoutProgress = progress) => {
    const key = buildSetLogKey(exerciseIndex, setIndex);
    const log = workoutProgress.logs[key];
    if (!log) return false;
    const reps = Number(log.reps) || 0;
    const weight = Number(log.weight) || 0;
    const tries = parseNonNegative(log.reps) || parseNonNegative(log.tries);
    const makes = Number(log.makes) || 0;
    const misses = Number(log.misses) || 0;
    return reps > 0 || weight > 0 || tries > 0 || makes > 0 || misses > 0 || log.completed === true || Boolean(log.completedAtIso);
  };

  const getExerciseStatus = (exerciseIndex: number, workoutProgress: WorkoutProgress = progress): "not_started" | "in_progress" | "completed" => {
    const exercise = workoutForExecution.exercises[exerciseIndex];
    const startedSets = exercise.sets.filter((_, setIndex) => hasSetStarted(exerciseIndex, setIndex, workoutProgress)).length;
    if (startedSets <= 0) return "not_started";
    if (startedSets >= exercise.sets.length) return "completed";
    return "in_progress";
  };

  const isWorkoutFullyTracked = (workoutProgress: WorkoutProgress = progress) =>
    workoutForExecution.exercises.length > 0 &&
    workoutForExecution.exercises.every((_, exerciseIndex) => getExerciseStatus(exerciseIndex, workoutProgress) === "completed");

  const jumpToExercise = (exerciseIndex: number) => {
    const exercise = workoutForExecution.exercises[exerciseIndex];
    const nextSetIndex = exercise.sets.findIndex((_, setIndex) => !hasSetStarted(exerciseIndex, setIndex));
    const activeProgress = activateProgressForInput();
    persistProgress({
      ...activeProgress,
      exerciseIndex,
      setIndex: nextSetIndex >= 0 ? nextSetIndex : Math.max(0, exercise.sets.length - 1),
    });
  };

  const clampShootingLog = (log: SetLog): SetLog => {
    if (!tracksRepsAndMakes) return log;
    const completed = completeShootingValues(log);
    return {
      ...log,
      reps: completed.reps > 0 ? String(completed.reps) : log.reps,
      makes: completed.reps > 0 ? String(completed.makes) : log.makes,
      misses: completed.reps > 0 ? String(completed.misses) : log.misses,
    };
  };

  const updateCurrentLog = (field: "weight" | "reps" | "tries" | "makes" | "misses" | "time" | "distance" | "distanceUnit" | "points" | "note", value: string) => {
    setSetValidationError(null);
    const activeProgress = activateProgressForInput(progressRef.current);
    const activeLog = getCurrentLogFromProgress(activeProgress);
    const nextLog = clampShootingLog({
      ...activeLog,
      [field]: value,
    });
    persistProgress({
      ...activeProgress,
      logs: {
        ...activeProgress.logs,
        [currentLogKey]: nextLog,
      },
    });
  };

  const patchCurrentLog = (patch: Partial<SetLog>) => {
    setSetValidationError(null);
    const activeProgress = activateProgressForInput(progressRef.current);
    const activeLog = getCurrentLogFromProgress(activeProgress);
    const nextLog = clampShootingLog({
      ...activeLog,
      ...patch,
    });
    persistProgress({
      ...activeProgress,
      logs: {
        ...activeProgress.logs,
        [currentLogKey]: nextLog,
      },
    });
  };
  const toggleManualExercise = (exerciseId: string) => {
    setSelectedManualExerciseIds((previous) =>
      previous.includes(exerciseId) ? previous.filter((id) => id !== exerciseId) : [...previous, exerciseId],
    );
  };

  const removeManualExercise = (exerciseId: string) => {
    setSelectedManualExerciseIds((previous) => previous.filter((id) => id !== exerciseId));
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
        durationMin: entry.durationMin,
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
      durationMin: entry.durationMin ?? roundWorkoutMinutes(selectedExercises.reduce((sum, exercise) => sum + Math.max(0, exercise.durationMin), 0)),
      exercises: selectedExercises.map((exercise) => ({
        exerciseId: exercise.id,
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
      durationMin: generated.durationMin,
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
      if (!replaceCardIdParam.startsWith("recovery-")) {
        hideAutoWorkoutCardForDate(dateKey, HIDE_ALL_AUTO_WORKOUTS_ID);
      }
    }
    store[dateKey] = isReplacingAutoCard
      ? [
          entry,
          ...existingForDate.filter((item) => item.id !== entry.id),
        ]
      : [
          entry,
          ...existingForDate.filter((item) => item.id !== manualWorkoutIdParam && item.id !== entry.id),
        ];

    window.localStorage.setItem(MANUAL_DAY_WORKOUTS_KEY, JSON.stringify(store));
    window.dispatchEvent(new Event("bt:plan-updated"));
    void syncWorkoutSessionsToCloudWithRetry();

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

    router.push(WEEKLY_WORKOUT_PATH);
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
    router.push(WEEKLY_WORKOUT_PATH);
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
    const activeProgress = activateProgressForInput(progressRef.current);
    persistProgress({
      ...activeProgress,
      setIndex,
    });
  };

  const startWorkout = () => {
    completionRunLockRef.current = null;
    persistProgress({
      ...progressRef.current,
      status: "in_progress",
      endedAtIso: undefined,
      startedAtIso: undefined,
      elapsedSeconds: undefined,
    });
    if (activePerformanceTips.length > 0 && workoutForExecution.sport === "Basketball") {
      setShowTipsReminder(true);
    }
  };
  const pauseWorkout = (sourceProgress: WorkoutProgress = progressRef.current) => {
    const pausedProgress: WorkoutProgress = {
      ...sourceProgress,
      status: "not_started",
      elapsedSeconds: undefined,
      startedAtIso: undefined,
      endedAtIso: undefined,
    };
    persistProgress(pausedProgress);
  };
  const completeWorkout = (sourceProgress: WorkoutProgress = progressRef.current) => {
    if (!isWorkoutFullyTracked(sourceProgress)) {
      pauseWorkout(sourceProgress);
      return;
    }
    const runStartedAtIso = sourceProgress.startedAtIso ?? sourceProgress.endedAtIso ?? new Date().toISOString();
    const completionKey = `${sourceProgress.date}-${sourceProgress.workoutId}-${runStartedAtIso}`;
    if (completionRunLockRef.current === completionKey) {
      return;
    }
    completionRunLockRef.current = completionKey;
    if (completedSessionKeysRef.current.has(completionKey)) {
      return;
    }
    completedSessionKeysRef.current.add(completionKey);
    const endedAtIso = new Date().toISOString();
    const completedProgress: WorkoutProgress = {
      ...sourceProgress,
      status: "completed",
      endedAtIso,
      elapsedSeconds: undefined,
      startedAtIso: undefined,
    };
    persistProgress(completedProgress);

    const sessionLogsFromProgress = workoutForExecution.exercises.flatMap((exercise, exerciseIndex) => {
      const exerciseDef = exerciseMeta[exerciseIndex];
      const exerciseId = exercise.exerciseId ?? exerciseDef?.id ?? `custom-${exerciseIndex}-${exercise.name}`;
      const fallbackCategory = workoutSportToCategory(workoutForExecution.sport) ?? "Basketball";
      const sessionExercise = exerciseDef ?? {
        id: exerciseId,
        name: exercise.name,
        durationMin: 0,
        category: fallbackCategory,
        subcategory: workoutForExecution.subcategory,
        metricKeys: ["reps"] as MetricKey[],
        trackingType: "reps" as const,
      };
      return exercise.sets.map((set, setIndex) => {
        const log = completedProgress.logs[buildSetLogKey(exerciseIndex, setIndex)];
        return buildSessionLogFromSet({
          exercise: sessionExercise,
          log,
          setTargetReps: set.targetReps,
          rpe: parseSetRpe(log?.rpe),
        });
      });
    });
    const sessionLogs = sessionLogsFromProgress;
    const exerciseLookupForSession = new Map(
      exerciseMeta
        .filter((exercise): exercise is NonNullable<typeof exercise> => Boolean(exercise))
        .map((exercise) => [exercise.id, exercise]),
    );
    const repCountForHistory = (log: (typeof sessionLogsFromProgress)[number]) =>
      repCountFromSessionLog(log, exerciseLookupForSession.get(log.exerciseId));

    const historyEntry: CompletedWorkoutHistoryEntry = {
      id: isCatalogWorkoutRun
        ? `${completedProgress.date}-${completedProgress.workoutId}-${runStartedAtIso}`
        : `${completedProgress.date}-${completedProgress.workoutId}`,
      date: completedProgress.date,
      workoutId: completedProgress.workoutId,
      title: completedProgress.title,
      sport: completedProgress.sport,
      subcategory: completedProgress.subcategory,
      totalSets: countTrackedSetsInLogs(sessionLogs),
      totalReps: sessionLogsFromProgress.reduce((sum, log) => sum + repCountForHistory(log), 0),
      totalVolumeKg: sessionLogsFromProgress.reduce(
        (sum, log) =>
          sum + repCountForHistory(log) * Math.max(0, log.weightKg ?? 0),
        0,
      ),
    };

    persistHistoryEntry(historyEntry);

      const rpeSamples = sessionLogs.map((l) => l.rpe).filter((v): v is number => typeof v === "number");
      const avgRpe =
        rpeSamples.length > 0 ? Math.round((rpeSamples.reduce((a, b) => a + b, 0) / rpeSamples.length) * 10) / 10 : null;
      const extraSetMinutes = workoutForExecution.exercises.reduce((sum, exercise) => {
        const exerciseDef = exercise.exerciseId
          ? trainingExercises.find((item) => item.id === exercise.exerciseId) ?? trainingExercises.find((item) => item.name === exercise.name)
          : trainingExercises.find((item) => item.name === exercise.name);
        return sum + getExtraSetDuration(exerciseDef, exercise.sets.length);
      }, 0);
      const calculatedDurationMinutes = workoutForExecution.exercises.reduce((sum, exercise) => {
        const exerciseDef = exercise.exerciseId
          ? trainingExercises.find((item) => item.id === exercise.exerciseId) ?? trainingExercises.find((item) => item.name === exercise.name)
          : trainingExercises.find((item) => item.name === exercise.name);
        return sum + getDurationForSetCount(exerciseDef, exercise.sets.length);
      }, 0);
      const attributedDurationMinutes =
        workoutForExecution.durationMin && workoutForExecution.durationMin > 0
          ? roundUpToFiveMinutes(workoutForExecution.durationMin + extraSetMinutes)
          : roundUpToFiveMinutes(calculatedDurationMinutes);
      const plannedDurationSeconds = attributedDurationMinutes > 0 ? attributedDurationMinutes * 60 : 0;
      const durationSeconds =
        plannedDurationSeconds > 0
          ? plannedDurationSeconds
          : Math.max(300, sessionLogs.length * 180);

      const sessionId = isCatalogWorkoutRun
        ? `${completedProgress.date}-${completedProgress.workoutId}-${runStartedAtIso}`
        : `${completedProgress.date}-${completedProgress.workoutId}`;
      const sessionEntry = {
        id: `ws-${sessionId}`,
        dateISO: new Date(`${dateKey}T12:00:00`).toISOString(),
        workoutId: completedProgress.workoutId,
        workoutName: completedProgress.title,
        workoutCategory: completedProgress.sport,
        workoutSubcategory: completedProgress.subcategory,
        sessionNotes: "",
        durationSeconds,
        avgRpe,
        allowMultiple: isCatalogWorkoutRun,
        logs: sessionLogs,
      };
      appendWorkoutSession(sessionEntry);
      if (completedProgress.sport === "Gym") {
        applyGymGoalsAfterSession(sessionEntry);
      }
    let achievedSets = 0;
    let totalSets = 0;
    let completedSetCount = 0;
    const completedExercises = new Set<number>();
    workoutForExecution.exercises.forEach((exercise, exerciseIndex) => {
      let exerciseWasCompleted = false;
      let exerciseTargetMet = false;
      exercise.sets.forEach((set, setIndex) => {
        const log = completedProgress.logs[buildSetLogKey(exerciseIndex, setIndex)];
        const reps = Number(log?.reps) || 0;
        const makes = Number(log?.makes) || 0;
        const weight = Number(log?.weight) || 0;
        const tries = parseNonNegative(log?.reps) || parseNonNegative(log?.tries);
        const misses = Number(log?.misses) || 0;
        const time = Number(log?.time) || 0;
        const distance = Number(log?.distance) || 0;
        const points = Number(log?.points) || 0;
        const setCompleted = log?.completed ?? true;
        const effectiveReps = makes > 0 ? makes : reps;
        const repsMet = effectiveReps >= set.targetReps;
        const weightMet = set.targetKg <= 0 || weight >= set.targetKg;
        if (
          setCompleted &&
          (effectiveReps > 0 || weight > 0 || tries > 0 || misses > 0 || makes > 0 || time > 0 || distance > 0 || points > 0)
        ) {
          exerciseWasCompleted = true;
          completedExercises.add(exerciseIndex);
        }
        if (setCompleted && repsMet && weightMet) {
          exerciseTargetMet = true;
        }
      });
      totalSets += 1;
      if (exerciseWasCompleted) completedSetCount += 1;
      if (exerciseTargetMet) achievedSets += 1;
    });

    const trackedExerciseIds = new Set(sessionLogs.map((log) => log.exerciseId));
    completedSetCount = Math.max(completedSetCount, trackedExerciseIds.size);
    const qualityScore = totalSets > 0 ? achievedSets / totalSets : 0;
    const completedMinutes = workoutForExecution.exercises.reduce((sum, workoutExercise, exerciseIndex) => {
      const meta = exerciseMeta[exerciseIndex];
      const anyCompleted = workoutExercise.sets.some((_, setIndex) => {
        const log = completedProgress.logs[buildSetLogKey(exerciseIndex, setIndex)];
        const reps = Number(log?.reps) || 0;
        const makes = Number(log?.makes) || 0;
        const weight = Number(log?.weight) || 0;
        const tries = parseNonNegative(log?.reps) || parseNonNegative(log?.tries);
        const misses = Number(log?.misses) || 0;
        const time = Number(log?.time) || 0;
        const distance = Number(log?.distance) || 0;
        const points = Number(log?.points) || 0;
        return (
          (log?.completed ?? true) &&
          (reps > 0 ||
            makes > 0 ||
            weight > 0 ||
            tries > 0 ||
            misses > 0 ||
            time > 0 ||
            distance > 0 ||
            points > 0)
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
    const completedExerciseCount = Math.max(completedExercises.size, trackedExerciseIds.size);
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
    void syncWorkoutSessionsToCloudWithRetry().catch(() => {
      // Lokaler Abschluss ist bereits gespeichert; Netzwerkfehler beim Sync darf die UI nicht crashen.
    });
    if (isCatalogWorkoutRun) {
      const freshProgress = getDefaultWorkoutProgress(dateKey, workoutForExecution);
      progressRef.current = freshProgress;
      setProgress(freshProgress);
      window.localStorage.removeItem(progressStorageKey);
      window.localStorage.removeItem(buildWorkoutStorageKey(dateKey));
      router.push("/training?completed=workout");
      return;
    }
    router.push("/stats");
  };

  const finishSet = () => {
    const activeProgress = activateProgressForInput(progressRef.current);
    const activeLog = getCurrentLogFromProgress(activeProgress);
    const validationMessage = validateSetLogForMetrics(activeLog, currentMetricOptions);
    if (validationMessage) {
      setSetValidationError(validationMessage);
      return;
    }

    const nowIso = new Date().toISOString();
    const updatedLog = { ...activeLog, completedAtIso: nowIso };
    const updatedLogs = { ...activeProgress.logs, [currentLogKey]: updatedLog };
    const isLastSetInExercise = safeSetIndex === currentExercise.sets.length - 1;
    const isLastExercise = safeExerciseIndex === workoutForExecution.exercises.length - 1;

    if (isLastExercise && isLastSetInExercise) {
      const next: WorkoutProgress = {
        ...activeProgress,
        logs: updatedLogs,
        status: "completed",
        endedAtIso: nowIso,
        elapsedSeconds: undefined,
        startedAtIso: undefined,
      };
      persistProgress(next);
      completeWorkout(next);
      return;
    }

    if (isLastSetInExercise) {
      persistProgress({
        ...activeProgress,
        logs: updatedLogs,
        exerciseIndex: safeExerciseIndex + 1,
        setIndex: 0,
        status: "in_progress",
      });
      return;
    }

    persistProgress({
      ...activeProgress,
      logs: updatedLogs,
      setIndex: safeSetIndex + 1,
      status: "in_progress",
    });
  };

  if (!isClientReady) {
    return <main className="app-container">Workouts werden geladen…</main>;
  }

  const workoutFullyTracked = isWorkoutFullyTracked();
  const hasLoggedSets = Object.values(progress.logs).some((log) => setLogHasStarted(log));
  const canContinueWorkout =
    progress.status !== "in_progress" &&
    !(progress.status === "completed" && workoutFullyTracked) &&
    isWorkoutPausedProgress(progress);
  const canEndWorkout =
    !(progress.status === "completed" && workoutFullyTracked) &&
    (progress.status === "in_progress" || canContinueWorkout || hasLoggedSets);
  const workoutPrimaryLabel =
    progress.status === "completed" && workoutFullyTracked
      ? "Workout abgeschlossen"
      : progress.status === "in_progress"
      ? workoutFullyTracked
        ? "Workout abschließen"
        : "Workout pausieren"
      : canContinueWorkout
        ? "Workout fortfahren"
        : "Workout starten";
  const endWorkoutEarly = async () => {
    const latestProgress = progressRef.current;
    const hasSets = Object.values(latestProgress.logs).some((log) => setLogHasStarted(log));
    const confirmed = await appDialog.confirm({
      message: hasSets
        ? `„${latestProgress.title}“ beenden? Erfasster Fortschritt wird in Stats gespeichert.`
        : `„${latestProgress.title}“ beenden? Es wurden noch keine Sätze erfasst.`,
      confirmLabel: "Beenden",
      tone: "danger",
    });
    if (!confirmed) return;

    const result = finishWorkoutSession({
      progress: latestProgress,
      workoutPlan: workoutForExecution,
      progressStorageKey,
      allowPartial: true,
      allowEmptyFinish: true,
      isCatalogWorkoutRun,
    });
    if (!result.ok) {
      void appDialog.alert({ message: result.error ?? "Workout konnte nicht beendet werden." });
      return;
    }
    if (result.levelDelta && result.levelDelta > 0) {
      void appDialog.alert({ message: `🎉 Level-Up! +${result.levelDelta} Level` });
    } else if (result.bannerMessage) {
      setCompletionBanner(result.bannerMessage);
    } else {
      setCompletionBanner("Workout beendet.");
    }
    if (isCatalogWorkoutRun) {
      const freshProgress = getDefaultWorkoutProgress(dateKey, workoutForExecution);
      progressRef.current = freshProgress;
      setProgress(freshProgress);
      window.localStorage.removeItem(progressStorageKey);
      window.localStorage.removeItem(buildWorkoutStorageKey(dateKey));
      router.push("/training?completed=workout");
      return;
    }
    if (hasSets) {
      router.push("/stats");
    }
  };
  const handleWorkoutPrimaryAction = () => {
    const latestProgress = progressRef.current;
    const latestFullyTracked = isWorkoutFullyTracked(latestProgress);
    if (latestProgress.status === "completed" && latestFullyTracked) return;
    if (latestProgress.status === "in_progress") {
      if (latestFullyTracked) {
        completeWorkout(latestProgress);
      } else {
        pauseWorkout(latestProgress);
      }
      return;
    }
    if (canContinueWorkout) {
      startWorkout();
      return;
    }
    startWorkout();
  };
  const currentTargetText = isGymWorkout
    ? `${currentSet.targetKg} kg × ${currentSet.targetReps} Reps`
    : tracksRepsAndMakes
      ? `${currentSet.targetReps} Makes · Eingabe: Reps, Makes und Misses`
      : currentMetricOptions.includes("time") && !currentMetricOptions.includes("reps")
        ? `Zeit-Ziel: ${currentSet.targetReps} ${currentExerciseMeta?.timeUnit === "seconds" ? "Sek." : "Min."}`
        : `${currentSet.targetReps} Reps`;

  return (
    <main className="app-container animate-in">
      <PageHeader
        eyebrow="Training"
        title="Workout"
        subtitle="Hier planst und startest du dein Training."
        actions={<Link href="/tips" className="btn btn-ghost btn-sm">Tipps &amp; Notizen</Link>}
      />
      <p className="-mt-2 text-xs text-faint">
        Trainingshinweis: Kein Ersatz für medizinische Beratung. Bei Schmerzen oder Verletzungen vorher ärztlich abklären.
      </p>
      <p className="mt-1 text-xs hint-success">XP-Multiplikator steigt durch Regeneration (gedeckelt).</p>
      {activePerformanceTips.length > 0 && workoutForExecution.sport === "Basketball" ? (
        <section className="app-card--accent-cyan mt-3">
          <p className="section-eyebrow">Aktive Fokus-Tipps</p>
          <PerformanceTipsAccordion tips={activePerformanceTips} basketballMode={currentBasketballMode} className="mt-2" />
        </section>
      ) : null}
      {manualParam !== "1" ? (

      <section className="mt-6 ui-card">
        <h2 className="text-xl font-semibold">{workoutForExecution.title}</h2>
        <p className="mt-1 text-sm text-muted">Sport: {workoutForExecution.sport}</p>
        <p className="mt-1 text-sm text-muted">Unterkategorie: {workoutForExecution.subcategory}</p>
        {workoutNotes ? <p className="mt-1 text-sm text-faint">Notiz: {workoutNotes}</p> : null}

        {effectiveDay === todayDayIndex && !manualWorkout && !workoutIdParam && !autoWorkoutParam && !manualWorkoutIdParam && manualParam !== "1" ? (
          <label className="mt-3 block text-sm text-muted">
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
              className="select mt-1"
            >
              {workoutOptions.map((workout) => (
                <option key={workout.id} value={workout.id}>
                  {workout.title} ({workout.sport} • {workout.subcategory})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-faint">
              Bei Änderung wird das heutige Protokoll zurückgesetzt und neue Zukunfts-Vorschläge angepasst.
            </p>
          </label>
        ) : null}
        {effectiveDay === todayDayIndex && manualWorkout ? (
          <p className="mt-3 text-xs hint-success">
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
              <p className="sm:col-span-2 text-xs hint-success">
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
            <p className="mt-1 text-xs hint-success">
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
            <GradientFadeList
              className="mt-3 app-card--flat p-2"
              items={manualExercisePool}
              listClassName="space-y-2"
              getKey={(exercise) => exercise.id}
              renderItem={(exercise) => (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedManualExerciseIds.includes(exercise.id)}
                    onChange={() => toggleManualExercise(exercise.id)}
                  />
                  <span>{exercise.name} <span className="text-faint">({exercise.subcategory})</span></span>
                </label>
              )}
            />
            {selectedManualExerciseIds.length > 0 ? (
              <div className="mt-2 space-y-2 app-card--flat">
                <p className="text-xs text-muted">Reihenfolge festlegen</p>
                {selectedManualExerciseIds.map((exerciseId, index) => {
                  const exercise = trainingExercises.find((entry) => entry.id === exerciseId);
                  if (!exercise) return null;
                  const isFirst = index === 0;
                  const isLast = index === selectedManualExerciseIds.length - 1;
                  return (
                    <div key={`order-${exerciseId}`} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{index + 1}. {exercise.name}</span>
                      <div className="flex shrink-0 items-center gap-1">
                        {isFirst ? null : (
                          <button type="button" onClick={() => moveManualExercise(exerciseId, "up")} className="btn btn-ghost btn-xs">↑</button>
                        )}
                        {isLast ? null : (
                          <button type="button" onClick={() => moveManualExercise(exerciseId, "down")} className="btn btn-ghost btn-xs">↓</button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeManualExercise(exerciseId)}
                          className="rounded border border-rose-500/50 px-2 py-1 text-xs text-rose-200"
                          aria-label={`${exercise.name} entfernen`}
                          title="Übung löschen"
                        >
                          🗑
                        </button>
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
            <Link href={WEEKLY_WORKOUT_PATH} className="btn btn-ghost btn-sm flex-1 text-center">
              Abbrechen
            </Link>
          </div>
        </section>
      ) : null}

      {manualParam !== "1" && progress.status === "completed" && workoutFullyTracked ? (
        <section className="app-card--accent-emerald mt-4">
          <p className="text-sm text-strong">Workout abgeschlossen. Sehr stark! ✅</p>
        </section>
      ) : null}
      {completionBanner ? (
        <section className="app-card--accent-cyan mt-4">
          <p className="text-sm text-strong">{completionBanner}</p>
        </section>
      ) : null}

      {manualParam !== "1" ? (
        <section className="mt-4 ui-card">
          <div className="mb-3">
            <p className="text-xs uppercase tracking-wide text-muted">Workout-Fortschritt</p>
            <GradientFadeList
              className="mt-2"
              items={workoutForExecution.exercises}
              listClassName="grid grid-cols-2 gap-2 sm:grid-cols-4"
              getKey={(exercise, index) => `${workoutForExecution.id}-progress-${exercise.name}-${index}`}
              renderItem={(exercise, index) => {
                const status = getExerciseStatus(index);
                const isActive = index === safeExerciseIndex;
                const badgeClass =
                  status === "completed"
                    ? "progress-exercise-btn progress-exercise-btn--completed"
                    : status === "in_progress"
                      ? "progress-exercise-btn progress-exercise-btn--in-progress"
                      : "progress-exercise-btn";

                return (
                  <button
                    type="button"
                    onClick={() => jumpToExercise(index)}
                    className={`${badgeClass} ${isActive ? "progress-exercise-btn--active" : ""}`}
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
              }}
            />
          </div>

          {currentExercise ? (
            <article className="list-card">
              <p className="text-xs uppercase tracking-wide text-muted">
                Exercise {safeExerciseIndex + 1}/{workoutForExecution.exercises.length}
              </p>
              <h3 className="mt-1 text-xl font-semibold">{currentExercise.name}</h3>
              {currentExerciseMeta?.videoUrl ?
                currentExerciseMeta.videoUrl.startsWith("data:video") ?
                  <video
                    controls
                    className="mt-2 max-h-48 w-full max-w-md rounded-lg border border-[var(--surface-border)]"
                    src={currentExerciseMeta.videoUrl}
                  />
                : <a
                    href={currentExerciseMeta.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="video-link-chip mt-2"
                  >
                    ▶ Drill-Video ansehen
                  </a>

              : null}
              {gymGoalHint?.kind === "injury" ? (
                <p className="hint-warning mt-2">
                  Übung für automatische Progression pausiert — weiter trainieren, aber keine Ziel-Zählung.
                </p>
              ) : null}
              {gymGoalHint?.kind === "goal" ? (
                <p className="hint-violet mt-2">
                  Aktives Ziel: {formatGymGoalSummary(gymGoalHint.goal)}
                </p>
              ) : null}
              {currentExerciseMeta?.notes ? <p className="mt-1 text-xs text-faint">{currentExerciseMeta.notes}</p> : null}
              <p className="text-sm text-muted">
                Satz {safeSetIndex + 1}/{currentExercise.sets.length}
              </p>
              {currentExercise.sets.length > 1 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {currentExercise.sets.map((_, setIdx) => (
                    <button
                      key={`${safeExerciseIndex}-set-tab-${setIdx}`}
                      type="button"
                      onClick={() => jumpToSet(setIdx)}
                      className={`set-tab ${safeSetIndex === setIdx ? "set-tab--active" : ""}`}
                    >
                      Satz {setIdx + 1}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="target-banner mt-4">
                <span className="font-semibold">Ziel:</span> {currentTargetText}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {currentMetricOptions.includes("weight") ? (
                  <label className="text-sm text-muted">
                    Gewicht (kg)
                    <input
                      value={currentLog.weight}
                      onChange={(event) => updateCurrentLog("weight", event.target.value)}
                      className="input mt-1"
                      inputMode="decimal"
                    />
                  </label>
                ) : null}

                {tracksRepsAndMakes ? (
                  <>
                    <label className="text-sm text-muted">
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
                        className="input mt-1"
                        inputMode="numeric"
                        placeholder="z. B. 40"
                      />
                    </label>
                    <label className="text-sm text-muted">
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
                        className="input mt-1"
                        inputMode="numeric"
                        placeholder="z. B. 36"
                      />
                    </label>
                    <label className="text-sm text-muted">
                      Misses
                      <div className="mt-1 flex gap-2">
                        <input
                          value={currentLog.misses ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            const reps = shootingRepsTotal;
                            const misses = parseNonNegative(value);
                            if (reps > 0 && misses > reps) {
                              setSetValidationError("Misses dürfen nicht größer als Reps sein.");
                            }
                            patchCurrentLog({
                              misses: value,
                              makes: reps > 0 ? String(Math.max(0, reps - misses)) : currentLog.makes,
                            });
                          }}
                          className="input"
                          inputMode="numeric"
                          placeholder={`Auto: ${Math.max(0, shootingRepsTotal - parseNonNegative(currentLog.makes))}`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const total = shootingRepsTotal;
                            const makes = parseNonNegative(currentLog.makes);
                            const auto = Math.max(0, total - makes);
                            patchCurrentLog({ misses: String(auto), makes: String(Math.max(0, total - auto)) });
                          }}
                          className="btn btn-outline btn-xs shrink-0"
                          aria-label="Misses automatisch aus Reps minus Makes setzen"
                        >
                          = Reps − Makes
                        </button>
                      </div>
                    </label>
                  </>
                ) : currentMetricOptions.includes("reps") ? (
                  <label className="text-sm text-muted">
                    Reps
                    <input
                      value={currentLog.reps}
                      onChange={(event) => updateCurrentLog("reps", event.target.value)}
                      className="input mt-1"
                      inputMode="numeric"
                    />
                  </label>
                ) : null}

                {currentMetricOptions.includes("time") ? (
                  <label className="text-sm text-muted">
                    Zeit ({currentExerciseMeta?.timeUnit === "seconds" ? "Sek." : "Min."})
                    <input
                      value={currentLog.time ?? ""}
                      onChange={(event) => updateCurrentLog("time", event.target.value)}
                      className="input mt-1"
                      inputMode="decimal"
                    />
                  </label>
                ) : null}

                {currentMetricOptions.includes("distance") ? (
                  <label className="text-sm text-muted">
                    Distanz
                    <div className="mt-1 flex gap-2">
                      <input
                        value={currentLog.distance ?? ""}
                        onChange={(event) => updateCurrentLog("distance", event.target.value)}
                        className="input"
                        inputMode="decimal"
                      />
                      <select
                        value={currentLog.distanceUnit ?? "m"}
                        onChange={(event) => updateCurrentLog("distanceUnit", event.target.value)}
                        className="input"
                      >
                        <option value="m">m</option>
                        <option value="km">km</option>
                      </select>
                    </div>
                  </label>
                ) : null}

                {currentMetricOptions.includes("points") ? (
                  <label className="text-sm text-muted">
                    Punkte (optional, zählt nicht als Reps)
                    <input
                      value={currentLog.points ?? ""}
                      onChange={(event) => updateCurrentLog("points", event.target.value)}
                      className="input mt-1"
                      inputMode="numeric"
                    />
                  </label>
                ) : null}
              </div>

              {!isRestDay ? (
                <div className="mt-3">
                  <label className="text-sm text-muted">Satz-Notiz (optional)</label>
                  <input
                    type="text"
                    value={currentLog.note ?? ""}
                    onChange={(event) => updateCurrentLog("note", event.target.value)}
                    className="textarea mt-1"
                    placeholder="z. B. Technik, Ballgefühl …"
                  />
                </div>
              ) : null}

              {!isRestDay ? (
                <div className="mt-3 app-card--flat">
                  <div className="flex items-baseline justify-between">
                    <p className="text-xs uppercase tracking-wide text-muted">Anstrengung (RPE)</p>
                    <p className="text-sm font-semibold text-strong tabular-nums">
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
                  <div className="mt-1 flex justify-between text-[10px] text-faint">
                    <span>locker</span>
                    <span>moderat</span>
                    <span>schwer</span>
                    <span>maximal</span>
                  </div>
                </div>
              ) : null}

              <div className="mt-3 text-sm text-muted">
                <p>
                  Ziel: {currentTargetText}
                </p>
                <p className="mt-1">
                  Aktuell: {isGymWorkout ? `${currentLog.weight || 0} kg × ${currentLog.reps || 0}` : tracksRepsAndMakes ? `${shootingRepsTotal} Reps • ${currentLog.makes || 0} Makes • ${parseNonNegative(currentLog.misses) || Math.max(0, shootingRepsTotal - parseNonNegative(currentLog.makes))} Misses` : `${currentLog.reps || 0} Reps${currentLog.time ? ` • ${currentLog.time} ${currentExerciseMeta?.timeUnit === "seconds" ? "Sek." : "Min."}` : ""}${currentLog.distance ? ` • ${currentLog.distance} ${currentLog.distanceUnit ?? "m"}` : ""}`}
                </p>
              </div>
              {setValidationError ? <p className="mt-2 text-sm text-rose-300">{setValidationError}</p> : null}

              <div className="mt-4 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleWorkoutPrimaryAction}
                    disabled={progress.status === "completed" && workoutFullyTracked}
                    className="btn btn-primary btn-sm disabled:opacity-50"
                  >
                    {workoutPrimaryLabel}
                  </button>
                  {canEndWorkout ? (
                    <button type="button" onClick={() => void endWorkoutEarly()} className="btn btn-outline btn-sm">
                      Workout beenden
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={finishSet}
                    className="btn btn-emerald btn-sm"
                  >
                    Satz abschließen
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => jumpToSet(Math.max(0, safeSetIndex - 1))}
                  disabled={safeSetIndex <= 0}
                  className="btn btn-outline btn-xs disabled:opacity-40"
                >
                  ← Satz zurück
                </button>
                <button
                  type="button"
                  onClick={addSetToCurrentExercise}
                  className="btn btn-cyan btn-sm"
                >
                  Satz hinzufügen
                </button>
                <button
                  type="button"
                  onClick={() => jumpToSet(Math.min(currentExercise.sets.length - 1, safeSetIndex + 1))}
                  disabled={safeSetIndex >= currentExercise.sets.length - 1}
                  className="btn btn-outline btn-xs disabled:opacity-40"
                >
                  Satz vor →
                </button>
                </div>
              </div>
            </article>
          ) : (
            <p className="text-sm text-faint">
              {isRestDay ? "Keine Zeit aktiv – heute ist kein Training geplant." : "Keine Exercise im Workout gefunden."}
            </p>
          )}
        </section>
      ) : null}

      <div className="mt-4">
        <Link href={WEEKLY_WORKOUT_PATH} className="btn btn-ghost btn-sm">
          ← Zurück zum Weekly Plan
        </Link>
      </div>
      {showTipsReminder ? (
        <div className="modal-overlay">
          <div className="modal-panel w-full max-w-lg">
            <h3 className="section-title">Fokus vor dem Start</h3>
            <p className="mt-1 text-sm text-muted">
              Lies deine Notizen kurz durch, dann starte konzentriert.
            </p>
            <div className="mt-3 max-h-72 overflow-auto pr-1">
              <PerformanceTipsAccordion tips={activePerformanceTips} basketballMode={currentBasketballMode} />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn btn-outline btn-sm w-full"
                onClick={() => setShowTipsReminder(false)}
              >
                Schließen
              </button>
              <button
                type="button"
                className="btn btn-emerald btn-sm w-full"
                onClick={() => {
                  setShowTipsReminder(false);
                  persistProgress({
                    ...progress,
                    status: "in_progress",
                    endedAtIso: undefined,
                    startedAtIso: undefined,
                    elapsedSeconds: undefined,
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
        <div className="modal-overlay">
          <div className="modal-panel w-full max-w-md">
            <h3 className="section-title">Regeneration ergänzen?</h3>
            <p className="mt-2 text-sm text-muted">
              Soll zusätzlich ein Regenerations-Workout eingeplant werden?
            </p>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                className="btn btn-outline btn-sm w-full"
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
                className="btn btn-emerald btn-sm w-full"
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
                className="btn btn-primary btn-sm w-full"
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
