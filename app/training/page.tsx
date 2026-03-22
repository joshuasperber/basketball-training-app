"use client";

import { FormEvent, useMemo, useState } from "react";

type Category = "Basketball" | "Gym" | "Home";

type Exercise = {
  id: string;
  name: string;
  category: Category;
  subcategory: string;
  trackingType: "reps" | "weight";
  targetValue?: number;
};

type Workout = {
  id: string;
  name: string;
  category: Category;
  subcategory: string;
  level: number;
  exerciseIds: string[];
};

const categories: Category[] = ["Basketball", "Gym", "Home"];

const subcategoriesByCategory: Record<Category, string[]> = {
  Basketball: ["Handles", "Finishing", "Shooting", "Defense"],
  Gym: ["Upper Body", "Lower Body", "Core"],
  Home: ["Mobility", "Conditioning", "Recovery"],
};

const defaultExercises: Exercise[] = [
  { id: "ex-1", name: "Cone Handles", category: "Basketball", subcategory: "Handles", trackingType: "reps", targetValue: 80 },
  { id: "ex-2", name: "Mikan Finishes", category: "Basketball", subcategory: "Finishing", trackingType: "reps", targetValue: 60 },
  { id: "ex-3", name: "Shooting 1", category: "Basketball", subcategory: "Shooting", trackingType: "reps", targetValue: 80 },
  { id: "ex-4", name: "Shooting 2", category: "Basketball", subcategory: "Shooting", trackingType: "reps", targetValue: 90 },
  { id: "ex-5", name: "Bench Press", category: "Gym", subcategory: "Upper Body", trackingType: "weight", targetValue: 70 },
  { id: "ex-6", name: "Goblet Squat", category: "Gym", subcategory: "Lower Body", trackingType: "weight", targetValue: 30 },
  { id: "ex-7", name: "Plank Hold", category: "Home", subcategory: "Core", trackingType: "reps", targetValue: 3 },
];

const defaultWorkouts: Workout[] = [
  { id: "wo-1", name: "Shooting 1", category: "Basketball", subcategory: "Shooting", level: 1, exerciseIds: ["ex-3"] },
  { id: "wo-2", name: "Shooting 2", category: "Basketball", subcategory: "Shooting", level: 2, exerciseIds: ["ex-3", "ex-4"] },
  { id: "wo-3", name: "Shooting 3", category: "Basketball", subcategory: "Shooting", level: 3, exerciseIds: ["ex-4"] },
  { id: "wo-4", name: "Shooting 4", category: "Basketball", subcategory: "Shooting", level: 4, exerciseIds: ["ex-3", "ex-4"] },
  { id: "wo-5", name: "Shooting 5", category: "Basketball", subcategory: "Shooting", level: 5, exerciseIds: ["ex-3", "ex-4"] },
];

function getTrackingType(category: Category): "reps" | "weight" {
  return category === "Gym" ? "weight" : "reps";
}

