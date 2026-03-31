"use client";

import Link from "next/link";
import { useMemo } from "react";
import { type Category, type Exercise, type MetricKey, type Workout } from "@/lib/training-data";

export type TrainingTab = "Workouts" | "Exercises";

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

function calculateWorkoutMinutes(exercises: Exercise[]) {
  const baseMinutes = exercises.reduce((sum, exercise) => sum + Math.max(0, exercise.durationMin || 0), 0);
  const boostedMinutes = baseMinutes * 1.1;
  return Math.ceil(boostedMinutes / 5) * 5;
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
  createWorkoutExerciseOptions: Exercise[];
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
  editingWorkoutId: string | null;
  onStartEditWorkout: (workout: Workout) => void;
  onCancelEditWorkout: () => void;
  editWorkoutName: string;
  onEditWorkoutNameChange: (value: string) => void;
  editWorkoutCategory: Category;
  onEditWorkoutCategoryChange: (value: Category) => void;
  editWorkoutSubcategory: string;
  onEditWorkoutSubcategoryChange: (value: string) => void;
  editWorkoutNotes: string;
  onEditWorkoutNotesChange: (value: string) => void;
  editWorkoutExerciseIds: string[];
  onEditWorkoutExerciseIdsChange: (value: string[]) => void;
  onUpdateWorkout: (event: React.SyntheticEvent<HTMLFormElement>) => void;
};

