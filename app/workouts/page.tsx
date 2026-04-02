"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type MetricKey } from "@/lib/training-data";
import { loadExercises, loadWorkouts } from "@/lib/training-storage";
import { getWorkoutSessions } from "@/lib/session-storage";
import {
  CompletedWorkoutHistoryEntry,
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
  parseWorkoutProgress,
  toLocalDateKey,
  type WorkoutPlan,
} from "@/lib/workout";
import { appendWorkoutXpEntry } from "@/lib/level-system";

const MANUAL_DAY_WORKOUTS_KEY = "bt.manual-day-workouts.v1";

type ManualDayWorkout = {
  id: string;
  title: string;
  sport: "Basketball" | "Gym" | "Home" | "Rest";
  subcategory: string;
  notes: string;
  exerciseIds: string[];
};

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
  category: "Basketball" | "Gym" | "Home";
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
  category: "Basketball" | "Gym" | "Home";
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

function WorkoutsPageContent() {
  const searchParams = useSearchParams();
  const dayParam = searchParams.get("day");
  const workoutIdParam = searchParams.get("workoutId");
  const autoWorkoutParam = searchParams.get("autoWorkout");
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
  const [manualTitle, setManualTitle] = useState("Manuelles Workout");
  const [manualCategory, setManualCategory] = useState<"Basketball" | "Gym" | "Home" | "Rest">("Basketball");
  const [manualSubcategory, setManualSubcategory] = useState("");
  const [manualSearch, setManualSearch] = useState("");
  const [manualTemplateWorkoutId, setManualTemplateWorkoutId] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [selectedManualExerciseIds, setSelectedManualExerciseIds] = useState<string[]>([]);
  const [manualStorageVersion, setManualStorageVersion] = useState(0);

  const autoWorkoutFromWeekly = useMemo<WorkoutPlan | null>(() => {
    if (!autoWorkoutParam) return null;
    try {
      const decoded = decodeURIComponent(autoWorkoutParam);
      const parsed = JSON.parse(decoded) as {
        title?: string;
        sport?: string;
        subcategory?: string;
        notes?: string;
        exerciseIds?: string[];
        exercises?: string[];
      };

      const sport = parsed.sport === "Gym" || parsed.sport === "Home" ? parsed.sport : "Basketball";
      const exerciseNames = parsed.exercises?.filter(Boolean) ?? [];
      if (!parsed.title || exerciseNames.length === 0) return null;

      return {
        id: `auto-weekly-${effectiveDay}`,
        title: parsed.title,
        sport,
        subcategory: parsed.subcategory ?? "-",
        exercises: (parsed.exerciseIds?.length
          ? parsed.exerciseIds
              .map((exerciseId) => trainingExercises.find((exercise) => exercise.id === exerciseId))
              .filter((exercise): exercise is NonNullable<typeof exercise> => Boolean(exercise))
              .map((exercise) => ({
                name: exercise.name,
                sets: [{
                  targetKg: exercise.trackingType === "weight" ? exercise.targetByMetric?.weight ?? exercise.targetValue ?? 0 : 0,
                  targetReps: exercise.targetByMetric?.reps ?? exercise.targetByMetric?.makes ?? exercise.targetValue ?? 12,
                }],
              }))
          : exerciseNames.map((name) => ({
              name,
              sets: [{ targetKg: 0, targetReps: sport === "Gym" ? 8 : 20 }],
            }))),
      };
    } catch {
      return null;
    }
  }, [autoWorkoutParam, effectiveDay, trainingExercises]);

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
        const targetReps = exercise.targetByMetric?.reps ?? exercise.targetByMetric?.makes ?? exercise.targetValue ?? 12;
        const targetKg = exercise.trackingType === "weight" ? exercise.targetByMetric?.weight ?? exercise.targetValue ?? 20 : 0;
        return {
          name: exercise.name,
          sets: [{ targetKg, targetReps }],
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
  const activeWorkout = activeWorkoutBase;
  const workoutForExecution = useMemo<WorkoutPlan>(() => {
    if (activeWorkout.sport === "Gym") return activeWorkout;
    return {
      ...activeWorkout,
      exercises: activeWorkout.exercises.map((exercise) => ({
        ...exercise,
        sets: [exercise.sets[0] ?? { targetKg: 0, targetReps: 0 }],
      })),
    };
  }, [activeWorkout]);
  const fallbackProgress = useMemo(
    () => getDefaultWorkoutProgress(dateKey, workoutForExecution),
    [dateKey, workoutForExecution],
  );

  const [progress, setProgress] = useState<WorkoutProgress>(fallbackProgress);
  const [selectedMetricByExercise, setSelectedMetricByExercise] = useState<Record<number, MetricKey>>({});
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

    const targetSubcategories = ["Handles", "Shooting", "Finishing", "Defense", "Push", "Pull", "Legs", "Core"];
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
          trainingExercises
            .filter((exercise) => exercise.category === manualCategory)
            .map((exercise) => exercise.subcategory),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [manualCategory, trainingExercises],
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
    if (manualCategory === "Rest") return [];
    const query = manualSearch.trim().toLowerCase();
    return trainingExercises.filter((exercise) => {
      if (exercise.category !== manualCategory) return false;
      if (manualSubcategory && exercise.subcategory !== manualSubcategory) return false;
      if (!query) return true;
      return `${exercise.name} ${exercise.subcategory}`.toLowerCase().includes(query);
    });
  }, [manualCategory, manualSearch, manualSubcategory, trainingExercises]);
  const savedManualWorkouts = useMemo(() => {
    void manualStorageVersion;
    const raw = window.localStorage.getItem(MANUAL_DAY_WORKOUTS_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as Record<string, ManualDayWorkout[]>;
      return parsed[dateKey] ?? [];
    } catch {
      return [];
    }
  }, [dateKey, manualStorageVersion]);

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
  const currentLog = progress.logs[currentLogKey] ?? { weight: "", reps: "", tries: "", makes: "" };
  const exerciseMeta = useMemo(() => {
    const lookup = new Map(trainingExercises.map((exercise) => [exercise.name, exercise]));
    return workoutForExecution.exercises.map((exercise) => lookup.get(exercise.name) ?? null);
  }, [trainingExercises, workoutForExecution.exercises]);
  const currentExerciseMeta = exerciseMeta[safeExerciseIndex];
  const currentMetricOptions = (currentExerciseMeta?.metricKeys?.length ? currentExerciseMeta.metricKeys : ["reps"]) as MetricKey[];
  const activeMetric = selectedMetricByExercise[safeExerciseIndex] ?? currentMetricOptions[0];
  const tracksTriesAndMakes = !isGymWorkout && currentMetricOptions.includes("tries") && currentMetricOptions.includes("makes");
  const workoutNotes = useMemo(() => {
    const fromCatalog = customWorkoutFromCatalog ? trainingWorkouts.find((workout) => workout.id === customWorkoutFromCatalog.id)?.notes : null;
    return fromCatalog ?? null;
  }, [customWorkoutFromCatalog, trainingWorkouts]);

  const hasSetStarted = (exerciseIndex: number, setIndex: number) => {
    const key = buildSetLogKey(exerciseIndex, setIndex);
    const log = progress.logs[key];
    if (!log) return false;
    const reps = Number(log.reps) || 0;
    const weight = Number(log.weight) || 0;
    const tries = Number(log.tries) || 0;
    const makes = Number(log.makes) || 0;
    return reps > 0 || weight > 0 || tries > 0 || makes > 0;
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

  const updateCurrentLog = (field: "weight" | "reps" | "tries" | "makes", value: string) => {
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
  const applyManualWorkout = () => {
    if (manualCategory === "Rest") {
      setManualWorkout({
        id: `manual-rest-${Date.now()}`,
        title: manualTitle.trim() || "Ruhetag",
        sport: "Rest",
        subcategory: manualSubcategory.trim() || "Ruhetag",
        exercises: [],
      });
      setOverrideWorkoutId(null);
      window.localStorage.removeItem(overrideStorageKey);
      return;
    }
    const sameCategoryExercises = expandExercisesWithFamily({
      selectedExerciseIds: selectedManualExerciseIds,
      category: manualCategory,
      subcategory: manualSubcategory || undefined,
      exercises: trainingExercises,
    });
    if (!sameCategoryExercises.length) return;
    const selectedOrder = new Map(selectedManualExerciseIds.map((id, index) => [id, index]));
    const orderedIds = sameCategoryExercises.sort((left, right) => {
      const leftIndex = selectedOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = selectedOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      return left.name.localeCompare(right.name);
    });
    setManualWorkout({
      id: `manual-${Date.now()}`,
      title: manualTitle.trim() || "Manuelles Workout",
      sport: manualCategory,
      subcategory: manualSubcategory.trim() || sameCategoryExercises[0].subcategory,
      exercises: orderedIds.map((exercise) => ({
        name: exercise.name,
        sets: [{
          targetKg: exercise.trackingType === "weight" ? exercise.targetByMetric?.weight ?? exercise.targetValue ?? 0 : 0,
          targetReps: exercise.targetByMetric?.reps ?? exercise.targetByMetric?.makes ?? exercise.targetValue ?? 12,
        }],
      })),
    });
    setOverrideWorkoutId(null);
    window.localStorage.removeItem(overrideStorageKey);
  };
  const saveManualWorkoutForDay = () => {
    if (manualCategory !== "Rest" && selectedManualExerciseIds.length <= 0) return;
    const selectedExercises =
      manualCategory === "Rest"
        ? []
        : expandExercisesWithFamily({
            selectedExerciseIds: selectedManualExerciseIds,
            category: manualCategory,
            subcategory: manualSubcategory || undefined,
            exercises: trainingExercises,
          });
    const selectedOrder = new Map(selectedManualExerciseIds.map((id, index) => [id, index]));
    const orderedExerciseIds = selectedExercises
      .sort((left, right) => {
        const leftIndex = selectedOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = selectedOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        return left.name.localeCompare(right.name);
      })
      .map((exercise) => exercise.id);
    const nextEntry: ManualDayWorkout = {
      id: `manual-day-${Date.now()}`,
      title: manualTitle.trim() || "Manuelles Workout",
      sport: manualCategory,
      subcategory: manualSubcategory.trim() || selectedExercises[0]?.subcategory || "Ruhetag",
      notes: manualNotes.trim(),
      exerciseIds: orderedExerciseIds,
    };
    const raw = window.localStorage.getItem(MANUAL_DAY_WORKOUTS_KEY);
    let store: Record<string, ManualDayWorkout[]> = {};
    if (raw) {
      try {
        store = JSON.parse(raw) as Record<string, ManualDayWorkout[]>;
      } catch {
        store = {};
      }
    }
    store[dateKey] = [nextEntry, ...(store[dateKey] ?? [])];
    window.localStorage.setItem(MANUAL_DAY_WORKOUTS_KEY, JSON.stringify(store));
    setManualStorageVersion((previous) => previous + 1);
  };
  const loadSavedManualWorkout = (entry: ManualDayWorkout) => {
    setManualCategory(entry.sport);
    setManualSubcategory(entry.subcategory);
    setManualTitle(entry.title);
    setSelectedManualExerciseIds(entry.exerciseIds);
    setOverrideWorkoutId(null);
    window.localStorage.removeItem(overrideStorageKey);
    if (entry.sport === "Rest") {
      setManualWorkout({
        id: entry.id,
        title: entry.title,
        sport: "Rest",
        subcategory: entry.subcategory,
        exercises: [],
      });
      return;
    }
    const selectedExercises = entry.exerciseIds
      .map((exerciseId) => trainingExercises.find((exercise) => exercise.id === exerciseId))
      .filter((exercise): exercise is NonNullable<typeof exercise> => Boolean(exercise));
    if (!selectedExercises.length) return;
    setManualWorkout({
      id: entry.id,
      title: entry.title,
      sport: entry.sport,
      subcategory: entry.subcategory,
      exercises: selectedExercises.map((exercise) => ({
        name: exercise.name,
        sets: [{
          targetKg: exercise.trackingType === "weight" ? exercise.targetByMetric?.weight ?? exercise.targetValue ?? 0 : 0,
          targetReps: exercise.targetByMetric?.reps ?? exercise.targetByMetric?.makes ?? exercise.targetValue ?? 12,
        }],
      })),
    });
  };

  const startWorkout = () => {
    persistProgress({ ...progress, status: "in_progress" });
  };

  const completeWorkout = () => {
    const completedProgress: WorkoutProgress = { ...progress, status: "completed" };
    persistProgress(completedProgress);

    const totals = Object.values(completedProgress.logs).reduce(
      (accumulator, setLog) => {
        const reps = Number(setLog.reps) || 0;
        const makes = Number(setLog.makes) || 0;
        const tries = Number(setLog.tries) || 0;
        const weight = Number(setLog.weight) || 0;
        const effectiveReps = makes > 0 ? makes : reps;

        if (effectiveReps > 0 || weight > 0 || tries > 0) {
          accumulator.totalSets += 1;
        }

        accumulator.totalReps += effectiveReps;
        accumulator.totalVolumeKg += effectiveReps * weight;

        return accumulator;
      },
      { totalSets: 0, totalReps: 0, totalVolumeKg: 0 },
    );

    const historyEntry: CompletedWorkoutHistoryEntry = {
      id: `${completedProgress.date}-${completedProgress.workoutId}`,
      date: completedProgress.date,
      workoutId: completedProgress.workoutId,
      title: completedProgress.title,
      sport: completedProgress.sport,
      subcategory: completedProgress.subcategory,
      totalSets: totals.totalSets,
      totalReps: totals.totalReps,
      totalVolumeKg: totals.totalVolumeKg,
    };

    persistHistoryEntry(historyEntry);
    let achievedSets = 0;
    let totalSets = 0;
    workoutForExecution.exercises.forEach((exercise, exerciseIndex) => {
      exercise.sets.forEach((set, setIndex) => {
        totalSets += 1;
        const log = completedProgress.logs[buildSetLogKey(exerciseIndex, setIndex)];
        const reps = Number(log?.reps) || 0;
        const makes = Number(log?.makes) || 0;
        const weight = Number(log?.weight) || 0;
        const effectiveReps = makes > 0 ? makes : reps;
        const repsMet = effectiveReps >= set.targetReps;
        const weightMet = set.targetKg <= 0 || weight >= set.targetKg;
        if (repsMet && weightMet) {
          achievedSets += 1;
        }
      });
    });

    const qualityScore = totalSets > 0 ? achievedSets / totalSets : 0;
    const exerciseXp = achievedSets * 12;
    const workoutXp = 40 + Math.round(qualityScore * 60);
    const totalXp = exerciseXp + workoutXp;

    const xpResult = appendWorkoutXpEntry({
      id: `${completedProgress.date}-${completedProgress.workoutId}`,
      date: completedProgress.date,
      workoutId: completedProgress.workoutId,
      workoutTitle: completedProgress.title,
      exerciseXp,
      workoutXp,
      totalXp,
      achievedSets,
      totalSets,
      qualityScore,
    });

    if (xpResult.levelDelta > 0) {
      window.alert(`🎉 Level-Up! +${xpResult.levelDelta} Level`);
    } else if (xpResult.levelDelta < 0) {
      window.alert(`⬇️ Level-Down: ${Math.abs(xpResult.levelDelta)} Level verloren`);
    }
  };

  const finishSet = () => {
    const isLastSetInExercise = safeSetIndex === currentExercise.sets.length - 1;
    const isLastExercise = safeExerciseIndex === workoutForExecution.exercises.length - 1;

    if (isLastExercise && (!isGymWorkout || isLastSetInExercise)) {
      completeWorkout();
      return;
    }

    if (!isGymWorkout || isLastSetInExercise) {
      persistProgress({
        ...progress,
        exerciseIndex: safeExerciseIndex + 1,
        setIndex: 0,
        status: "in_progress",
      });
      return;
    }

    persistProgress({
      ...progress,
      setIndex: safeSetIndex + 1,
        status: "in_progress",
      });
  };

  return (
    <main className="min-h-screen bg-black p-6 pb-24 text-white">
      <h1 className="text-2xl font-bold">Workouts</h1>
      <p className="mt-2 text-zinc-400">Hier planst und startest du dein Training</p>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-xl font-semibold">{workoutForExecution.title}</h2>
        <p className="mt-1 text-sm text-zinc-400">Sport: {workoutForExecution.sport}</p>
        <p className="mt-1 text-sm text-zinc-400">Unterkategorie: {workoutForExecution.subcategory}</p>
        {workoutNotes ? <p className="mt-1 text-sm text-zinc-500">Notiz: {workoutNotes}</p> : null}

        <div className="mt-3 rounded-xl border border-zinc-700 bg-zinc-950 p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Übungen im Workout</p>
          <ul className="mt-2 space-y-1 text-sm text-zinc-200">
            {workoutForExecution.exercises.map((exercise, index) => (
              <li key={`${workoutForExecution.id}-overview-${exercise.name}`}>
                {index + 1}. {exercise.name}
              </li>
            ))}
          </ul>
        </div>
        {effectiveDay === todayDayIndex && !manualWorkout ? (
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
      {manualParam === "1" ? (
        <section className="mt-4 rounded-2xl border border-emerald-700 bg-emerald-950/20 p-4">
          <h2 className="text-lg font-semibold text-emerald-200">Workout manuell erstellen</h2>
          <p className="mt-1 text-xs text-emerald-100">Fehlende Unterkategorien diese Woche: {recommendations.missingSubcategories.join(", ") || "keine"}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select
              value={manualCategory}
              onChange={(event) => {
                const nextCategory = event.target.value as "Basketball" | "Gym" | "Home" | "Rest";
                setManualCategory(nextCategory);
                setManualSubcategory("");
                setManualTemplateWorkoutId("");
                setSelectedManualExerciseIds([]);
              }}
              className="w-full rounded-lg border border-emerald-700 bg-black px-3 py-2 text-white"
            >
              <option value="Basketball">Basketball</option>
              <option value="Gym">Gym</option>
              <option value="Home">Home</option>
              <option value="Rest">Ruhetag</option>
            </select>
            <select
              value={manualSubcategory}
              onChange={(event) => setManualSubcategory(event.target.value)}
              className="w-full rounded-lg border border-emerald-700 bg-black px-3 py-2 text-white"
            >
              <option value="">Kein fester Schwerpunkt</option>
              {manualSubcategoryOptions.map((subcategory) => (
                <option key={subcategory} value={subcategory}>
                  {subcategory}
                </option>
              ))}
            </select>
          </div>
          <select
            value={manualTemplateWorkoutId}
            onChange={(event) => applyTemplateWorkout(event.target.value)}
            className="mt-2 w-full rounded-lg border border-emerald-700 bg-black px-3 py-2 text-white"
          >
            <option value="">Workout-Template optional wählen</option>
            {manualTemplateOptions.map((workout) => (
              <option key={workout.id} value={workout.id}>
                {workout.name}
              </option>
            ))}
          </select>
          <input
            value={manualTitle}
            onChange={(event) => setManualTitle(event.target.value)}
            className="mt-3 w-full rounded-lg border border-emerald-700 bg-black px-3 py-2 text-white"
            placeholder="Workout-Name"
          />
          <textarea
            value={manualNotes}
            onChange={(event) => setManualNotes(event.target.value)}
            className="mt-2 w-full rounded-lg border border-emerald-700 bg-black px-3 py-2 text-white"
            placeholder="Notizen"
            rows={2}
          />
          {manualCategory !== "Rest" ? (
            <>
              <input
                value={manualSearch}
                onChange={(event) => setManualSearch(event.target.value)}
                className="mt-3 w-full rounded-lg border border-emerald-700 bg-black px-3 py-2 text-white"
                placeholder="Exercise suchen..."
              />
              <div className="mt-3 max-h-48 space-y-2 overflow-auto rounded-lg border border-zinc-700 p-2">
                {manualExercisePool.map((exercise) => (
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
          ) : (
            <p className="mt-3 text-sm text-zinc-300">Ruhetag gewählt: es werden keine Exercises geladen.</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={applyManualWorkout}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold"
            >
              Manuelles Workout laden
            </button>
            <button
              type="button"
              onClick={saveManualWorkoutForDay}
              className="rounded-lg border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-200"
            >
              Für diesen Tag speichern
            </button>
          </div>
          {savedManualWorkouts.length > 0 ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-zinc-400">Gespeicherte Workouts für {dateKey}</p>
              {savedManualWorkouts.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => loadSavedManualWorkout(entry)}
                  className="block w-full rounded-lg border border-zinc-700 px-3 py-2 text-left text-sm hover:bg-zinc-900"
                >
                  {entry.title} • {entry.sport} • {entry.subcategory}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {progress.status === "completed" ? (
        <section className="mt-4 rounded-2xl border border-emerald-700 bg-emerald-950/40 p-4 text-emerald-200">
          Workout abgeschlossen. Sehr stark! ✅
        </section>
      ) : null}

      <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-3">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Workout-Fortschritt</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {workoutForExecution.exercises.map((exercise, index) => {
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
        </div>

        {currentExercise ? (
          <article className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400">
              Exercise {safeExerciseIndex + 1}/{workoutForExecution.exercises.length}
            </p>
            <h3 className="mt-1 text-xl font-semibold">{currentExercise.name}</h3>
            {currentExerciseMeta?.notes ? <p className="mt-1 text-xs text-zinc-500">{currentExerciseMeta.notes}</p> : null}
            <p className="text-sm text-zinc-400">
              Satz {safeSetIndex + 1}/{currentExercise.sets.length}
            </p>

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

              {tracksTriesAndMakes ? (
                <>
                  <label className="text-sm text-zinc-300">
                    Tries
                    <input
                      value={currentLog.tries ?? ""}
                      onChange={(event) => updateCurrentLog("tries", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white"
                      inputMode="numeric"
                    />
                  </label>
                  <label className="text-sm text-zinc-300">
                    Makes
                    <input
                      value={currentLog.makes ?? ""}
                      onChange={(event) => updateCurrentLog("makes", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white"
                      inputMode="numeric"
                    />
                  </label>
                </>
              ) : (
                <label className="text-sm text-zinc-300">
                  {isGymWorkout ? "Reps" : `Wert (${activeMetric})`}
                  <input
                    value={currentLog.reps}
                    onChange={(event) => updateCurrentLog("reps", event.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white"
                    inputMode="numeric"
                  />
                </label>
              )}
            </div>
            {!isGymWorkout && currentMetricOptions.length > 0 && !tracksTriesAndMakes ? (
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
                Ziel: {isGymWorkout ? `${currentSet.targetKg} kg × ${currentSet.targetReps} Reps` : tracksTriesAndMakes ? `${currentExerciseMeta?.targetByMetric?.tries ?? "-"} Tries • ${currentSet.targetReps} Makes` : `${currentSet.targetReps} Treffer/Reps`}
              </p>
              <p className="mt-1">
                Aktuell: {isGymWorkout ? `${currentLog.weight || 0} kg × ${currentLog.reps || 0}` : tracksTriesAndMakes ? `${currentLog.tries || 0} Tries • ${currentLog.makes || 0} Makes` : `${currentLog.reps || 0}`}
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={startWorkout}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Workout starten
              </button>
              <button
                type="button"
                onClick={finishSet}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Satz abschließen
              </button>
            </div>
          </article>
        ) : (
          <p className="text-sm text-zinc-500">
            {isRestDay ? "Ruhetag aktiv – heute ist kein Training geplant." : "Keine Exercise im Workout gefunden."}
          </p>
        )}
      </section>

      <div className="mt-4">
        <Link href="/Weekly-Workout" className="text-sm text-indigo-300 hover:text-indigo-200">
          ← Zurück zum Weekly Plan
        </Link>
      </div>
    </main>
  );
}

export default function WorkoutsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-black p-6 pb-24 text-white">Workouts werden geladen...</main>}>
      <WorkoutsPageContent />
    </Suspense>
  );
}