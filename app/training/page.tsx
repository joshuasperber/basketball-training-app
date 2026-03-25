"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  categories,
  subcategoriesByCategory,
  type Category,
  type Exercise,
  type MetricKey,
  type Workout,
} from "@/lib/training-data";
import { loadExercises, loadWorkouts, saveExercises, saveWorkouts } from "@/lib/training-storage";

type TrainingTab = "Workouts" | "Exercises";

const METRIC_OPTIONS: MetricKey[] = [
  "reps",
  "weight",
  "time",
  "distance",
  "makes",
  "misses",
  "tries",
  "intensity",
];

const METRIC_LABELS: Record<MetricKey, string> = {
  reps: "Reps",
  weight: "Gewicht",
  time: "Zeit",
  distance: "Distanz",
  makes: "Makes",
  misses: "Misses",
  tries: "Trys",
  intensity: "Intensität",
};

function formatMetricTargets(exercise: Exercise) {
  if (!exercise.targetByMetric) return "-";
  return exercise.metricKeys
    .map((metric) => {
      const value = exercise.targetByMetric?.[metric];
      return value !== undefined ? `${METRIC_LABELS[metric]} ${value}` : null;
    })
    .filter((entry): entry is string => Boolean(entry))
    .join(" • ");
}

export default function TrainingPage() {
  const [activeTab, setActiveTab] = useState<TrainingTab>("Workouts");

  const [workoutCategory, setWorkoutCategory] = useState<Category>("Basketball");
  const [workoutSubcategory, setWorkoutSubcategory] = useState("Shooting");

  const [exerciseCategory, setExerciseCategory] = useState<Category>("Basketball");
  const [exerciseSubcategory, setExerciseSubcategory] = useState("Shooting");
  const [exerciseSearch, setExerciseSearch] = useState("");

  const [exercises, setExercises] = useState<Exercise[]>(() => loadExercises());
  const [workouts, setWorkouts] = useState<Workout[]>(() => loadWorkouts());
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

    if (!searchTerm) {
      return exercises;
    }

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
          Object.entries(newExerciseTargets)
            .filter(([, value]) => value && value.trim() !== "")
            .map(([metric, value]) => [metric, Number(value)]),
        ) as Partial<Record<MetricKey, number>>,
        trackingType: newExerciseMetrics.includes("weight") ? "weight" : "reps",
        targetValue: Number(newExerciseTargets.reps ?? newExerciseTargets.weight ?? "") || undefined,
      },
    ]);

    setNewExerciseName("");
    setNewExerciseNotes("");
    setNewExerciseMetrics(["reps"]);
    setNewExerciseTargets({});
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
            availableExercises={workoutExerciseOptions}
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
          />
        )}
      </div>
    </main>
  );
}

type WorkoutsTabProps = {
  categories: Category[];
  subcategories: Record<Category, string[]>;
  selectedCategory: Category;
  selectedSubcategory: string;
  onCategoryChange: (category: Category) => void;
  onSubcategoryChange: (subcategory: string) => void;
  workouts: Workout[];
  availableExercises: Exercise[];
  newWorkoutName: string;
  onNewWorkoutNameChange: (value: string) => void;
  selectedExerciseIds: string[];
  onSelectedExerciseIdsChange: (value: string[]) => void;
  newWorkoutCategory: Category;
  onNewWorkoutCategoryChange: (value: Category) => void;
  newWorkoutSubcategory: string;
  onNewWorkoutSubcategoryChange: (value: string) => void;
  newWorkoutNotes: string;
  onNewWorkoutNotesChange: (value: string) => void;
  onCreateWorkout: (event: React.SyntheticEvent<HTMLFormElement>) => void;
};

