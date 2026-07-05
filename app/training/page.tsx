"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  categories,
  defaultExercises,
  defaultWorkouts,
  exerciseSubcategoriesByCategory,
  workoutSubcategoriesByCategory,
  type Category,
  type Exercise,
  type MetricKey,
  type Workout,
} from "@/lib/training-data";
import { matchesDrillCatalogFilters, DEFAULT_DRILL_FILTERS, type DrillCatalogFilters } from "@/lib/drill-catalog-filters";
import { rankByFuzzySearch } from "@/lib/fuzzy-search";
import { loadExercises, loadWorkouts, persistTrainingData, syncTrainingDataFromServer } from "@/lib/training-storage";
import { ExercisesTab, TabSwitcher, type TrainingTab, WorkoutsTab, WorkoutCreateForm, ExerciseCreateForm } from "@/components/training/TrainingTabs";
import TopSubTabs from "@/components/TopSubTabs";
import ExpandableCatalogSearch from "@/components/training/ExpandableCatalogSearch";
import CatalogSearchPanel from "@/components/training/CatalogSearchPanel";
import Sheet from "@/components/ui/Sheet";
import IconButton, { PlusIcon } from "@/components/ui/IconButton";
import { addManualGameToday } from "@/lib/plan-day-actions";
import {
  buildTrainingHref,
  getTrainingTabFromParam,
  loadTrainingTab,
  persistTrainingTab,
} from "@/lib/ui-navigation-state";
import { toLocalDateKey } from "@/lib/workout";
import { normalizeMetricKeysForCategory } from "@/lib/workout-metrics";

const CUSTOM_SUBCATEGORY_KEY = "bt.custom-subcategories.v1";

type SubcategoryMap = Record<Category, string[]>;

function buildInitialSubcategoryMap(): SubcategoryMap {
  return {
    Basketball: [...new Set([...workoutSubcategoriesByCategory.Basketball, ...exerciseSubcategoriesByCategory.Basketball])],
    Gym: [...new Set([...workoutSubcategoriesByCategory.Gym, ...exerciseSubcategoriesByCategory.Gym])],
    Home: [...new Set([...workoutSubcategoriesByCategory.Home, ...exerciseSubcategoriesByCategory.Home])],
    Regeneration: [...new Set([...workoutSubcategoriesByCategory.Regeneration, ...exerciseSubcategoriesByCategory.Regeneration])],
  };
}

function loadCustomSubcategories(): Partial<SubcategoryMap> | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(CUSTOM_SUBCATEGORY_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<SubcategoryMap>;
  } catch {
    return null;
  }
}

function parseMetricInput(value?: string) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized === "-") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

const MAX_EXERCISE_VIDEO_BYTES = Math.floor(2.5 * 1024 * 1024);

function readExerciseVideoFile(
  file: File | null,
  onDone: (dataUrl: string) => void,
  onError: (message: string) => void,
) {
  if (!file) return;
  if (!file.type.startsWith("video/")) {
    onError("Bitte eine Videodatei wählen.");
    return;
  }
  if (file.size > MAX_EXERCISE_VIDEO_BYTES) {
    onError(`Video zu groß (max. ca. ${(MAX_EXERCISE_VIDEO_BYTES / (1024 * 1024)).toFixed(1)} MB).`);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const r = String(reader.result ?? "");
    if (r.length > MAX_EXERCISE_VIDEO_BYTES * 2) {
      onError("Kodiertes Video zu groß für den lokalen Speicher — bitte kürzeres Video oder Link nutzen.");
      return;
    }
    onDone(r);
  };
  reader.onerror = () => onError("Datei konnte nicht gelesen werden.");
  reader.readAsDataURL(file);
}

function normalizeSetTargetsLength(
  current: Partial<Record<MetricKey, string>>[],
  setCountValue: string,
): Partial<Record<MetricKey, string>>[] {
  const count = Math.max(1, Number(setCountValue) || 1);
  const next = [...current];
  while (next.length < count) next.push({});
  return next.slice(0, count);
}

function validateMetricTargets(category: Category, metricKeys: MetricKey[], targets: Partial<Record<MetricKey, string>>) {
  const normalizedMetrics = normalizeMetricKeysForCategory(category, metricKeys);
  if (metricKeys.length === 0) {
    return "Bitte mindestens ein Messfeld auswählen.";
  }

  for (const metric of normalizedMetrics) {
    const value = parseMetricInput(targets[metric]);
    if (value === null) {
      return `Bitte für ${metric} einen gültigen Zahlenwert eingeben.`;
    }
    if (value < 0) {
      return `${metric} darf nicht negativ sein.`;
    }
  }

  const reps = parseMetricInput(targets.reps);
  const makes = parseMetricInput(targets.makes);
  const misses = parseMetricInput(targets.misses);
  const distance = parseMetricInput(targets.distance);
  const time = parseMetricInput(targets.time);
  const base = reps;

  if (base !== null) {
    if (makes !== null && makes > base) return "Makes darf nicht größer als Reps sein.";
    if (misses !== null && misses > base) return "Misses darf nicht größer als Reps sein.";
    if (makes !== null && misses !== null && makes + misses > base) {
      return "Makes + Misses darf nicht größer als Reps sein.";
    }
  }

  if (normalizedMetrics.includes("distance") && distance !== null && time === null) {
    return "Bitte gib bei Distanz auch eine Zeit an.";
  }

  return null;
}

function TrainingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clientReady, setClientReady] = useState(true);
  const [activeTab, setActiveTab] = useState<TrainingTab | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const completedParam = searchParams.get("completed");
  const tabParam = searchParams.get("tab");
  const completionMessage = useMemo(() => {
    if (completedParam === "workout") return "Workout abgeschlossen ✅";
    if (completedParam === "exercise") return "Exercise abgeschlossen ✅";
    return null;
  }, [completedParam]);

  useEffect(() => {
    const fromUrl = getTrainingTabFromParam(tabParam);
    const fromStorage = loadTrainingTab();
    const nextTab = fromUrl ?? fromStorage ?? "Workouts";
    setActiveTab(nextTab);
    persistTrainingTab(nextTab);
    setClientReady(true);
    if (!fromUrl) {
      router.replace(
        buildTrainingHref(nextTab, completedParam ? { completed: completedParam } : undefined),
        { scroll: false },
      );
    }
  }, [tabParam, completedParam, router]);

  useEffect(() => {
    if (!completedParam || !activeTab) return;
    const timer = window.setTimeout(() => {
      router.replace(buildTrainingHref(activeTab), { scroll: false });
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [activeTab, completedParam, router]);

  const handleTabChange = (tab: TrainingTab) => {
    setActiveTab(tab);
    persistTrainingTab(tab);
    router.replace(buildTrainingHref(tab, completedParam ? { completed: completedParam } : undefined), { scroll: false });
  };

  const startGameToday = (kind: "game" | "game_training") => {
    addManualGameToday(kind);
    window.dispatchEvent(new Event("bt:plan-updated"));
    const dateKey = toLocalDateKey(new Date());
    router.push(`/game-track?date=${dateKey}&context=${kind}`);
  };

  const [workoutCategory, setWorkoutCategory] = useState<Category>("Basketball");
  const [workoutSubcategory, setWorkoutSubcategory] = useState("Shooting");

  const [exerciseCategory, setExerciseCategory] = useState<Category>("Basketball");
  const [exerciseSubcategory, setExerciseSubcategory] = useState("Shooting");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogSearchExpanded, setCatalogSearchExpanded] = useState(false);
  const [drillFilters, setDrillFilters] = useState<DrillCatalogFilters>(DEFAULT_DRILL_FILTERS);
  const [workoutSelectionReady, setWorkoutSelectionReady] = useState(false);
  const [exerciseSelectionReady, setExerciseSelectionReady] = useState(false);

  const [exercises, setExercises] = useState<Exercise[]>(() => loadExercises());
  const [workouts, setWorkouts] = useState<Workout[]>(() => loadWorkouts());

  const [newWorkoutName, setNewWorkoutName] = useState("");
  const [newWorkoutExerciseIds, setNewWorkoutExerciseIds] = useState<string[]>([]);
  const [newWorkoutCategory, setNewWorkoutCategory] = useState<Category>("Basketball");
  const [newWorkoutSubcategory, setNewWorkoutSubcategory] = useState("Handles");
  const [newWorkoutNotes, setNewWorkoutNotes] = useState("");

  const [newExerciseName, setNewExerciseName] = useState("");
  const [newExerciseCategory, setNewExerciseCategory] = useState<Category>("Basketball");
  const [newExerciseSubcategory, setNewExerciseSubcategory] = useState("Handles");
  const [newExerciseNotes, setNewExerciseNotes] = useState("");
  const [newExerciseVideoUrl, setNewExerciseVideoUrl] = useState("");
  const [newExerciseDurationMin, setNewExerciseDurationMin] = useState("10");
  const [newExerciseDurationUnit, setNewExerciseDurationUnit] = useState<"minutes" | "seconds">("minutes");
  const [newExerciseSetCount, setNewExerciseSetCount] = useState("1");
  const [newExerciseMetrics, setNewExerciseMetrics] = useState<MetricKey[]>(["reps"]);
  const [newExerciseTargets, setNewExerciseTargets] = useState<Partial<Record<MetricKey, string>>>({});
  const [newExerciseSetTargets, setNewExerciseSetTargets] = useState<Partial<Record<MetricKey, string>>[]>([{}]);
  const [newExerciseError, setNewExerciseError] = useState<string | null>(null);
  const [subcategoriesByCategory, setSubcategoriesByCategory] = useState<SubcategoryMap>(() => buildInitialSubcategoryMap());
  const [customSubcategoriesLoaded, setCustomSubcategoriesLoaded] = useState(false);

  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [editWorkoutName, setEditWorkoutName] = useState("");
  const [editWorkoutCategory, setEditWorkoutCategory] = useState<Category>("Basketball");
  const [editWorkoutSubcategory, setEditWorkoutSubcategory] = useState("Handles");
  const [editWorkoutNotes, setEditWorkoutNotes] = useState("");
  const [editWorkoutExerciseIds, setEditWorkoutExerciseIds] = useState<string[]>([]);

  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [editExerciseName, setEditExerciseName] = useState("");
  const [editExerciseCategory, setEditExerciseCategory] = useState<Category>("Basketball");
  const [editExerciseSubcategory, setEditExerciseSubcategory] = useState("Handles");
  const [editExerciseNotes, setEditExerciseNotes] = useState("");
  const [editExerciseVideoUrl, setEditExerciseVideoUrl] = useState("");
  const [editExerciseDurationMin, setEditExerciseDurationMin] = useState("10");
  const [editExerciseDurationUnit, setEditExerciseDurationUnit] = useState<"minutes" | "seconds">("minutes");
  const [editExerciseSetCount, setEditExerciseSetCount] = useState("1");
  const [editExerciseMetrics, setEditExerciseMetrics] = useState<MetricKey[]>(["reps"]);
  const [editExerciseTargets, setEditExerciseTargets] = useState<Partial<Record<MetricKey, string>>>({});
  const [editExerciseSetTargets, setEditExerciseSetTargets] = useState<Partial<Record<MetricKey, string>>[]>([{}]);
  const [editExerciseError, setEditExerciseError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const base = buildInitialSubcategoryMap();
      const custom = loadCustomSubcategories();
      setSubcategoriesByCategory(
        custom
          ? {
              Basketball: [...new Set([...(custom.Basketball ?? []), ...base.Basketball])],
              Gym: [...new Set([...(custom.Gym ?? []), ...base.Gym])],
              Home: [...new Set([...(custom.Home ?? []), ...base.Home])],
              Regeneration: [...new Set([...(custom.Regeneration ?? []), ...base.Regeneration])],
            }
          : base,
      );
      setCustomSubcategoriesLoaded(true);
      void syncTrainingDataFromServer().then((data) => {
        setExercises(data.exercises);
        setWorkouts(data.workouts);
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const workoutsForSelection = useMemo(() => {
    if (!workoutSelectionReady) return [];
    return workouts.filter(
      (workout) => workout.category === workoutCategory && workout.subcategory === workoutSubcategory,
    );
  }, [workouts, workoutCategory, workoutSubcategory, workoutSelectionReady]);

  const workoutExerciseOptions = useMemo(
    () =>
      exercises.filter(
        (exercise) =>
          exercise.category === newWorkoutCategory &&
          (newWorkoutSubcategory === "Komplett" || exercise.subcategory === newWorkoutSubcategory),
      ),
    [exercises, newWorkoutCategory, newWorkoutSubcategory],
  );

  const catalogSearchExercises = useMemo(() => {
    return rankByFuzzySearch(
      exercises.filter(
        (exercise) => exercise.subcategory !== "Komplett" && matchesDrillCatalogFilters(exercise, drillFilters),
      ),
      catalogSearch,
      (exercise) => [exercise.name, exercise.category, exercise.subcategory, exercise.notes],
    ).map((entry) => entry.item);
  }, [exercises, catalogSearch, drillFilters]);

  const catalogSearchWorkouts = useMemo(() => {
    return rankByFuzzySearch(workouts, catalogSearch, (workout) => [
      workout.name,
      workout.category,
      workout.subcategory,
      workout.notes,
    ]).map((entry) => entry.item);
  }, [workouts, catalogSearch]);

  const exercisesForSelection = useMemo(() => {
    if (!exerciseSelectionReady) return [];
    return exercises
      .filter(
        (exercise) =>
          exercise.category === exerciseCategory &&
          exercise.subcategory === exerciseSubcategory &&
          exercise.subcategory !== "Komplett",
      )
      .filter((exercise) => matchesDrillCatalogFilters(exercise, drillFilters));
  }, [exercises, exerciseCategory, exerciseSubcategory, drillFilters, exerciseSelectionReady]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!customSubcategoriesLoaded) return;
    window.localStorage.setItem(CUSTOM_SUBCATEGORY_KEY, JSON.stringify(subcategoriesByCategory));
  }, [customSubcategoriesLoaded, subcategoriesByCategory]);

  function handleWorkoutCategorySelect(category: Category) {
    setWorkoutCategory(category);
    setWorkoutSubcategory(subcategoriesByCategory[category][0]);
    setWorkoutSelectionReady(true);
  }

  function handleExerciseCategorySelect(category: Category) {
    setExerciseCategory(category);
    setExerciseSubcategory(subcategoriesByCategory[category][0]);
    setExerciseSelectionReady(true);
  }

  function handleNewWorkoutCategoryChange(category: Category) {
    setNewWorkoutCategory(category);
    setNewWorkoutSubcategory(subcategoriesByCategory[category][0]);
    setNewWorkoutExerciseIds([]);
  }

  function handleNewExerciseCategoryChange(category: Category) {
    setNewExerciseCategory(category);
    setNewExerciseSubcategory(subcategoriesByCategory[category][0]);
    setNewExerciseMetrics((current) => normalizeMetricKeysForCategory(category, current));
  }

  function toggleNewExerciseMetric(metric: MetricKey) {
    setNewExerciseError(null);
    setNewExerciseMetrics((current) => {
      if (current.includes(metric)) {
        return current.filter((value) => value !== metric);
      }
      return normalizeMetricKeysForCategory(newExerciseCategory, [...current, metric]);
    });
  }

  async function handleAddWorkout(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedName = newWorkoutName.trim();
    if (!normalizedName) return;

    const nextLevel =
      workouts.filter(
        (workout) => workout.category === newWorkoutCategory && workout.subcategory === newWorkoutSubcategory,
      ).length + 1;

    const nextWorkouts = [
      ...workouts,
      {
        id: `wo-${Date.now()}`,
        name: normalizedName,
        category: newWorkoutCategory,
        subcategory: newWorkoutSubcategory,
        notes: newWorkoutNotes.trim() || undefined,
        level: nextLevel,
        exerciseIds: newWorkoutExerciseIds,
      },
    ];

    setWorkouts(nextWorkouts);
    await persistTrainingData(exercises, nextWorkouts);

    setNewWorkoutName("");
    setNewWorkoutExerciseIds([]);
    setNewWorkoutNotes("");
  }

  async function handleAddExercise(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedName = newExerciseName.trim();
        if (!normalizedName) return;

    const normalizedMetrics = normalizeMetricKeysForCategory(newExerciseCategory, newExerciseMetrics);
    const validationError = validateMetricTargets(newExerciseCategory, normalizedMetrics, newExerciseTargets);
    if (validationError) {
      setNewExerciseError(validationError);
      return;
    }

    const nextExercises = [
      ...exercises,
      {
        id: `ex-${Date.now()}`,
        name: normalizedName,
        durationMin: Math.max(1, Number(newExerciseDurationMin) || 10),
        timeUnit: newExerciseDurationUnit,
        setCount: Math.max(1, Number(newExerciseSetCount) || 1),
        category: newExerciseCategory,
        subcategory: newExerciseSubcategory,
        notes: newExerciseNotes.trim() || undefined,
        videoUrl: newExerciseVideoUrl.trim() || undefined,
        metricKeys: normalizedMetrics.length > 0 ? normalizedMetrics : (["reps"] as MetricKey[]),
        targetByMetric: Object.fromEntries(
          Object.entries(newExerciseTargets).flatMap(([metric, value]) => {
            const parsed = parseMetricInput(value);
            return parsed === null ? [] : [[metric, parsed]];
          }),
        ) as Partial<Record<MetricKey, number>>,
        setTargetsByMetric: normalizeSetTargetsLength(newExerciseSetTargets, newExerciseSetCount).map((setTargets) =>
          Object.fromEntries(
            Object.entries(setTargets).flatMap(([metric, value]) => {
              const parsed = parseMetricInput(value);
              return parsed === null ? [] : [[metric, parsed]];
            }),
          ) as Partial<Record<MetricKey, number>>,
        ),
        trackingType: (newExerciseMetrics.includes("weight") ? "weight" : "reps") as "weight" | "reps",
        targetValue: Number(newExerciseTargets.reps ?? newExerciseTargets.weight ?? "") || undefined,
      },
    ];

    setExercises(nextExercises);
    await persistTrainingData(nextExercises, workouts);

    setNewExerciseName("");
    setNewExerciseNotes("");
    setNewExerciseVideoUrl("");
    setNewExerciseDurationMin("10");
    setNewExerciseDurationUnit("minutes");
    setNewExerciseSetCount("1");
    setNewExerciseMetrics(["reps"]);
    setNewExerciseTargets({});
    setNewExerciseSetTargets([{}]);
    setNewExerciseError(null);
  }

  function startEditWorkout(workout: Workout) {
    setEditingWorkoutId(workout.id);
    setEditWorkoutName(workout.name);
    setEditWorkoutCategory(workout.category);
    setEditWorkoutSubcategory(workout.subcategory);
    setEditWorkoutNotes(workout.notes ?? "");
    setEditWorkoutExerciseIds(workout.exerciseIds);
  }

  function cancelEditWorkout() {
    setEditingWorkoutId(null);
    setEditWorkoutExerciseIds([]);
  }

  function handleEditWorkoutCategoryChange(category: Category) {
    setEditWorkoutCategory(category);
    setEditWorkoutSubcategory(subcategoriesByCategory[category][0]);
    setEditWorkoutExerciseIds([]);
  }

  async function handleUpdateWorkout(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingWorkoutId) return;

    const normalizedName = editWorkoutName.trim();
    if (!normalizedName) return;

    const nextWorkouts = workouts.map((entry) =>
      entry.id === editingWorkoutId
        ? {
            ...entry,
            name: normalizedName,
            category: editWorkoutCategory,
            subcategory: editWorkoutSubcategory,
            notes: editWorkoutNotes.trim() || undefined,
            exerciseIds: editWorkoutExerciseIds,
          }
        : entry,
    );

    setWorkouts(nextWorkouts);
    await persistTrainingData(exercises, nextWorkouts);

    setEditingWorkoutId(null);
    setEditWorkoutExerciseIds([]);
  }

  async function handleDeleteWorkout(workoutId: string) {
    const nextWorkouts = workouts.filter((workout) => workout.id !== workoutId);
    setWorkouts(nextWorkouts);
    await persistTrainingData(exercises, nextWorkouts);
    if (editingWorkoutId === workoutId) {
      setEditingWorkoutId(null);
      setEditWorkoutExerciseIds([]);
    }
  }

  function startEditExercise(exercise: Exercise) {
    setEditingExerciseId(exercise.id);
    setEditExerciseName(exercise.name);
    setEditExerciseCategory(exercise.category);
    setEditExerciseSubcategory(exercise.subcategory);
    setEditExerciseNotes(exercise.notes ?? "");
    setEditExerciseVideoUrl(exercise.videoUrl ?? "");
    setEditExerciseDurationMin(String(exercise.durationMin));
    setEditExerciseDurationUnit(exercise.timeUnit ?? "minutes");
    setEditExerciseSetCount(String(exercise.setCount ?? 1));
    setEditExerciseMetrics(exercise.metricKeys);
    setEditExerciseTargets(
      Object.fromEntries(
        Object.entries(exercise.targetByMetric ?? {}).map(([metric, value]) => [metric, String(value)]),
      ) as Partial<Record<MetricKey, string>>,
    );
    setEditExerciseSetTargets(
      normalizeSetTargetsLength(
        (exercise.setTargetsByMetric ?? []).map((setTargets) =>
          Object.fromEntries(Object.entries(setTargets ?? {}).map(([metric, value]) => [metric, String(value)])),
        ) as Partial<Record<MetricKey, string>>[],
        String(exercise.setCount ?? 1),
      ),
    );
    setEditExerciseError(null);
  }

  function cancelEditExercise() {
    setEditingExerciseId(null);
    setEditExerciseNotes("");
    setEditExerciseVideoUrl("");
    setEditExerciseDurationMin("10");
    setEditExerciseDurationUnit("minutes");
    setEditExerciseSetCount("1");
    setEditExerciseMetrics(["reps"]);
    setEditExerciseTargets({});
    setEditExerciseSetTargets([{}]);
    setEditExerciseError(null);
  }

  function handleEditExerciseCategoryChange(category: Category) {
    setEditExerciseCategory(category);
    setEditExerciseSubcategory(subcategoriesByCategory[category][0]);
    setEditExerciseMetrics((current) => normalizeMetricKeysForCategory(category, current));
  }

  function toggleEditExerciseMetric(metric: MetricKey) {
    setEditExerciseError(null);
    setEditExerciseMetrics((current) => {
      if (current.includes(metric)) {
        return current.filter((value) => value !== metric);
      }
      return normalizeMetricKeysForCategory(editExerciseCategory, [...current, metric]);
    });
  }

  async function handleUpdateExercise(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingExerciseId) return;

    const normalizedName = editExerciseName.trim();
    if (!normalizedName) return;

    const validationError = validateMetricTargets(editExerciseCategory, editExerciseMetrics, editExerciseTargets);
    if (validationError) {
      setEditExerciseError(validationError);
      return;
    }

    const metrics: MetricKey[] = normalizeMetricKeysForCategory(editExerciseCategory, editExerciseMetrics.length > 0 ? editExerciseMetrics : ["reps"]);
    const numericTargets = Object.fromEntries(
      Object.entries(editExerciseTargets).flatMap(([metric, value]) => {
        const parsed = parseMetricInput(value);
        return parsed === null ? [] : [[metric, parsed]];
      }),
    ) as Partial<Record<MetricKey, number>>;

    const nextExercises = exercises.map((entry: Exercise): Exercise => {
      if (entry.id !== editingExerciseId) {
        return entry;
      }

      const updatedExercise: Exercise = {
        ...entry,
        name: normalizedName,
        durationMin: Math.max(1, Number(editExerciseDurationMin) || 10),
        timeUnit: editExerciseDurationUnit,
        setCount: Math.max(1, Number(editExerciseSetCount) || 1),
        category: editExerciseCategory,
        subcategory: editExerciseSubcategory,
        notes: editExerciseNotes.trim() || undefined,
        videoUrl: editExerciseVideoUrl.trim() || undefined,
        metricKeys: metrics,
        targetByMetric: numericTargets,
        setTargetsByMetric: normalizeSetTargetsLength(editExerciseSetTargets, editExerciseSetCount).map((setTargets) =>
          Object.fromEntries(
            Object.entries(setTargets).flatMap(([metric, value]) => {
              const parsed = parseMetricInput(value);
              return parsed === null ? [] : [[metric, parsed]];
            }),
          ) as Partial<Record<MetricKey, number>>,
        ),
        trackingType: (metrics.includes("weight") ? "weight" : "reps") as "weight" | "reps",
        targetValue: Number(editExerciseTargets.reps ?? editExerciseTargets.weight ?? "") || undefined,
      };

      return updatedExercise;
    });

    setExercises(nextExercises);
    await persistTrainingData(nextExercises, workouts);

    setEditingExerciseId(null);
    setEditExerciseNotes("");
    setEditExerciseVideoUrl("");
    setEditExerciseDurationMin("10");
    setEditExerciseDurationUnit("minutes");
    setEditExerciseSetCount("1");
    setEditExerciseMetrics(["reps"]);
    setEditExerciseTargets({});
    setEditExerciseSetTargets([{}]);
    setEditExerciseError(null);
  }

  async function handleDeleteExercise(exerciseId: string) {
    const nextExercises = exercises.filter((exercise) => exercise.id !== exerciseId);
    const nextWorkouts = workouts.map((workout) => ({
      ...workout,
      exerciseIds: workout.exerciseIds.filter((id) => id !== exerciseId),
    }));

    setExercises(nextExercises);
    setWorkouts(nextWorkouts);
    await persistTrainingData(nextExercises, nextWorkouts);

    if (editingExerciseId === exerciseId) {
      setEditingExerciseId(null);
      setEditExerciseNotes("");
      setEditExerciseVideoUrl("");
      setEditExerciseDurationMin("10");
      setEditExerciseDurationUnit("minutes");
      setEditExerciseSetCount("1");
      setEditExerciseMetrics(["reps"]);
      setEditExerciseTargets({});
      setEditExerciseSetTargets([{}]);
      setEditExerciseError(null);
    }
  }

  function handleCreateSubcategory(category: Category, name: string) {
    const normalized = name.trim();
    if (!normalized) return;
    setSubcategoriesByCategory((current) => {
      const existing = current[category];
      if (existing.some((entry) => entry.toLowerCase() === normalized.toLowerCase())) return current;
      return { ...current, [category]: [...existing, normalized] };
    });
  }

  async function handleDeleteSubcategory(category: Category, subcategory: string) {
    const confirmed = window.confirm(`Soll die Unterkategorie "${subcategory}" mit ihren Übungen wirklich gelöscht werden?`);
    if (!confirmed) return;
    const nextExercises = exercises.filter((exercise) => !(exercise.category === category && exercise.subcategory === subcategory));
    const deletedExerciseIds = new Set(
      exercises.filter((exercise) => exercise.category === category && exercise.subcategory === subcategory).map((exercise) => exercise.id),
    );
    const nextWorkouts = workouts
      .filter((workout) => !(workout.category === category && workout.subcategory === subcategory))
      .map((workout) => ({
        ...workout,
        exerciseIds: workout.exerciseIds.filter((id) => !deletedExerciseIds.has(id)),
      }));

    setExercises(nextExercises);
    setWorkouts(nextWorkouts);
    setSubcategoriesByCategory((current) => ({
      ...current,
      [category]: current[category].filter((entry) => entry !== subcategory),
    }));

    await persistTrainingData(nextExercises, nextWorkouts);
  }

  return (
    <main className="app-container animate-in">
      <div className="flex w-full flex-col gap-4">
        {!clientReady || !activeTab ? (
          <p className="text-sm text-muted">Lade Training …</p>
        ) : (
        <>
        <div className="training-top">
          <div className="training-top__main">
            <div>
              <p className="page-eyebrow">Bibliothek</p>
              <h1 className="page-title">Training</h1>
              <p className="page-subtitle">Workouts und Exercises verwalten, filtern und starten.</p>
            </div>
            <div className="training-top__nav-row">
              <TopSubTabs items={[{ label: "Weekly", href: "/weekly-workout" }, { label: "Training", href: buildTrainingHref(activeTab) }]} />
              <div className="training-top__tools">
                <ExpandableCatalogSearch
                  value={catalogSearch}
                  onChange={setCatalogSearch}
                  expanded={catalogSearchExpanded}
                  onExpandedChange={setCatalogSearchExpanded}
                  placeholder="Exercise oder Workout suchen…"
                  ariaLabel="Katalog durchsuchen"
                />
                <IconButton
                  variant="primary"
                  label={activeTab === "Workouts" ? "Workout hinzufügen" : "Exercise hinzufügen"}
                  onClick={() => setCreateOpen(true)}
                >
                  <PlusIcon />
                </IconButton>
              </div>
            </div>
            <div className="training-top__nav-row">
              <TabSwitcher activeTab={activeTab} onTabChange={handleTabChange} />
              <div className="training-top__game-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-xs shrink-0"
                  onClick={() => startGameToday("game")}
                >
                  Spieltag starten
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-xs shrink-0"
                  onClick={() => startGameToday("game_training")}
                >
                  Spieltraining starten
                </button>
              </div>
            </div>
          </div>
        </div>

        {completionMessage ? (
          <div className="alert-success flex items-center justify-between gap-2">
            <span>{completionMessage}</span>
            <button type="button" onClick={() => router.replace(buildTrainingHref(activeTab ?? "Workouts"))} className="btn btn-ghost btn-xs">
              ×
            </button>
          </div>
        ) : null}

        {catalogSearch.trim() ? (
          <CatalogSearchPanel
            query={catalogSearch}
            exercises={catalogSearchExercises}
            workouts={catalogSearchWorkouts}
            availableExercises={exercises}
            onEditExercise={startEditExercise}
            onEditWorkout={startEditWorkout}
            onClose={() => {
              setCatalogSearch("");
              setCatalogSearchExpanded(false);
            }}
          />
        ) : null}

        {activeTab === "Workouts" ? (
          <WorkoutsTab
                      categories={categories}
            subcategories={subcategoriesByCategory}
            onCreateSubcategory={handleCreateSubcategory}
            onDeleteSubcategory={handleDeleteSubcategory}
            selectedCategory={workoutCategory}
            selectedSubcategory={workoutSubcategory}
            onSubcategoryChange={setWorkoutSubcategory}
            workouts={workoutsForSelection}
            availableExercises={exercises}
            selectionReady={workoutSelectionReady}
            onCategorySelect={handleWorkoutCategorySelect}
            createWorkoutExerciseOptions={workoutExerciseOptions}
            newWorkoutName={newWorkoutName}
            onNewWorkoutNameChange={setNewWorkoutName}
            selectedExerciseIds={newWorkoutExerciseIds}
            onSelectedExerciseIdsChange={setNewWorkoutExerciseIds}
            newWorkoutCategory={newWorkoutCategory}
            onNewWorkoutCategoryChange={handleNewWorkoutCategoryChange}
            newWorkoutSubcategory={newWorkoutSubcategory}
            onNewWorkoutSubcategoryChange={setNewWorkoutSubcategory}
            newWorkoutNotes={newWorkoutNotes}
            onNewWorkoutNotesChange={setNewWorkoutNotes}
            onCreateWorkout={handleAddWorkout}
            editingWorkoutId={editingWorkoutId}
            onStartEditWorkout={startEditWorkout}
            onCancelEditWorkout={cancelEditWorkout}
            editWorkoutName={editWorkoutName}
            onEditWorkoutNameChange={setEditWorkoutName}
            editWorkoutCategory={editWorkoutCategory}
            onEditWorkoutCategoryChange={handleEditWorkoutCategoryChange}
            editWorkoutSubcategory={editWorkoutSubcategory}
            onEditWorkoutSubcategoryChange={setEditWorkoutSubcategory}
            editWorkoutNotes={editWorkoutNotes}
            onEditWorkoutNotesChange={setEditWorkoutNotes}
            editWorkoutExerciseIds={editWorkoutExerciseIds}
            onEditWorkoutExerciseIdsChange={setEditWorkoutExerciseIds}
            onUpdateWorkout={handleUpdateWorkout}
            onDeleteWorkout={handleDeleteWorkout}
          />
        ) : (
          <ExercisesTab
            categories={categories}
            subcategories={subcategoriesByCategory}
            onCreateSubcategory={handleCreateSubcategory}
            onDeleteSubcategory={handleDeleteSubcategory}
            selectedCategory={exerciseCategory}
            selectedSubcategory={exerciseSubcategory}
            onSubcategoryChange={setExerciseSubcategory}
            drillFilters={drillFilters}
            onDrillFilterChange={(patch) => setDrillFilters((current) => ({ ...current, ...patch }))}
            onDrillFiltersReset={() => setDrillFilters(DEFAULT_DRILL_FILTERS)}
            visibleExercises={exercisesForSelection}
            selectionReady={exerciseSelectionReady}
            onCategorySelect={handleExerciseCategorySelect}
            newExerciseName={newExerciseName}
            onNewExerciseNameChange={setNewExerciseName}
            newExerciseCategory={newExerciseCategory}
            onNewExerciseCategoryChange={handleNewExerciseCategoryChange}
            newExerciseSubcategory={newExerciseSubcategory}
            onNewExerciseSubcategoryChange={setNewExerciseSubcategory}
            newExerciseNotes={newExerciseNotes}
            onNewExerciseNotesChange={setNewExerciseNotes}
            newExerciseVideoUrl={newExerciseVideoUrl}
            onNewExerciseVideoUrlChange={setNewExerciseVideoUrl}
            onNewExerciseVideoFile={(file) =>
              readExerciseVideoFile(file, setNewExerciseVideoUrl, (msg) => window.alert(msg))
            }
            newExerciseDurationMin={newExerciseDurationMin}
            onNewExerciseDurationMinChange={setNewExerciseDurationMin}
            newExerciseDurationUnit={newExerciseDurationUnit}
            onNewExerciseDurationUnitChange={setNewExerciseDurationUnit}
            newExerciseSetCount={newExerciseSetCount}
            onNewExerciseSetCountChange={(value) => {
              setNewExerciseSetCount(value);
              setNewExerciseSetTargets((current) => normalizeSetTargetsLength(current, value));
            }}
            newExerciseMetrics={newExerciseMetrics}
            onToggleNewExerciseMetric={toggleNewExerciseMetric}
            newExerciseTargets={newExerciseTargets}
            onNewExerciseTargetChange={(metric, value) =>
              setNewExerciseTargets((current) => ({ ...current, [metric]: value }))
            }
            newExerciseSetTargets={newExerciseSetTargets}
            onNewExerciseSetTargetChange={(setIndex, metric, value) =>
              setNewExerciseSetTargets((current) => {
                const normalized = normalizeSetTargetsLength(current, newExerciseSetCount);
                normalized[setIndex] = { ...(normalized[setIndex] ?? {}), [metric]: value };
                return [...normalized];
              })
            }
            onCreateExercise={handleAddExercise}
            editingExerciseId={editingExerciseId}
            onStartEditExercise={startEditExercise}
            onCancelEditExercise={cancelEditExercise}
            editExerciseName={editExerciseName}
            onEditExerciseNameChange={setEditExerciseName}
            editExerciseCategory={editExerciseCategory}
            onEditExerciseCategoryChange={handleEditExerciseCategoryChange}
            editExerciseSubcategory={editExerciseSubcategory}
            onEditExerciseSubcategoryChange={setEditExerciseSubcategory}
            editExerciseNotes={editExerciseNotes}
            onEditExerciseNotesChange={setEditExerciseNotes}
            editExerciseVideoUrl={editExerciseVideoUrl}
            onEditExerciseVideoUrlChange={setEditExerciseVideoUrl}
            onEditExerciseVideoFile={(file) =>
              readExerciseVideoFile(file, setEditExerciseVideoUrl, (msg) => window.alert(msg))
            }
            editExerciseDurationMin={editExerciseDurationMin}
            onEditExerciseDurationMinChange={setEditExerciseDurationMin}
            editExerciseDurationUnit={editExerciseDurationUnit}
            onEditExerciseDurationUnitChange={setEditExerciseDurationUnit}
            editExerciseSetCount={editExerciseSetCount}
            onEditExerciseSetCountChange={(value) => {
              setEditExerciseSetCount(value);
              setEditExerciseSetTargets((current) => normalizeSetTargetsLength(current, value));
            }}
            editExerciseMetrics={editExerciseMetrics}
            onToggleEditExerciseMetric={toggleEditExerciseMetric}
            editExerciseTargets={editExerciseTargets}
            onEditExerciseTargetChange={(metric, value) =>
              setEditExerciseTargets((current) => ({ ...current, [metric]: value }))
            }
            editExerciseSetTargets={editExerciseSetTargets}
            onEditExerciseSetTargetChange={(setIndex, metric, value) =>
              setEditExerciseSetTargets((current) => {
                const normalized = normalizeSetTargetsLength(current, editExerciseSetCount);
                normalized[setIndex] = { ...(normalized[setIndex] ?? {}), [metric]: value };
                return [...normalized];
              })
            }
            onUpdateExercise={handleUpdateExercise}
            onDeleteExercise={handleDeleteExercise}
            newExerciseError={newExerciseError}
            editExerciseError={editExerciseError}
          />
        )}

        <Sheet
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title={activeTab === "Workouts" ? "Neues Workout" : "Neue Exercise"}
          description={
            activeTab === "Workouts"
              ? "Workout aus Kategorie, Unterkategorie und Exercises zusammenstellen."
              : "Exercise mit Metriken, Sets und optionalen Video-Anhang anlegen."
          }
        >
          {activeTab === "Workouts" ? (
            <WorkoutCreateForm
              categories={categories}
              subcategories={subcategoriesByCategory}
              createWorkoutExerciseOptions={workoutExerciseOptions}
              newWorkoutName={newWorkoutName}
              onNewWorkoutNameChange={setNewWorkoutName}
              selectedExerciseIds={newWorkoutExerciseIds}
              onSelectedExerciseIdsChange={setNewWorkoutExerciseIds}
              newWorkoutCategory={newWorkoutCategory}
              onNewWorkoutCategoryChange={handleNewWorkoutCategoryChange}
              newWorkoutSubcategory={newWorkoutSubcategory}
              onNewWorkoutSubcategoryChange={setNewWorkoutSubcategory}
              newWorkoutNotes={newWorkoutNotes}
              onNewWorkoutNotesChange={setNewWorkoutNotes}
              onCreateWorkout={handleAddWorkout}
              availableExercises={exercises}
            />
          ) : (
            <ExerciseCreateForm
              categories={categories}
              subcategories={subcategoriesByCategory}
              newExerciseName={newExerciseName}
              onNewExerciseNameChange={setNewExerciseName}
              newExerciseCategory={newExerciseCategory}
              onNewExerciseCategoryChange={handleNewExerciseCategoryChange}
              newExerciseSubcategory={newExerciseSubcategory}
              onNewExerciseSubcategoryChange={setNewExerciseSubcategory}
              newExerciseNotes={newExerciseNotes}
              onNewExerciseNotesChange={setNewExerciseNotes}
              newExerciseVideoUrl={newExerciseVideoUrl}
              onNewExerciseVideoUrlChange={setNewExerciseVideoUrl}
              onNewExerciseVideoFile={(file) =>
                readExerciseVideoFile(file, setNewExerciseVideoUrl, (msg) => window.alert(msg))
              }
              newExerciseDurationMin={newExerciseDurationMin}
              onNewExerciseDurationMinChange={setNewExerciseDurationMin}
              newExerciseDurationUnit={newExerciseDurationUnit}
              onNewExerciseDurationUnitChange={setNewExerciseDurationUnit}
              newExerciseSetCount={newExerciseSetCount}
              onNewExerciseSetCountChange={(value) => {
                setNewExerciseSetCount(value);
                setNewExerciseSetTargets((current) => normalizeSetTargetsLength(current, value));
              }}
              newExerciseMetrics={newExerciseMetrics}
              onToggleNewExerciseMetric={toggleNewExerciseMetric}
              newExerciseTargets={newExerciseTargets}
              onNewExerciseTargetChange={(metric, value) =>
                setNewExerciseTargets((current) => ({ ...current, [metric]: value }))
              }
              newExerciseSetTargets={newExerciseSetTargets}
              onNewExerciseSetTargetChange={(setIndex, metric, value) =>
                setNewExerciseSetTargets((current) => {
                  const normalized = normalizeSetTargetsLength(current, newExerciseSetCount);
                  normalized[setIndex] = { ...(normalized[setIndex] ?? {}), [metric]: value };
                  return [...normalized];
                })
              }
              onCreateExercise={handleAddExercise}
              newExerciseError={newExerciseError}
            />
          )}
        </Sheet>
        </>
        )}
      </div>
    </main>
  );
}

export default function TrainingPage() {
  return (
    <Suspense
      fallback={
        <main className="app-container">
          <p className="text-sm text-muted">Lade Training …</p>
        </main>
      }
    >
      <TrainingPageContent />
    </Suspense>
  );
}
