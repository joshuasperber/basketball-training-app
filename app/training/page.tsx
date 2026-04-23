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
import { persistTrainingData, syncTrainingDataFromServer } from "@/lib/training-storage";
import { ExercisesTab, TabSwitcher, type TrainingTab, WorkoutsTab } from "@/components/training/TrainingTabs";

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

function normalizeSetTargetsLength(
  current: Partial<Record<MetricKey, string>>[],
  setCountValue: string,
): Partial<Record<MetricKey, string>>[] {
  const count = Math.max(1, Number(setCountValue) || 1);
  const next = [...current];
  while (next.length < count) next.push({});
  return next.slice(0, count);
}

function validateMetricTargets(metricKeys: MetricKey[], targets: Partial<Record<MetricKey, string>>) {
  if (metricKeys.length === 0) {
    return "Bitte mindestens ein Messfeld auswählen.";
  }

  for (const metric of metricKeys) {
    if (metric === "completed") continue;
    const value = parseMetricInput(targets[metric]);
    if (value === null) {
      return `Bitte für ${metric} einen gültigen Zahlenwert eingeben.`;
    }
    if (value < 0) {
      return `${metric} darf nicht negativ sein.`;
    }
  }

  const tries = parseMetricInput(targets.tries);
  const reps = parseMetricInput(targets.reps);
  const makes = parseMetricInput(targets.makes);
  const misses = parseMetricInput(targets.misses);
  const base = tries ?? reps;

  if (base !== null) {
    if (makes !== null && makes > base) return "Makes darf nicht größer als Trys/Reps sein.";
    if (misses !== null && misses > base) return "Misses darf nicht größer als Trys/Reps sein.";
    if (makes !== null && misses !== null && makes + misses > base) {
      return "Makes + Misses darf nicht größer als Trys/Reps sein.";
    }
  }

  return null;
}

function TrainingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TrainingTab>("Workouts");
  const completedParam = searchParams.get("completed");
  const completionMessage = useMemo(() => {
    if (completedParam === "workout") return "Workout abgeschlossen ✅";
    if (completedParam === "exercise") return "Exercise abgeschlossen ✅";
    return null;
  }, [completedParam]);

  const [workoutCategory, setWorkoutCategory] = useState<Category>("Basketball");
  const [workoutSubcategory, setWorkoutSubcategory] = useState("Shooting");

  const [exerciseCategory, setExerciseCategory] = useState<Category>("Basketball");
  const [exerciseSubcategory, setExerciseSubcategory] = useState("Shooting");
  const [exerciseSearch, setExerciseSearch] = useState("");

  const [exercises, setExercises] = useState<Exercise[]>(defaultExercises);
  const [workouts, setWorkouts] = useState<Workout[]>(defaultWorkouts);

  const [newWorkoutName, setNewWorkoutName] = useState("");
  const [newWorkoutExerciseIds, setNewWorkoutExerciseIds] = useState<string[]>([]);
  const [newWorkoutCategory, setNewWorkoutCategory] = useState<Category>("Basketball");
  const [newWorkoutSubcategory, setNewWorkoutSubcategory] = useState("Handles");
  const [newWorkoutNotes, setNewWorkoutNotes] = useState("");

  const [newExerciseName, setNewExerciseName] = useState("");
  const [newExerciseCategory, setNewExerciseCategory] = useState<Category>("Basketball");
  const [newExerciseSubcategory, setNewExerciseSubcategory] = useState("Handles");
  const [newExerciseNotes, setNewExerciseNotes] = useState("");
  const [newExerciseDurationMin, setNewExerciseDurationMin] = useState("10");
  const [newExerciseDurationUnit, setNewExerciseDurationUnit] = useState<"minutes" | "seconds">("minutes");
  const [newExerciseSetCount, setNewExerciseSetCount] = useState("1");
  const [newExerciseMetrics, setNewExerciseMetrics] = useState<MetricKey[]>(["reps"]);
  const [newExerciseTargets, setNewExerciseTargets] = useState<Partial<Record<MetricKey, string>>>({});
  const [newExerciseSetTargets, setNewExerciseSetTargets] = useState<Partial<Record<MetricKey, string>>[]>([{}]);
  const [newExerciseError, setNewExerciseError] = useState<string | null>(null);
  const [subcategoriesByCategory, setSubcategoriesByCategory] = useState<SubcategoryMap>(() => {
    const base = buildInitialSubcategoryMap();
    const custom = loadCustomSubcategories();
    if (!custom) return base;
    return {
      Basketball: [...new Set([...(custom.Basketball ?? []), ...base.Basketball])],
      Gym: [...new Set([...(custom.Gym ?? []), ...base.Gym])],
      Home: [...new Set([...(custom.Home ?? []), ...base.Home])],
      Regeneration: [...new Set([...(custom.Regeneration ?? []), ...base.Regeneration])],
    };
  });

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
  const [editExerciseDurationMin, setEditExerciseDurationMin] = useState("10");
  const [editExerciseDurationUnit, setEditExerciseDurationUnit] = useState<"minutes" | "seconds">("minutes");
  const [editExerciseSetCount, setEditExerciseSetCount] = useState("1");
  const [editExerciseMetrics, setEditExerciseMetrics] = useState<MetricKey[]>(["reps"]);
  const [editExerciseTargets, setEditExerciseTargets] = useState<Partial<Record<MetricKey, string>>>({});
  const [editExerciseSetTargets, setEditExerciseSetTargets] = useState<Partial<Record<MetricKey, string>>[]>([{}]);
  const [editExerciseError, setEditExerciseError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void syncTrainingDataFromServer().then((data) => {
        setExercises(data.exercises);
        setWorkouts(data.workouts);
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const workoutsForSelection = useMemo(
    () =>
      workouts.filter(
        (workout) => workout.category === workoutCategory && workout.subcategory === workoutSubcategory,
      ),
    [workouts, workoutCategory, workoutSubcategory],
  );

  const workoutExerciseOptions = useMemo(
    () =>
      exercises.filter(
        (exercise) =>
          exercise.category === newWorkoutCategory &&
          (newWorkoutSubcategory === "Komplett" || exercise.subcategory === newWorkoutSubcategory),
      ),
    [exercises, newWorkoutCategory, newWorkoutSubcategory],
  );

  const exercisesForSelection = useMemo(
    () =>
      exercises.filter(
        (exercise) => exercise.category === exerciseCategory && exercise.subcategory === exerciseSubcategory && exercise.subcategory !== "Komplett",
      ),
    [exercises, exerciseCategory, exerciseSubcategory],
  );

  const allExercisesBySearch = useMemo(() => {
    const searchTerm = exerciseSearch.trim().toLowerCase();
    if (!searchTerm) return exercises.filter((exercise) => exercise.subcategory !== "Komplett");

    return exercises.filter((exercise) => {
      if (exercise.subcategory === "Komplett") return false;
      return (
        exercise.name.toLowerCase().includes(searchTerm) ||
        exercise.category.toLowerCase().includes(searchTerm) ||
        exercise.subcategory.toLowerCase().includes(searchTerm)
      );
    });
  }, [exerciseSearch, exercises]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CUSTOM_SUBCATEGORY_KEY, JSON.stringify(subcategoriesByCategory));
  }, [subcategoriesByCategory]);

  function handleWorkoutCategoryChange(category: Category) {
    setWorkoutCategory(category);
    setWorkoutSubcategory(subcategoriesByCategory[category][0]);
  }

  function handleExerciseCategoryChange(category: Category) {
    setExerciseCategory(category);
    setExerciseSubcategory(subcategoriesByCategory[category][0]);
  }

  function handleNewWorkoutCategoryChange(category: Category) {
    setNewWorkoutCategory(category);
    setNewWorkoutSubcategory(subcategoriesByCategory[category][0]);
    setNewWorkoutExerciseIds([]);
  }

  function handleNewExerciseCategoryChange(category: Category) {
    setNewExerciseCategory(category);
    setNewExerciseSubcategory(subcategoriesByCategory[category][0]);
  }

  function toggleNewExerciseMetric(metric: MetricKey) {
    setNewExerciseError(null);
    setNewExerciseMetrics((current) => {
      if (current.includes(metric)) {
        return current.filter((value) => value !== metric);
      }
      return [...current, metric];
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

    const validationError = validateMetricTargets(newExerciseMetrics, newExerciseTargets);
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
        metricKeys: newExerciseMetrics.length > 0 ? newExerciseMetrics : (["reps"] as MetricKey[]),
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
    setEditExerciseDurationMin("10");
    setEditExerciseDurationUnit("minutes");
    setEditExerciseSetCount("1");
    setEditExerciseMetrics(["reps"]);
    setEditExerciseTargets({});
    setEditExerciseError(null);
  }

  function handleEditExerciseCategoryChange(category: Category) {
    setEditExerciseCategory(category);
    setEditExerciseSubcategory(subcategoriesByCategory[category][0]);
  }

  function toggleEditExerciseMetric(metric: MetricKey) {
    setEditExerciseError(null);
    setEditExerciseMetrics((current) => {
      if (current.includes(metric)) {
        return current.filter((value) => value !== metric);
      }
      return [...current, metric];
    });
  }

  async function handleUpdateExercise(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingExerciseId) return;

    const normalizedName = editExerciseName.trim();
    if (!normalizedName) return;

    const validationError = validateMetricTargets(editExerciseMetrics, editExerciseTargets);
    if (validationError) {
      setEditExerciseError(validationError);
      return;
    }

    const metrics: MetricKey[] = editExerciseMetrics.length > 0 ? editExerciseMetrics : ["reps"];
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
    <main className="min-h-screen bg-zinc-950 px-4 pb-24 pt-6 text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <header className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
          <h1 className="text-3xl font-bold">Training</h1>
          <p className="mt-1 text-zinc-400">Workouts und Exercises in einem Bereich</p>
          {completionMessage ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-700 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-300">
              <span>{completionMessage} Du bist wieder auf der Training-Startseite.</span>
              <button
                type="button"
                onClick={() => router.replace("/training")}
                className="rounded-lg border border-emerald-500/60 px-2 py-1 text-xs font-semibold text-emerald-200 hover:bg-emerald-800/30"
              >
                Hinweis schließen
              </button>
            </div>
          ) : null}
        </header>

        <TabSwitcher activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === "Workouts" ? (
          <WorkoutsTab
                      categories={categories}
            subcategories={subcategoriesByCategory}
            onCreateSubcategory={handleCreateSubcategory}
            onDeleteSubcategory={handleDeleteSubcategory}
            selectedCategory={workoutCategory}
            selectedSubcategory={workoutSubcategory}
            onCategoryChange={handleWorkoutCategoryChange}
            onSubcategoryChange={setWorkoutSubcategory}
            workouts={workoutsForSelection}
            availableExercises={exercises}
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
            onCategoryChange={handleExerciseCategoryChange}
            onSubcategoryChange={setExerciseSubcategory}
            visibleExercises={exercisesForSelection}
            searchableExercises={allExercisesBySearch}
            exerciseSearch={exerciseSearch}
            onExerciseSearchChange={setExerciseSearch}
            newExerciseName={newExerciseName}
            onNewExerciseNameChange={setNewExerciseName}
            newExerciseCategory={newExerciseCategory}
            onNewExerciseCategoryChange={handleNewExerciseCategoryChange}
            newExerciseSubcategory={newExerciseSubcategory}
            onNewExerciseSubcategoryChange={setNewExerciseSubcategory}
            newExerciseNotes={newExerciseNotes}
            onNewExerciseNotesChange={setNewExerciseNotes}
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
      </div>
    </main>
  );
}

export default function TrainingPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-zinc-950 px-4 pb-24 pt-6 text-white">
          <p className="text-sm text-zinc-300">Lade Training …</p>
        </main>
      }
    >
      <TrainingPageContent />
    </Suspense>
  );
}