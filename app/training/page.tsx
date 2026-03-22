"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  categories,
  defaultExercises,
  defaultWorkouts,
  subcategoriesByCategory,
  type Category,
  type Exercise,
  type Workout,
} from "@/lib/training-data";

type TrainingTab = "Workouts" | "Exercises";

function getTrackingType(category: Category): "reps" | "weight" {
  return category === "Gym" ? "weight" : "reps";
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

  const [newWorkoutName, setNewWorkoutName] = useState("");
  const [newWorkoutExerciseIds, setNewWorkoutExerciseIds] = useState<string[]>([]);
  const [newWorkoutCategory, setNewWorkoutCategory] = useState<Category>("Basketball");
  const [newWorkoutSubcategory, setNewWorkoutSubcategory] = useState("Handles");

  const [newExerciseName, setNewExerciseName] = useState("");
  const [newExerciseCategory, setNewExerciseCategory] = useState<Category>("Basketball");
  const [newExerciseSubcategory, setNewExerciseSubcategory] = useState("Handles");
  const [newExerciseValue, setNewExerciseValue] = useState("");

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
        level: nextLevel,
        exerciseIds: newWorkoutExerciseIds,
      },
    ]);

    setNewWorkoutName("");
    setNewWorkoutExerciseIds([]);
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
        trackingType: getTrackingType(newExerciseCategory),
        targetValue: newExerciseValue ? Number(newExerciseValue) : undefined,
      },
    ]);

    setNewExerciseName("");
    setNewExerciseValue("");
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
            newExerciseValue={newExerciseValue}
            onNewExerciseValueChange={setNewExerciseValue}
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
  newExerciseValue: string;
  onNewExerciseValueChange: (value: string) => void;
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
  newExerciseValue,
  onNewExerciseValueChange,
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

            <input
              type="number"
              value={newExerciseValue}
              onChange={(event) => onNewExerciseValueChange(event.target.value)}
              placeholder={getTrackingType(newExerciseCategory) === "weight" ? "Start Weight (kg)" : "Target Reps"}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />

            <p className="text-sm text-zinc-400">
              Tracking-Typ: <span className="font-semibold text-white">{getTrackingType(newExerciseCategory) === "weight" ? "Weight" : "Reps"}</span>
            </p>

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
        {exercise.category} • {exercise.subcategory} • {exercise.trackingType === "weight" ? "Weight" : "Reps"}
        {exercise.targetValue ? ` • Ziel: ${exercise.targetValue}` : ""}
      </p>
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