export default function TrainingPage() {
  const [activeTab, setActiveTab] = useState<"Workouts" | "Exercises">("Workouts");

  const [selectedCategory, setSelectedCategory] = useState<Category>("Basketball");
  const [selectedSubcategory, setSelectedSubcategory] = useState("Shooting");

  const [exerciseCategory, setExerciseCategory] = useState<Category>("Basketball");
  const [exerciseSubcategory, setExerciseSubcategory] = useState("Shooting");
  const [exerciseSearch, setExerciseSearch] = useState("");

  const [exercises, setExercises] = useState<Exercise[]>(defaultExercises);
  const [workouts, setWorkouts] = useState<Workout[]>(defaultWorkouts);

  const [newWorkoutName, setNewWorkoutName] = useState("");
  const [newWorkoutExerciseIds, setNewWorkoutExerciseIds] = useState<string[]>([]);

  const [newExerciseName, setNewExerciseName] = useState("");
  const [newExerciseCategory, setNewExerciseCategory] = useState<Category>("Basketball");
  const [newExerciseSubcategory, setNewExerciseSubcategory] = useState("Handles");
  const [newExerciseValue, setNewExerciseValue] = useState("");

  const visibleWorkouts = useMemo(
    () =>
      workouts.filter(
        (workout) => workout.category === selectedCategory && workout.subcategory === selectedSubcategory,
      ),
    [selectedCategory, selectedSubcategory, workouts],
  );

  const searchableExercises = useMemo(() => {
    const searchTerm = exerciseSearch.trim().toLowerCase();

    return exercises.filter((exercise) => {
      const categoryMatch = exercise.category === exerciseCategory;
      const subcategoryMatch = exercise.subcategory === exerciseSubcategory;
      const searchMatch =
        searchTerm.length === 0 ||
        exercise.name.toLowerCase().includes(searchTerm) ||
        exercise.subcategory.toLowerCase().includes(searchTerm);

      return searchMatch && (categoryMatch || subcategoryMatch || searchTerm.length > 0);
    });
  }, [exerciseCategory, exerciseSearch, exerciseSubcategory, exercises]);

  const workoutSelectableExercises = useMemo(
    () =>
      exercises.filter(
        (exercise) =>
          exercise.category === selectedCategory &&
          exercise.subcategory === selectedSubcategory,
      ),
    [exercises, selectedCategory, selectedSubcategory],
  );

  function onCategoryChange(category: Category) {
    setSelectedCategory(category);
    setSelectedSubcategory(subcategoriesByCategory[category][0]);
  }

  function onExerciseCategoryChange(category: Category) {
    setExerciseCategory(category);
    setExerciseSubcategory(subcategoriesByCategory[category][0]);
  }

  function handleAddWorkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!newWorkoutName.trim()) return;

    const levelBase = workouts.filter(
      (workout) => workout.category === selectedCategory && workout.subcategory === selectedSubcategory,
    ).length;

    const newWorkout: Workout = {
      id: `wo-${Date.now()}`,
      name: newWorkoutName.trim(),
      category: selectedCategory,
      subcategory: selectedSubcategory,
      level: levelBase + 1,
      exerciseIds: newWorkoutExerciseIds,
    };

    setWorkouts((prev) => [...prev, newWorkout]);
    setNewWorkoutName("");
    setNewWorkoutExerciseIds([]);
  }

  function handleAddExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!newExerciseName.trim()) return;

    const trackingType = getTrackingType(newExerciseCategory);

    const newExercise: Exercise = {
      id: `ex-${Date.now()}`,
      name: newExerciseName.trim(),
      category: newExerciseCategory,
      subcategory: newExerciseSubcategory,
      trackingType,
      targetValue: newExerciseValue ? Number(newExerciseValue) : undefined,
    };

    setExercises((prev) => [...prev, newExercise]);
    setNewExerciseName("");
    setNewExerciseValue("");
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-24 pt-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header>
          <h1 className="text-2xl font-bold">Training</h1>
          <p className="mt-1 text-zinc-400">Workouts und Exercises in einem Bereich</p>
        </header>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-2">
          <div className="grid grid-cols-2 gap-2">
            {["Workouts", "Exercises"].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab as "Workouts" | "Exercises")}
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

        {activeTab === "Workouts" ? (
          <>
            <FilterSection
              title="1) Kategorie"
              options={categories}
              selectedValue={selectedCategory}
              onSelect={onCategoryChange}
            />

            <FilterSection
              title="2) Unterkategorie"
              options={subcategoriesByCategory[selectedCategory]}
              selectedValue={selectedSubcategory}
              onSelect={setSelectedSubcategory}
            />

            <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
              <h2 className="text-2xl font-semibold">3) Workout wählen</h2>
              <p className="mt-2 text-zinc-400">
                Target-Score (pro Exercise) bei diesem Workout: <span className="font-semibold text-white">80 + Progression</span> je Exercise.
              </p>

              <div className="mt-4 space-y-3">
                {visibleWorkouts.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-zinc-700 p-4 text-zinc-400">
                    Noch kein Workout vorhanden.
                  </p>
                ) : (
                  visibleWorkouts.map((workout) => (
                    <div
                      key={workout.id}
                      className="flex items-center justify-between rounded-2xl border border-zinc-700 bg-black px-4 py-3"
                    >
                      <span className="text-3xl font-medium">{workout.name}</span>
                      <span className="text-xl text-zinc-400">Level {workout.level}</span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
              <h3 className="text-xl font-semibold">Neues Workout erstellen</h3>
              <form className="mt-3 space-y-3" onSubmit={handleAddWorkout}>
                <input
                  value={newWorkoutName}
                  onChange={(event) => setNewWorkoutName(event.target.value)}
                  placeholder="Workout Name"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                />

                <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                  {workoutSelectableExercises.map((exercise) => {
                    const checked = newWorkoutExerciseIds.includes(exercise.id);

                    return (
                      <label key={exercise.id} className="flex items-center justify-between gap-3 text-sm">
                        <span>{exercise.name}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setNewWorkoutExerciseIds((prev) =>
                              checked ? prev.filter((id) => id !== exercise.id) : [...prev, exercise.id],
                            )
                          }
                        />
                      </label>
                    );
                  })}
                </div>

                <button type="submit" className="w-full rounded-xl bg-indigo-600 px-4 py-2 font-semibold">
                  Workout hinzufügen
                </button>
              </form>
            </section>
          </>
        ) : (
          <>
            <FilterSection
              title="1) Kategorie"
              options={categories}
              selectedValue={exerciseCategory}
              onSelect={onExerciseCategoryChange}
            />

            <FilterSection
              title="2) Unterkategorie"
              options={subcategoriesByCategory[exerciseCategory]}
              selectedValue={exerciseSubcategory}
              onSelect={setExerciseSubcategory}
            />

            <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
              <h2 className="text-xl font-semibold">Alle Exercises durchsuchen</h2>
              <input
                value={exerciseSearch}
                onChange={(event) => setExerciseSearch(event.target.value)}
                placeholder="Exercise suchen..."
                className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />

              <div className="mt-4 space-y-2">
                {searchableExercises.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-700 p-4 text-zinc-400">Keine Exercises gefunden.</p>
                ) : (
                  searchableExercises.map((exercise) => (
                    <div
                      key={exercise.id}
                      className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                    >
                      <p className="font-semibold">{exercise.name}</p>
                      <p className="text-sm text-zinc-400">
                        {exercise.category} • {exercise.subcategory} • {exercise.trackingType === "weight" ? "Weight" : "Reps"}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
              <h3 className="text-xl font-semibold">Neue Exercise hinzufügen</h3>
              <form className="mt-3 space-y-3" onSubmit={handleAddExercise}>
                <input
                  value={newExerciseName}
                  onChange={(event) => setNewExerciseName(event.target.value)}
                  placeholder="Exercise Name"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                />

                <select
                  value={newExerciseCategory}
                  onChange={(event) => {
                    const category = event.target.value as Category;
                    setNewExerciseCategory(category);
                    setNewExerciseSubcategory(subcategoriesByCategory[category][0]);
                  }}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>

                <select
                  value={newExerciseSubcategory}
                  onChange={(event) => setNewExerciseSubcategory(event.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                >
                  {subcategoriesByCategory[newExerciseCategory].map((subcategory) => (
                    <option key={subcategory} value={subcategory}>
                      {subcategory}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  value={newExerciseValue}
                  onChange={(event) => setNewExerciseValue(event.target.value)}
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
          </>
        )}
      </div>
    </main>
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
      <h2 className="text-2xl font-semibold">{title}</h2>
      <div className="mt-4 flex flex-wrap gap-3">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSelect(option)}
            className={`rounded-2xl border px-5 py-2 text-2xl ${
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
