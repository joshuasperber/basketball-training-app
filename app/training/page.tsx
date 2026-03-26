"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  categories,
  defaultExercises,
  defaultWorkouts,
  subcategoriesByCategory,
  type Category,
  type Exercise,
  type MetricKey,
  type Workout,
} from "@/lib/training-data";
import { loadExercises, loadWorkouts, saveExercises, saveWorkouts } from "@/lib/training-storage";
import { ExercisesTab, TabSwitcher, type TrainingTab, WorkoutsTab } from "@/components/training/TrainingTabs";

function parseMetricInput(value?: string) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized === "-") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateMetricTargets(
  metricKeys: MetricKey[],
  targets: Partial<Record<MetricKey, string>>,
) {
  if (metricKeys.length === 0) {
    return "Bitte mindestens ein Messfeld auswählen.";
  }

  for (const metric of metricKeys) {
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

export default function TrainingPage() {
  const [activeTab, setActiveTab] = useState<TrainingTab>("Workouts");

  const [workoutCategory, setWorkoutCategory] = useState<Category>("Basketball");
  const [workoutSubcategory, setWorkoutSubcategory] = useState("Shooting");

  const [exerciseCategory, setExerciseCategory] = useState<Category>("Basketball");
  const [exerciseSubcategory, setExerciseSubcategory] = useState("Shooting");
  const [exerciseSearch, setExerciseSearch] = useState("");

  const [exercises, setExercises] = useState<Exercise[]>(defaultExercises);
  const [workouts, setWorkouts] = useState<Workout[]>(defaultWorkouts);
  const hasPersistedExercises = useRef(false);
  const hasPersistedWorkouts = useRef(false);

  const [newWorkoutName, setNewWorkoutName] = useState("");
  const [newWorkoutExerciseIds, setNewWorkoutExerciseIds] = useState<string[]>([]);
  const [newWorkoutCategory, setNewWorkoutCategory] = useState<Category>("Basketball");
  const [newWorkoutSubcategory, setNewWorkoutSubcategory] = useState("Handles");
  const [newWorkoutNotes, setNewWorkoutNotes] = useState("");

  const [newExerciseName, setNewExerciseName] = useState("");
  const [newExerciseCategory, setNewExerciseCategory] = useState<Category>("Basketball");
  const [newExerciseSubcategory, setNewExerciseSubcategory] = useState("Handles");
  const [newExerciseNotes, setNewExerciseNotes] = useState("");
  const [newExerciseMetrics, setNewExerciseMetrics] = useState<MetricKey[]>(["reps"]);
  const [newExerciseTargets, setNewExerciseTargets] = useState<Partial<Record<MetricKey, string>>>({});
  const [newExerciseError, setNewExerciseError] = useState<string | null>(null);

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
  const [editExerciseMetrics, setEditExerciseMetrics] = useState<MetricKey[]>(["reps"]);
  const [editExerciseTargets, setEditExerciseTargets] = useState<Partial<Record<MetricKey, string>>>({});
  const [editExerciseError, setEditExerciseError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setExercises(loadExercises());
      setWorkouts(loadWorkouts());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hasPersistedExercises.current) {
      hasPersistedExercises.current = true;
      return;
    }
    saveExercises(exercises);
  }, [exercises]);

  useEffect(() => {
    if (!hasPersistedWorkouts.current) {
      hasPersistedWorkouts.current = true;
      return;
    }
    saveWorkouts(workouts);
  }, [workouts]);

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
        (exercise) => exercise.category === newWorkoutCategory && exercise.subcategory === newWorkoutSubcategory,
      ),
    [exercises, newWorkoutCategory, newWorkoutSubcategory],
  );

  const exercisesForSelection = useMemo(
    () =>
      exercises.filter(
        (exercise) => exercise.category === exerciseCategory && exercise.subcategory === exerciseSubcategory,
      ),
    [exercises, exerciseCategory, exerciseSubcategory],
  );

  const allExercisesBySearch = useMemo(() => {
    const searchTerm = exerciseSearch.trim().toLowerCase();
    if (!searchTerm) return exercises;

    return exercises.filter((exercise) => {
      return (
        exercise.name.toLowerCase().includes(searchTerm) ||
        exercise.category.toLowerCase().includes(searchTerm) ||
        exercise.subcategory.toLowerCase().includes(searchTerm)
      );
    });
  }, [exerciseSearch, exercises]);

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

  function handleAddWorkout(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedName = newWorkoutName.trim();
    if (!normalizedName) return;

    const nextLevel =
      workouts.filter(
        (workout) => workout.category === newWorkoutCategory && workout.subcategory === newWorkoutSubcategory,
      ).length + 1;

    setWorkouts((prev) => [
      ...prev,
      {
        id: `wo-${Date.now()}`,
        name: normalizedName,
        category: newWorkoutCategory,
        subcategory: newWorkoutSubcategory,
        notes: newWorkoutNotes.trim() || undefined,
        level: nextLevel,
        exerciseIds: newWorkoutExerciseIds,
      },
    ]);

    setNewWorkoutName("");
    setNewWorkoutExerciseIds([]);
    setNewWorkoutNotes("");
  }

  function handleAddExercise(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedName = newExerciseName.trim();
    if (!normalizedName) return;

    const validationError = validateMetricTargets(newExerciseMetrics, newExerciseTargets);
    if (validationError) {
      setNewExerciseError(validationError);
      return;
    }

    setExercises((prev) => [
      ...prev,
      {
        id: `ex-${Date.now()}`,
        name: normalizedName,
        category: newExerciseCategory,
        subcategory: newExerciseSubcategory,
        notes: newExerciseNotes.trim() || undefined,
        metricKeys: newExerciseMetrics.length > 0 ? newExerciseMetrics : ["reps"],
        targetByMetric: Object.fromEntries(
          Object.entries(newExerciseTargets).flatMap(([metric, value]) => {
            const parsed = parseMetricInput(value);
            return parsed === null ? [] : [[metric, parsed]];
          }),
        ) as Partial<Record<MetricKey, number>>,
        trackingType: newExerciseMetrics.includes("weight") ? "weight" : "reps",
        targetValue: Number(newExerciseTargets.reps ?? newExerciseTargets.weight ?? "") || undefined,
      },
    ]);

    setNewExerciseName("");
    setNewExerciseNotes("");
    setNewExerciseMetrics(["reps"]);
    setNewExerciseTargets({});
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

  function handleUpdateWorkout(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingWorkoutId) return;

    const normalizedName = editWorkoutName.trim();
    if (!normalizedName) return;

    setWorkouts((prev) =>
      prev.map((entry) =>
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
      ),
    );

    setEditingWorkoutId(null);
    setEditWorkoutExerciseIds([]);
  }

  function startEditExercise(exercise: Exercise) {
    setEditingExerciseId(exercise.id);
    setEditExerciseName(exercise.name);
    setEditExerciseCategory(exercise.category);
    setEditExerciseSubcategory(exercise.subcategory);
    setEditExerciseNotes(exercise.notes ?? "");
    setEditExerciseMetrics(exercise.metricKeys);
    setEditExerciseTargets(
      Object.fromEntries(
        Object.entries(exercise.targetByMetric ?? {}).map(([metric, value]) => [metric, String(value)]),
      ) as Partial<Record<MetricKey, string>>,
    );
    setEditExerciseError(null);
  }

  function cancelEditExercise() {
    setEditingExerciseId(null);
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

  function handleUpdateExercise(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingExerciseId) return;

    const normalizedName = editExerciseName.trim();
    if (!normalizedName) return;

    const validationError = validateMetricTargets(editExerciseMetrics, editExerciseTargets);
    if (validationError) {
      setEditExerciseError(validationError);
      return;
    }

    const metrics = editExerciseMetrics.length > 0 ? editExerciseMetrics : ["reps"];
    const numericTargets = Object.fromEntries(
      Object.entries(editExerciseTargets).flatMap(([metric, value]) => {
        const parsed = parseMetricInput(value);
        return parsed === null ? [] : [[metric, parsed]];
      }),
    ) as Partial<Record<MetricKey, number>>;

    setExercises((prev) =>
      prev.map((entry) =>
        entry.id === editingExerciseId
          ? {
              ...entry,
              name: normalizedName,
              category: editExerciseCategory,
              subcategory: editExerciseSubcategory,
              notes: editExerciseNotes.trim() || undefined,
              metricKeys: metrics,
              targetByMetric: numericTargets,
              trackingType: metrics.includes("weight") ? "weight" : "reps",
              targetValue: Number(editExerciseTargets.reps ?? editExerciseTargets.weight ?? "") || undefined,
            }
          : entry,
      ),
    );

    setEditingExerciseId(null);
    setEditExerciseMetrics(["reps"]);
    setEditExerciseTargets({});
    setEditExerciseError(null);
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-24 pt-6 text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <header className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
          <h1 className="text-3xl font-bold">Training</h1>
          <p className="mt-1 text-zinc-400">Workouts und Exercises in einem Bereich</p>
        </header>

        <TabSwitcher activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === "Workouts" ? (
          <WorkoutsTab
            categories={categories}
            subcategories={subcategoriesByCategory}
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
          />
        ) : (
          <ExercisesTab
            categories={categories}
            subcategories={subcategoriesByCategory}
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
            newExerciseMetrics={newExerciseMetrics}
            onToggleNewExerciseMetric={toggleNewExerciseMetric}
            newExerciseTargets={newExerciseTargets}
            onNewExerciseTargetChange={(metric, value) =>
              setNewExerciseTargets((current) => ({ ...current, [metric]: value }))
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
            editExerciseMetrics={editExerciseMetrics}
            onToggleEditExerciseMetric={toggleEditExerciseMetric}
            editExerciseTargets={editExerciseTargets}
            onEditExerciseTargetChange={(metric, value) =>
              setEditExerciseTargets((current) => ({ ...current, [metric]: value }))
            }
            onUpdateExercise={handleUpdateExercise}
            newExerciseError={newExerciseError}
            editExerciseError={editExerciseError}
          />
        )}
      </div>
    </main>
  );
}