function WorkoutsTab({
  categories,
  subcategories,
  selectedCategory,
  selectedSubcategory,
  onCategoryChange,
  onSubcategoryChange,
  workouts,
  availableExercises,
  newWorkoutName,
  onNewWorkoutNameChange,
  selectedExerciseIds,
  onSelectedExerciseIdsChange,
  newWorkoutCategory,
  onNewWorkoutCategoryChange,
  newWorkoutSubcategory,
  onNewWorkoutSubcategoryChange,
  newWorkoutNotes,
  onNewWorkoutNotesChange,
  onCreateWorkout,
}: WorkoutsTabProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <FilterSection
          title="1) Kategorie"
          options={categories}
          selectedValue={selectedCategory}
          onSelect={onCategoryChange}
        />

        <FilterSection
          title="2) Unterkategorie"
          options={subcategories[selectedCategory]}
          selectedValue={selectedSubcategory}
          onSelect={onSubcategoryChange}
        />

        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-2xl font-semibold">3) Workout wählen</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Target-Score (pro Exercise): <span className="font-semibold text-white">80 + Progression</span>
          </p>

          <div className="mt-4 space-y-2">
            {workouts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-700 p-3 text-zinc-400">
                Noch kein Workout für diese Auswahl vorhanden.
              </p>
            ) : (
              workouts.map((workout) => (
                <div key={workout.id} className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3">
                  <p className="text-xl font-semibold">{workout.name}</p>
                  {workout.notes ? <p className="mt-1 text-xs text-zinc-500">{workout.notes}</p> : null}
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="text-sm text-zinc-400">Level {workout.level}</p>
                    <Link
                      href={`/workouts/${workout.id}`}
                      className="rounded-lg border border-indigo-500 px-3 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-950"
                    >
                      Workout starten
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="text-2xl font-semibold">Neues Workout erstellen</h3>

        <form className="mt-3 space-y-3" onSubmit={onCreateWorkout}>
          <FilterSection
            title="Kategorie"
            options={categories}
            selectedValue={newWorkoutCategory}
            onSelect={onNewWorkoutCategoryChange}
          />

          <FilterSection
            title="Unterkategorie"
            options={subcategories[newWorkoutCategory]}
            selectedValue={newWorkoutSubcategory}
            onSelect={onNewWorkoutSubcategoryChange}
          />

          <input
            value={newWorkoutName}
            onChange={(event) => onNewWorkoutNameChange(event.target.value)}
            placeholder="Workout Name"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
          <textarea
            value={newWorkoutNotes}
            onChange={(event) => onNewWorkoutNotesChange(event.target.value)}
            placeholder="Notizen zum Workout"
            rows={2}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />

          <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-3">
            {availableExercises.length === 0 ? (
              <p className="text-sm text-zinc-400">Keine Exercises in dieser Kategorie/Unterkategorie.</p>
            ) : (
              availableExercises.map((exercise) => {
                const checked = selectedExerciseIds.includes(exercise.id);

                return (
                  <label key={exercise.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>{exercise.name}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        onSelectedExerciseIdsChange(
                          checked
                            ? selectedExerciseIds.filter((id) => id !== exercise.id)
                            : [...selectedExerciseIds, exercise.id],
                        )
                      }
                    />
                  </label>
                );
              })
            )}
          </div>

          <button type="submit" className="w-full rounded-xl bg-indigo-600 px-4 py-2 font-semibold">
            Workout hinzufügen
          </button>
        </form>
      </section>
    </section>
  );
}

type ExercisesTabProps = {
  categories: Category[];
  subcategories: Record<Category, string[]>;
  selectedCategory: Category;
  selectedSubcategory: string;
  onCategoryChange: (category: Category) => void;
  onSubcategoryChange: (subcategory: string) => void;
  visibleExercises: Exercise[];
  searchableExercises: Exercise[];
  exerciseSearch: string;
  onExerciseSearchChange: (value: string) => void;
  newExerciseName: string;
  onNewExerciseNameChange: (value: string) => void;
  newExerciseCategory: Category;
  onNewExerciseCategoryChange: (category: Category) => void;
  newExerciseSubcategory: string;
  onNewExerciseSubcategoryChange: (value: string) => void;
  newExerciseNotes: string;
  onNewExerciseNotesChange: (value: string) => void;
  newExerciseMetrics: MetricKey[];
  onToggleNewExerciseMetric: (metric: MetricKey) => void;
  newExerciseTargets: Partial<Record<MetricKey, string>>;
  onNewExerciseTargetChange: (metric: MetricKey, value: string) => void;
  onCreateExercise: (event: React.SyntheticEvent<HTMLFormElement>) => void;
};

function ExercisesTab({
  categories,
  subcategories,
  selectedCategory,
  selectedSubcategory,
  onCategoryChange,
  onSubcategoryChange,
  visibleExercises,
  searchableExercises,
  exerciseSearch,
  onExerciseSearchChange,
  newExerciseName,
  onNewExerciseNameChange,
  newExerciseCategory,
  onNewExerciseCategoryChange,
  newExerciseSubcategory,
  onNewExerciseSubcategoryChange,
  newExerciseNotes,
  onNewExerciseNotesChange,
  newExerciseMetrics,
  onToggleNewExerciseMetric,
  newExerciseTargets,
  onNewExerciseTargetChange,
  onCreateExercise,
}: ExercisesTabProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <FilterSection
          title="1) Kategorie"
          options={categories}
          selectedValue={selectedCategory}
          onSelect={onCategoryChange}
        />

        <FilterSection
          title="2) Unterkategorie"
          options={subcategories[selectedCategory]}
          selectedValue={selectedSubcategory}
          onSelect={onSubcategoryChange}
        />

        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-xl font-semibold">Exercises in Auswahl</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {selectedCategory} • {selectedSubcategory}
          </p>

          <div className="mt-4 space-y-2">
            {visibleExercises.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-700 p-3 text-zinc-400">
                Keine Exercises für diese Auswahl.
              </p>
            ) : (
              visibleExercises.map((exercise) => (
                <ExerciseCard key={exercise.id} exercise={exercise} href={`/exercises/${exercise.id}`} />
              ))
            )}
          </div>
        </section>
      </div>

      <div className="space-y-4">
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-xl font-semibold">Alle Exercises suchen</h2>
          <input
            value={exerciseSearch}
            onChange={(event) => onExerciseSearchChange(event.target.value)}
            placeholder="Exercise / Kategorie / Unterkategorie..."
            className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />

          <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {searchableExercises.map((exercise) => (
              <ExerciseCard key={exercise.id} exercise={exercise} href={`/exercises/${exercise.id}`} />
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-xl font-semibold">Neue Exercise hinzufügen</h3>
          <form className="mt-3 space-y-3" onSubmit={onCreateExercise}>
            <FilterSection
              title="Kategorie"
              options={categories}
              selectedValue={newExerciseCategory}
              onSelect={onNewExerciseCategoryChange}
            />

            <FilterSection
              title="Unterkategorie"
              options={subcategories[newExerciseCategory]}
              selectedValue={newExerciseSubcategory}
              onSelect={onNewExerciseSubcategoryChange}
            />

            <input
              value={newExerciseName}
              onChange={(event) => onNewExerciseNameChange(event.target.value)}
              placeholder="Exercise Name"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
            <textarea
              value={newExerciseNotes}
              onChange={(event) => onNewExerciseNotesChange(event.target.value)}
              placeholder="Notizen zur Exercise"
              rows={2}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />

            <div>
              <p className="mb-2 text-sm font-medium text-zinc-300">Messfelder wählen</p>
              <div className="flex flex-wrap gap-2">
                {METRIC_OPTIONS.map((metric) => {
                  const active = newExerciseMetrics.includes(metric);
                  return (
                    <button
                      key={metric}
                      type="button"
                      onClick={() => onToggleNewExerciseMetric(metric)}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        active
                          ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                          : "border-zinc-700 text-zinc-300"
                      }`}
                    >
                      {METRIC_LABELS[metric]}
                    </button>
                  );
                })}
              </div>
            </div>

            {newExerciseMetrics.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {newExerciseMetrics.map((metric) => (
                  <input
                    key={metric}
                    type="number"
                    value={newExerciseTargets[metric] ?? ""}
                    onChange={(event) => onNewExerciseTargetChange(metric, event.target.value)}
                    placeholder={`Ziel ${METRIC_LABELS[metric]}`}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-300">Bitte mindestens ein Messfeld auswählen.</p>
            )}

            <button type="submit" className="w-full rounded-xl bg-indigo-600 px-4 py-2 font-semibold">
              Exercise hinzufügen
            </button>
          </form>
        </section>
      </div>
    </section>
  );
}

function ExerciseCard({ exercise, href }: { exercise: Exercise; href?: string }) {
  return (
    <article className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2">
      <p className="font-semibold">{exercise.name}</p>
      <p className="text-sm text-zinc-400">
        {exercise.category} • {exercise.subcategory} • {exercise.metricKeys.map((metric) => METRIC_LABELS[metric]).join(", ")}
      </p>
      <p className="text-xs text-zinc-500">
        Ziele: {formatMetricTargets(exercise)}
      </p>
      {exercise.notes ? <p className="text-xs text-zinc-500">Notizen: {exercise.notes}</p> : null}
      {href ? (
        <Link
          href={href}
          className="mt-2 inline-flex rounded-lg border border-indigo-500 px-3 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-950"
        >
          Exercise starten
        </Link>
      ) : null}
    </article>
  );
}

type FilterSectionProps<T extends string> = {
  title: string;
  options: T[];
  selectedValue: T;
  onSelect: (value: T) => void;
};

function FilterSection<T extends string>({ title, options, selectedValue, onSelect }: FilterSectionProps<T>) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSelect(option)}
            className={`rounded-xl border px-3 py-2 text-base transition ${
              selectedValue === option
                ? "border-indigo-500 bg-indigo-900/40 text-white"
                : "border-zinc-700 bg-zinc-950 text-zinc-300"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </section>
  );
}

type TabSwitcherProps = {
  activeTab: TrainingTab;
  onTabChange: (tab: TrainingTab) => void;
};

function TabSwitcher({ activeTab, onTabChange }: TabSwitcherProps) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-2">
      <div className="grid grid-cols-2 gap-2">
        {(["Workouts", "Exercises"] as TrainingTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === tab
                ? "border border-indigo-500 bg-indigo-900/40 text-white"
                : "border border-zinc-700 bg-zinc-950 text-zinc-400"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
    </section>
  );
}