export function WorkoutsTab({
  categories,
  subcategories,
  selectedCategory,
  selectedSubcategory,
  onCategoryChange,
  onSubcategoryChange,
  workouts,
  availableExercises,
  createWorkoutExerciseOptions,
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
  editingWorkoutId,
  onStartEditWorkout,
  onCancelEditWorkout,
  editWorkoutName,
  onEditWorkoutNameChange,
  editWorkoutCategory,
  onEditWorkoutCategoryChange,
  editWorkoutSubcategory,
  onEditWorkoutSubcategoryChange,
  editWorkoutNotes,
  onEditWorkoutNotesChange,
  editWorkoutExerciseIds,
  onEditWorkoutExerciseIdsChange,
  onUpdateWorkout,
}: WorkoutsTabProps) {
  const editExerciseOptions = useMemo(
    () =>
      availableExercises.filter(
        (exercise) =>
          exercise.category === editWorkoutCategory &&
          (editWorkoutSubcategory === "Komplett" || exercise.subcategory === editWorkoutSubcategory),
      ),
    [availableExercises, editWorkoutCategory, editWorkoutSubcategory],
  );
  const selectedExercises = useMemo(
    () => availableExercises.filter((exercise) => selectedExerciseIds.includes(exercise.id)),
    [availableExercises, selectedExerciseIds],
  );
  const selectedWorkoutMinutes = useMemo(
    () => calculateWorkoutMinutes(selectedExercises),
    [selectedExercises],
  );

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
                  <p className="mt-1 text-xs text-zinc-400">
                    Geplante Zeit:{" "}
                    {calculateWorkoutMinutes(
                      availableExercises.filter((exercise) => workout.exerciseIds.includes(exercise.id)),
                    )}{" "}
                    Min
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="text-sm text-zinc-400">Level {workout.level}</p>
                    <Link
                      href={`/workouts/${workout.id}`}
                      className="rounded-lg border border-indigo-500 px-3 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-950"
                    >
                      Workout starten
                    </Link>
                    <button
                      type="button"
                      onClick={() => onStartEditWorkout(workout)}
                      className="rounded-lg border border-amber-500 px-3 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-950"
                    >
                      Bearbeiten
                    </button>
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
            {createWorkoutExerciseOptions.length === 0 ? (
              <p className="text-sm text-zinc-400">Keine Exercises in dieser Kategorie/Unterkategorie.</p>
            ) : (
              createWorkoutExerciseOptions.map((exercise) => {
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
          <p className="text-xs text-zinc-400">
            Zeitberechnung: {selectedExercises.reduce((sum, item) => sum + item.durationMin, 0)} Min × 1.10 ⇒{" "}
            {selectedWorkoutMinutes} Min (auf 5er-Schritte aufgerundet)
          </p>

          <button type="submit" className="w-full rounded-xl bg-indigo-600 px-4 py-2 font-semibold">
            Workout hinzufügen
          </button>
        </form>

      </section>

      {editingWorkoutId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            className="max-h-[90vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-4"
            onSubmit={onUpdateWorkout}
          >
            <h4 className="text-xl font-semibold text-amber-300">Workout bearbeiten</h4>
            <FilterSection
              title="Kategorie"
              options={categories}
              selectedValue={editWorkoutCategory}
              onSelect={onEditWorkoutCategoryChange}
            />

            <FilterSection
              title="Unterkategorie"
              options={subcategories[editWorkoutCategory]}
              selectedValue={editWorkoutSubcategory}
              onSelect={onEditWorkoutSubcategoryChange}
            />

            <input
              value={editWorkoutName}
              onChange={(event) => onEditWorkoutNameChange(event.target.value)}
              placeholder="Workout Name"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
            <textarea
              value={editWorkoutNotes}
              onChange={(event) => onEditWorkoutNotesChange(event.target.value)}
              placeholder="Notizen zum Workout"
              rows={2}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />

            <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-3">
              {editExerciseOptions.length === 0 ? (
                <p className="text-sm text-zinc-400">Keine Exercises in dieser Kategorie/Unterkategorie.</p>
              ) : (
                editExerciseOptions.map((exercise) => {
                  const checked = editWorkoutExerciseIds.includes(exercise.id);
                  return (
                    <label key={exercise.id} className="flex items-center justify-between gap-3 text-sm">
                      <span>{exercise.name}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          onEditWorkoutExerciseIdsChange(
                            checked
                              ? editWorkoutExerciseIds.filter((id) => id !== exercise.id)
                              : [...editWorkoutExerciseIds, exercise.id],
                          )
                        }
                      />
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex gap-2">
              <button type="submit" className="flex-1 rounded-xl bg-amber-600 px-4 py-2 font-semibold">
                Änderungen speichern
              </button>
              <button
                type="button"
                onClick={onCancelEditWorkout}
                className="flex-1 rounded-xl border border-zinc-600 px-4 py-2 font-semibold text-zinc-200"
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      ) : null}
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
  newExerciseDurationMin: string;
  onNewExerciseDurationMinChange: (value: string) => void;
  newExerciseMetrics: MetricKey[];
  onToggleNewExerciseMetric: (metric: MetricKey) => void;
  newExerciseTargets: Partial<Record<MetricKey, string>>;
  onNewExerciseTargetChange: (metric: MetricKey, value: string) => void;
  onCreateExercise: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  editingExerciseId: string | null;
  onStartEditExercise: (exercise: Exercise) => void;
  onCancelEditExercise: () => void;
  editExerciseName: string;
  onEditExerciseNameChange: (value: string) => void;
  editExerciseCategory: Category;
  onEditExerciseCategoryChange: (category: Category) => void;
  editExerciseSubcategory: string;
  onEditExerciseSubcategoryChange: (value: string) => void;
  editExerciseNotes: string;
  onEditExerciseNotesChange: (value: string) => void;
  editExerciseDurationMin: string;
  onEditExerciseDurationMinChange: (value: string) => void;
  editExerciseMetrics: MetricKey[];
  onToggleEditExerciseMetric: (metric: MetricKey) => void;
  editExerciseTargets: Partial<Record<MetricKey, string>>;
  onEditExerciseTargetChange: (metric: MetricKey, value: string) => void;
  onUpdateExercise: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  newExerciseError: string | null;
  editExerciseError: string | null;
};

export function ExercisesTab({
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
  newExerciseDurationMin,
  onNewExerciseDurationMinChange,
  newExerciseMetrics,
  onToggleNewExerciseMetric,
  newExerciseTargets,
  onNewExerciseTargetChange,
  onCreateExercise,
  editingExerciseId,
  onStartEditExercise,
  onCancelEditExercise,
  editExerciseName,
  onEditExerciseNameChange,
  editExerciseCategory,
  onEditExerciseCategoryChange,
  editExerciseSubcategory,
  onEditExerciseSubcategoryChange,
  editExerciseNotes,
  onEditExerciseNotesChange,
  editExerciseDurationMin,
  onEditExerciseDurationMinChange,
  editExerciseMetrics,
  onToggleEditExerciseMetric,
  editExerciseTargets,
  onEditExerciseTargetChange,
  onUpdateExercise,
  newExerciseError,
  editExerciseError,
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
                <ExerciseCard
                  key={exercise.id}
                  exercise={exercise}
                  href={`/exercises/${exercise.id}`}
                  onEdit={() => onStartEditExercise(exercise)}
                />
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
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
                href={`/exercises/${exercise.id}`}
                onEdit={() => onStartEditExercise(exercise)}
              />
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
            <label className="block text-sm text-zinc-300">
              Zeit (Minuten) – pro Exercise
              <input
                type="number"
                min={1}
                value={newExerciseDurationMin}
                onChange={(event) => onNewExerciseDurationMinChange(event.target.value)}
                placeholder="z. B. 12"
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </label>
            <p className="text-xs text-zinc-500">
              Diese Zeit wird in der Dauer-Spalte angezeigt und in die Workout-Gesamtzeit übernommen.
            </p>

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
            {newExerciseError ? <p className="text-sm text-rose-300">{newExerciseError}</p> : null}
          </form>
        </section>
      </div>

      {editingExerciseId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-4">
            <h3 className="text-xl font-semibold text-amber-300">Exercise bearbeiten</h3>
            <form className="mt-3 space-y-3" onSubmit={onUpdateExercise}>
              <FilterSection
                title="Kategorie"
                options={categories}
                selectedValue={editExerciseCategory}
                onSelect={onEditExerciseCategoryChange}
              />

              <FilterSection
                title="Unterkategorie"
                options={subcategories[editExerciseCategory]}
                selectedValue={editExerciseSubcategory}
                onSelect={onEditExerciseSubcategoryChange}
              />

              <input
                value={editExerciseName}
                onChange={(event) => onEditExerciseNameChange(event.target.value)}
                placeholder="Exercise Name"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
              <textarea
                value={editExerciseNotes}
                onChange={(event) => onEditExerciseNotesChange(event.target.value)}
                placeholder="Notizen zur Exercise"
                rows={2}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
              <label className="block text-sm text-zinc-300">
                Zeit (Minuten) – pro Exercise
                <input
                  type="number"
                  min={1}
                  value={editExerciseDurationMin}
                  onChange={(event) => onEditExerciseDurationMinChange(event.target.value)}
                  placeholder="z. B. 12"
                  className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                />
              </label>

              <div>
                <p className="mb-2 text-sm font-medium text-zinc-300">Messfelder wählen</p>
                <div className="flex flex-wrap gap-2">
                  {METRIC_OPTIONS.map((metric) => {
                    const active = editExerciseMetrics.includes(metric);
                    return (
                      <button
                        key={metric}
                        type="button"
                        onClick={() => onToggleEditExerciseMetric(metric)}
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

              {editExerciseMetrics.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {editExerciseMetrics.map((metric) => (
                    <input
                      key={metric}
                      type="number"
                      value={editExerciseTargets[metric] ?? ""}
                      onChange={(event) => onEditExerciseTargetChange(metric, event.target.value)}
                      placeholder={`Ziel ${METRIC_LABELS[metric]}`}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-amber-300">Bitte mindestens ein Messfeld auswählen.</p>
              )}

              <div className="flex gap-2">
                <button type="submit" className="flex-1 rounded-xl bg-amber-600 px-4 py-2 font-semibold">
                  Änderungen speichern
                </button>
                <button
                  type="button"
                  onClick={onCancelEditExercise}
                  className="flex-1 rounded-xl border border-zinc-600 px-4 py-2 font-semibold text-zinc-200"
                >
                  Abbrechen
                </button>
              </div>
              {editExerciseError ? <p className="text-sm text-rose-300">{editExerciseError}</p> : null}
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function ExerciseCard({ exercise, href, onEdit }: { exercise: Exercise; href?: string; onEdit?: () => void }) {
  return (
    <article className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2">
      <p className="font-semibold">{exercise.name}</p>
      <p className="text-sm text-zinc-400">
        {exercise.category} • {exercise.subcategory} • {exercise.metricKeys.map((metric) => METRIC_LABELS[metric]).join(", ")}
      </p>
      <p className="text-xs text-zinc-500">Dauer: {exercise.durationMin} Min</p>
      <p className="text-xs text-zinc-500">Ziele: {formatMetricTargets(exercise)}</p>
      {exercise.notes ? <p className="text-xs text-zinc-500">Notizen: {exercise.notes}</p> : null}
      {href ? (
        <Link
          href={href}
          className="mt-2 inline-flex rounded-lg border border-indigo-500 px-3 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-950"
        >
          Exercise starten
        </Link>
      ) : null}
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="mt-2 ml-2 inline-flex rounded-lg border border-amber-500 px-3 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-950"
        >
          Bearbeiten
        </button>
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

export function TabSwitcher({ activeTab, onTabChange }: TabSwitcherProps) {
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