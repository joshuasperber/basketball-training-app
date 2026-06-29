"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import GradientFadeList from "@/components/GradientFadeList";
import {
  type Category,
  type Exercise,
  type MetricKey,
  type Workout,
} from "@/lib/training-data";
import type { DrillCatalogFilters } from "@/lib/drill-catalog-filters";
import { countActiveDrillFilters } from "@/lib/drill-catalog-filters";
import FilterClearButton from "@/components/ui/FilterClearButton";
import { buildReturnToQuery, buildReturnToTraining } from "@/lib/ui-navigation-state";
import { METRIC_LABELS, METRICS_BY_CATEGORY } from "@/lib/workout-metrics";

export type TrainingTab = "Workouts" | "Exercises";

function formatMetricTargets(exercise: Exercise) {
  if (!exercise.targetByMetric) return "-";
  return exercise.metricKeys
    .map((metric) => {
      const value = exercise.targetByMetric?.[metric];
      if (value === undefined) return null;
      return `${METRIC_LABELS[metric]} ${value}`;
    })
    .filter((entry): entry is string => Boolean(entry))
    .join(" • ");
}

function calculateWorkoutMinutes(exercises: Exercise[]) {
  const baseMinutes = exercises.reduce((sum, exercise) => sum + Math.max(0, exercise.durationMin || 0), 0);
  const boostedMinutes = baseMinutes * 1.1;
  return Math.ceil(boostedMinutes / 5) * 5;
}

function isGameWorkout(workout: Workout) {
  return workout.category === "Basketball" && workout.subcategory === "Spiel";
}

function gameContextForWorkout(workout: Workout) {
  return workout.name.toLowerCase().includes("training") ? "game_training" : "game";
}

type WorkoutsTabProps = {
  categories: Category[];
  subcategories: Record<Category, string[]>;
  onCreateSubcategory: (category: Category, name: string) => void;
  onDeleteSubcategory: (category: Category, subcategory: string) => void;
  selectedCategory: Category;
  selectedSubcategory: string;
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
  onDeleteWorkout: (workoutId: string) => void;
  selectionReady: boolean;
  onCategorySelect: (category: Category) => void;
};

type ExercisesTabProps = {
  categories: Category[];
  subcategories: Record<Category, string[]>;
  onCreateSubcategory: (category: Category, name: string) => void;
  onDeleteSubcategory: (category: Category, subcategory: string) => void;
  selectedCategory: Category;
  selectedSubcategory: string;
  onSubcategoryChange: (subcategory: string) => void;
  drillFilters: DrillCatalogFilters;
  onDrillFilterChange: (patch: Partial<DrillCatalogFilters>) => void;
  onDrillFiltersReset: () => void;
  visibleExercises: Exercise[];
  selectionReady: boolean;
  onCategorySelect: (category: Category) => void;
  newExerciseName: string;
  onNewExerciseNameChange: (value: string) => void;
  newExerciseCategory: Category;
  onNewExerciseCategoryChange: (category: Category) => void;
  newExerciseSubcategory: string;
  onNewExerciseSubcategoryChange: (value: string) => void;
  newExerciseNotes: string;
  onNewExerciseNotesChange: (value: string) => void;
  newExerciseVideoUrl: string;
  onNewExerciseVideoUrlChange: (value: string) => void;
  onNewExerciseVideoFile: (file: File | null) => void;
  newExerciseDurationMin: string;
  onNewExerciseDurationMinChange: (value: string) => void;
  newExerciseDurationUnit: "minutes" | "seconds";
  onNewExerciseDurationUnitChange: (value: "minutes" | "seconds") => void;
  newExerciseSetCount: string;
  onNewExerciseSetCountChange: (value: string) => void;
  newExerciseMetrics: MetricKey[];
  onToggleNewExerciseMetric: (metric: MetricKey) => void;
  newExerciseTargets: Partial<Record<MetricKey, string>>;
  onNewExerciseTargetChange: (metric: MetricKey, value: string) => void;
  newExerciseSetTargets: Partial<Record<MetricKey, string>>[];
  onNewExerciseSetTargetChange: (setIndex: number, metric: MetricKey, value: string) => void;
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
  editExerciseVideoUrl: string;
  onEditExerciseVideoUrlChange: (value: string) => void;
  onEditExerciseVideoFile: (file: File | null) => void;
  editExerciseDurationMin: string;
  onEditExerciseDurationMinChange: (value: string) => void;
  editExerciseDurationUnit: "minutes" | "seconds";
  onEditExerciseDurationUnitChange: (value: "minutes" | "seconds") => void;
  editExerciseSetCount: string;
  onEditExerciseSetCountChange: (value: string) => void;
  editExerciseMetrics: MetricKey[];
  onToggleEditExerciseMetric: (metric: MetricKey) => void;
  editExerciseTargets: Partial<Record<MetricKey, string>>;
  onEditExerciseTargetChange: (metric: MetricKey, value: string) => void;
  editExerciseSetTargets: Partial<Record<MetricKey, string>>[];
  onEditExerciseSetTargetChange: (setIndex: number, metric: MetricKey, value: string) => void;
  onUpdateExercise: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  onDeleteExercise: (exerciseId: string) => void;
  newExerciseError: string | null;
  editExerciseError: string | null;
};

export type WorkoutCreateFormProps = Pick<
  WorkoutsTabProps,
  | "categories"
  | "subcategories"
  | "createWorkoutExerciseOptions"
  | "newWorkoutName"
  | "onNewWorkoutNameChange"
  | "selectedExerciseIds"
  | "onSelectedExerciseIdsChange"
  | "newWorkoutCategory"
  | "onNewWorkoutCategoryChange"
  | "newWorkoutSubcategory"
  | "onNewWorkoutSubcategoryChange"
  | "newWorkoutNotes"
  | "onNewWorkoutNotesChange"
  | "onCreateWorkout"
  | "availableExercises"
>;

export function WorkoutCreateForm({
  categories,
  subcategories,
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
  availableExercises,
}: WorkoutCreateFormProps) {
  const selectedExercises = useMemo(
    () => availableExercises.filter((exercise) => selectedExerciseIds.includes(exercise.id)),
    [availableExercises, selectedExerciseIds],
  );
  const selectedWorkoutMinutes = useMemo(() => calculateWorkoutMinutes(selectedExercises), [selectedExercises]);

  return (
    <form id="new-workout-form" className="space-y-3" onSubmit={onCreateWorkout}>
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
      <div>
        <label className="input-label" htmlFor="new-workout-name">
          Workout Name *
        </label>
        <input
          id="new-workout-name"
          value={newWorkoutName}
          onChange={(event) => onNewWorkoutNameChange(event.target.value)}
          placeholder="z. B. Shooting Fokus"
          className="input"
        />
      </div>
      <div>
        <label className="input-label" htmlFor="new-workout-notes">
          Notizen
        </label>
        <textarea
          id="new-workout-notes"
          value={newWorkoutNotes}
          onChange={(event) => onNewWorkoutNotesChange(event.target.value)}
          placeholder="Notizen zum Workout"
          rows={2}
          className="textarea"
        />
      </div>
      <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--bg-muted)] p-3">
        {newWorkoutCategory === "Basketball" && newWorkoutSubcategory === "Spiel" ? (
          <p className="text-sm text-muted">
            Für Spiel-Workouts brauchst du keine Exercises. Beim Start öffnet sich automatisch das Game-Tracking.
          </p>
        ) : createWorkoutExerciseOptions.length === 0 ? (
          <p className="text-sm text-muted">Keine Exercises in dieser Kategorie/Unterkategorie.</p>
        ) : (
          <GradientFadeList
            items={createWorkoutExerciseOptions}
            listClassName="space-y-2"
            getKey={(exercise) => exercise.id}
            renderItem={(exercise) => {
              const checked = selectedExerciseIds.includes(exercise.id);
              return (
                <label className="flex items-center justify-between gap-3 text-sm text-strong">
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
            }}
          />
        )}
      </div>
      {selectedExercises.length > 0 ? (
        <div className="app-card--flat">
          <p className="text-xs text-muted">Bereits ausgewählt</p>
          <ul className="mt-2 list-inside list-disc text-sm text-strong">
            {selectedExercises.map((exercise) => (
              <li key={`selected-${exercise.id}`}>{exercise.name}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-muted">
        Zeitberechnung: {selectedExercises.reduce((sum, item) => sum + item.durationMin, 0)} Min × 1.10 ⇒{" "}
        {selectedWorkoutMinutes} Min (auf 5er-Schritte aufgerundet)
      </p>
      <button type="submit" className="btn btn-primary btn-block">
        Workout hinzufügen
      </button>
    </form>
  );
}

export function WorkoutsTab({
  categories,
  subcategories,
  onCreateSubcategory,
  onDeleteSubcategory,
  selectedCategory,
  selectedSubcategory,
  onSubcategoryChange,
  workouts,
  availableExercises,
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
  onDeleteWorkout,
  selectionReady,
  onCategorySelect,
}: WorkoutsTabProps) {
  const editExerciseOptions = useMemo(() => availableExercises, [availableExercises]);

  return (
    <section className="space-y-4">
      <CategorySubcategoryNav
        categories={categories}
        subcategories={subcategories}
        selectedCategory={selectedCategory}
        selectedSubcategory={selectedSubcategory}
        showSubcategories={selectionReady}
        onCategorySelect={onCategorySelect}
        onSubcategoryChange={onSubcategoryChange}
        onCreateSubcategory={onCreateSubcategory}
        onDeleteSubcategory={onDeleteSubcategory}
      />

      <section className="ui-card">
        <h2 className="ui-card__title">Workouts</h2>
        <p className="ui-card__subtitle">
          Target-Score (pro Exercise): <span className="font-semibold text-strong">80 + Progression</span>
        </p>

        {!selectionReady ? (
          <div className="mt-4">
            <EmptyState
              title="Kategorie wählen"
              description="Tippe zuerst auf Basketball, Gym, Home oder Regeneration — danach erscheinen die Unterkategorien."
            />
          </div>
        ) : workouts.length === 0 ? (
            <EmptyState
              title="Noch kein Workout"
              description="Erstelle ein Workout mit dem + Button oben rechts."
            />
          ) : (
            <GradientFadeList
              className="mt-4"
              items={workouts}
              listClassName="space-y-2"
              getKey={(workout) => workout.id}
              renderItem={(workout) => (
              <article className="list-card">
                <p className="list-card__title">{workout.name}</p>
                {workout.notes ? <p className="list-card__meta">{workout.notes}</p> : null}
                <p className="list-card__meta">
                  Geplante Zeit:{" "}
                  {calculateWorkoutMinutes(
                    availableExercises.filter((exercise) => workout.exerciseIds.includes(exercise.id)),
                  )}{" "}
                  Min
                </p>
                <div className="list-card__actions">
                  <Link
                    href={
                      isGameWorkout(workout)
                        ? `/game-track?context=${gameContextForWorkout(workout)}`
                        : `/workouts/${workout.id}?returnTo=${buildReturnToQuery(buildReturnToTraining("Workouts"))}`
                    }
                    className="btn btn-primary btn-xs"
                  >
                    {isGameWorkout(workout) ? "Spiel tracken" : "Workout starten"}
                  </Link>
                  <button type="button" onClick={() => onStartEditWorkout(workout)} className="btn btn-outline btn-xs">
                    Bearbeiten
                  </button>
                  <button type="button" onClick={() => onDeleteWorkout(workout.id)} className="btn btn-danger-outline btn-xs">
                    Löschen
                  </button>
                </div>
              </article>
              )}
            />
          )}
      </section>

      {editingWorkoutId ? (
        <div className="modal-overlay">
          <form className="modal-panel space-y-3" onSubmit={onUpdateWorkout}>
            <h4 className="section-title">Workout bearbeiten</h4>
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
              className="input"
            />
            <textarea
              value={editWorkoutNotes}
              onChange={(event) => onEditWorkoutNotesChange(event.target.value)}
              placeholder="Notizen zum Workout"
              rows={2}
              className="textarea"
            />

            <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--bg-muted)] p-3">
              {editExerciseOptions.length === 0 ? (
                <p className="text-sm text-muted">Keine Exercises in dieser Kategorie/Unterkategorie.</p>
              ) : (
                <GradientFadeList
                  items={editExerciseOptions}
                  listClassName="space-y-2"
                  getKey={(exercise) => exercise.id}
                  renderItem={(exercise) => {
                    const checked = editWorkoutExerciseIds.includes(exercise.id);

                    return (
                      <label className="flex items-center justify-between gap-3 text-sm">
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
                  }}
                />
              )}
            </div>

            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary flex-1">
                Änderungen speichern
              </button>
              <button type="button" onClick={onCancelEditWorkout} className="btn btn-ghost flex-1">
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export type ExerciseCreateFormProps = Pick<
  ExercisesTabProps,
  | "categories"
  | "subcategories"
  | "newExerciseName"
  | "onNewExerciseNameChange"
  | "newExerciseCategory"
  | "onNewExerciseCategoryChange"
  | "newExerciseSubcategory"
  | "onNewExerciseSubcategoryChange"
  | "newExerciseNotes"
  | "onNewExerciseNotesChange"
  | "newExerciseVideoUrl"
  | "onNewExerciseVideoUrlChange"
  | "onNewExerciseVideoFile"
  | "newExerciseDurationMin"
  | "onNewExerciseDurationMinChange"
  | "newExerciseDurationUnit"
  | "onNewExerciseDurationUnitChange"
  | "newExerciseSetCount"
  | "onNewExerciseSetCountChange"
  | "newExerciseMetrics"
  | "onToggleNewExerciseMetric"
  | "newExerciseTargets"
  | "onNewExerciseTargetChange"
  | "newExerciseSetTargets"
  | "onNewExerciseSetTargetChange"
  | "onCreateExercise"
  | "newExerciseError"
>;

export function ExerciseCreateForm(props: ExerciseCreateFormProps) {
  return (
    <form id="new-exercise-form" className="space-y-3" onSubmit={props.onCreateExercise}>
      <ExerciseFormFields {...props} mode="create" />
    </form>
  );
}

type ExerciseFormBaseProps = Omit<ExerciseCreateFormProps, "onCreateExercise">;

type ExerciseFormFieldsProps = ExerciseFormBaseProps & {
  mode: "create" | "edit";
  editExerciseName?: string;
  onEditExerciseNameChange?: (value: string) => void;
  editExerciseCategory?: Category;
  onEditExerciseCategoryChange?: (category: Category) => void;
  editExerciseSubcategory?: string;
  onEditExerciseSubcategoryChange?: (value: string) => void;
  editExerciseNotes?: string;
  onEditExerciseNotesChange?: (value: string) => void;
  editExerciseVideoUrl?: string;
  onEditExerciseVideoUrlChange?: (value: string) => void;
  onEditExerciseVideoFile?: (file: File | null) => void;
  editExerciseDurationMin?: string;
  onEditExerciseDurationMinChange?: (value: string) => void;
  editExerciseDurationUnit?: "minutes" | "seconds";
  onEditExerciseDurationUnitChange?: (value: "minutes" | "seconds") => void;
  editExerciseSetCount?: string;
  onEditExerciseSetCountChange?: (value: string) => void;
  editExerciseMetrics?: MetricKey[];
  onToggleEditExerciseMetric?: (metric: MetricKey) => void;
  editExerciseTargets?: Partial<Record<MetricKey, string>>;
  onEditExerciseTargetChange?: (metric: MetricKey, value: string) => void;
  editExerciseSetTargets?: Partial<Record<MetricKey, string>>[];
  onEditExerciseSetTargetChange?: (setIndex: number, metric: MetricKey, value: string) => void;
  editExerciseError?: string | null;
};

function ExerciseFormFields({
  mode,
  categories,
  subcategories,
  newExerciseName,
  onNewExerciseNameChange,
  newExerciseCategory,
  onNewExerciseCategoryChange,
  newExerciseSubcategory,
  onNewExerciseSubcategoryChange,
  newExerciseNotes,
  onNewExerciseNotesChange,
  newExerciseVideoUrl,
  onNewExerciseVideoUrlChange,
  onNewExerciseVideoFile,
  newExerciseDurationMin,
  onNewExerciseDurationMinChange,
  newExerciseDurationUnit,
  onNewExerciseDurationUnitChange,
  newExerciseSetCount,
  onNewExerciseSetCountChange,
  newExerciseMetrics,
  onToggleNewExerciseMetric,
  newExerciseTargets,
  onNewExerciseTargetChange,
  newExerciseSetTargets,
  onNewExerciseSetTargetChange,
  newExerciseError,
  editExerciseName,
  onEditExerciseNameChange,
  editExerciseCategory,
  onEditExerciseCategoryChange,
  editExerciseSubcategory,
  onEditExerciseSubcategoryChange,
  editExerciseNotes,
  onEditExerciseNotesChange,
  editExerciseVideoUrl,
  onEditExerciseVideoUrlChange,
  onEditExerciseVideoFile,
  editExerciseDurationMin,
  onEditExerciseDurationMinChange,
  editExerciseDurationUnit,
  onEditExerciseDurationUnitChange,
  editExerciseSetCount,
  onEditExerciseSetCountChange,
  editExerciseMetrics,
  onToggleEditExerciseMetric,
  editExerciseTargets,
  onEditExerciseTargetChange,
  editExerciseSetTargets,
  onEditExerciseSetTargetChange,
  editExerciseError,
}: ExerciseFormFieldsProps) {
  const isEdit = mode === "edit";
  const category = isEdit ? (editExerciseCategory ?? newExerciseCategory) : newExerciseCategory;
  const metrics = isEdit ? (editExerciseMetrics ?? newExerciseMetrics) : newExerciseMetrics;
  const setCount = isEdit ? (editExerciseSetCount ?? newExerciseSetCount) : newExerciseSetCount;
  const setTargets = isEdit ? (editExerciseSetTargets ?? newExerciseSetTargets) : newExerciseSetTargets;
  const error = isEdit ? editExerciseError : newExerciseError;

  return (
    <>
      <FilterSection
        title="Kategorie"
        options={categories}
        selectedValue={category}
        onSelect={isEdit ? onEditExerciseCategoryChange! : onNewExerciseCategoryChange}
      />
      <FilterSection
        title="Unterkategorie"
        options={subcategories[category]}
        selectedValue={isEdit ? (editExerciseSubcategory ?? newExerciseSubcategory) : newExerciseSubcategory}
        onSelect={isEdit ? onEditExerciseSubcategoryChange! : onNewExerciseSubcategoryChange}
      />
      <input
        value={isEdit ? editExerciseName : newExerciseName}
        onChange={(event) =>
          isEdit ? onEditExerciseNameChange?.(event.target.value) : onNewExerciseNameChange(event.target.value)
        }
        placeholder="Exercise Name"
        className="input"
      />
      <textarea
        value={isEdit ? editExerciseNotes : newExerciseNotes}
        onChange={(event) =>
          isEdit ? onEditExerciseNotesChange?.(event.target.value) : onNewExerciseNotesChange(event.target.value)
        }
        placeholder="Notizen zur Exercise"
        rows={2}
        className="textarea"
      />
      <div className="app-card--flat">
        <p className="text-sm font-medium text-strong">Demo-Video</p>
        <p className="mt-1 text-xs text-muted">YouTube-/Vimeo-Link oder kurzes Video (lokal, max. ca. 2,5 MB).</p>
        <input
          type="url"
          value={isEdit ? editExerciseVideoUrl : newExerciseVideoUrl}
          onChange={(event) =>
            isEdit ? onEditExerciseVideoUrlChange?.(event.target.value) : onNewExerciseVideoUrlChange(event.target.value)
          }
          placeholder="https://www.youtube.com/watch?v=…"
          className="input mt-2"
        />
        <label className="mt-2 block text-xs text-muted">
          Video hochladen
          <input
            type="file"
            accept="video/*"
            className="mt-1 block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-[var(--brand-500)] file:px-2 file:py-1 file:text-white"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              if (isEdit) onEditExerciseVideoFile?.(file);
              else onNewExerciseVideoFile(file);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <label className="block text-sm text-muted">
        Zeit (Dauer)
        <input
          type="number"
          min={1}
          value={isEdit ? editExerciseDurationMin : newExerciseDurationMin}
          onChange={(event) =>
            isEdit
              ? onEditExerciseDurationMinChange?.(event.target.value)
              : onNewExerciseDurationMinChange(event.target.value)
          }
          placeholder="z. B. 12"
          className="input mt-1"
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        {metrics.includes("time") ? (
          <label className="block text-sm text-muted">
            Zeiteinheit
            <select
              value={isEdit ? editExerciseDurationUnit : newExerciseDurationUnit}
              onChange={(event) => {
                const unit = event.target.value as "minutes" | "seconds";
                if (isEdit) onEditExerciseDurationUnitChange?.(unit);
                else onNewExerciseDurationUnitChange(unit);
              }}
              className="select mt-1"
            >
              <option value="minutes">Minuten</option>
              <option value="seconds">Sekunden</option>
            </select>
          </label>
        ) : null}
        <label className="block text-sm text-muted">
          Anzahl Sets
          <input
            type="number"
            min={1}
            value={setCount}
            onChange={(event) =>
              isEdit ? onEditExerciseSetCountChange?.(event.target.value) : onNewExerciseSetCountChange(event.target.value)
            }
            className="input mt-1"
          />
        </label>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-strong">Messfelder wählen</p>
        <div className="flex flex-wrap gap-2">
          {METRICS_BY_CATEGORY[category].map((metric) => {
            const active = metrics.includes(metric);
            return (
              <button
                key={metric}
                type="button"
                onClick={() =>
                  isEdit ? onToggleEditExerciseMetric?.(metric) : onToggleNewExerciseMetric(metric)
                }
                className={`filter-chip ${active ? "filter-chip--active" : ""}`}
              >
                {METRIC_LABELS[metric]}
              </button>
            );
          })}
        </div>
      </div>
      {metrics.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {metrics.map((metric) => (
            <input
              key={metric}
              type="number"
              value={(isEdit ? editExerciseTargets : newExerciseTargets)?.[metric] ?? ""}
              onChange={(event) =>
                isEdit
                  ? onEditExerciseTargetChange?.(metric, event.target.value)
                  : onNewExerciseTargetChange(metric, event.target.value)
              }
              placeholder={`Ziel ${METRIC_LABELS[metric]}`}
              className="input"
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-brand">Bitte mindestens ein Messfeld auswählen.</p>
      )}
      {Number(setCount) > 1 && metrics.length > 0 ? (
        <div className="app-card--flat">
          <p className="text-xs text-muted">Set-spezifische Ziele</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {setTargets.map((setTargetRow, setIndex) => (
              <div key={`set-goal-${setIndex}`} className="w-full rounded-lg border border-[var(--surface-border)] p-2">
                <p className="text-xs text-brand">Satz {setIndex + 1}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {metrics.map((metric) => (
                    <input
                      key={`set-${setIndex}-${metric}`}
                      type="number"
                      value={setTargetRow[metric] ?? ""}
                      onChange={(event) =>
                        isEdit
                          ? onEditExerciseSetTargetChange?.(setIndex, metric, event.target.value)
                          : onNewExerciseSetTargetChange(setIndex, metric, event.target.value)
                      }
                      placeholder={`${METRIC_LABELS[metric]} (Satz ${setIndex + 1})`}
                      className="input"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {mode === "create" ? (
        <button type="submit" className="btn btn-primary btn-block">
          Exercise hinzufügen
        </button>
      ) : null}
      {error ? <p className="text-sm text-brand">{error}</p> : null}
    </>
  );
}

export function ExercisesTab({
  categories,
  subcategories,
  onCreateSubcategory,
  onDeleteSubcategory,
  selectedCategory,
  selectedSubcategory,
  onSubcategoryChange,
  drillFilters,
  onDrillFilterChange,
  onDrillFiltersReset,
  visibleExercises,
  selectionReady,
  onCategorySelect,
  newExerciseName,
  onNewExerciseNameChange,
  newExerciseCategory,
  onNewExerciseCategoryChange,
  newExerciseSubcategory,
  onNewExerciseSubcategoryChange,
  newExerciseNotes,
  onNewExerciseNotesChange,
  newExerciseVideoUrl,
  onNewExerciseVideoUrlChange,
  onNewExerciseVideoFile,
  newExerciseDurationMin,
  onNewExerciseDurationMinChange,
  newExerciseDurationUnit,
  onNewExerciseDurationUnitChange,
  newExerciseSetCount,
  onNewExerciseSetCountChange,
  newExerciseMetrics,
  onToggleNewExerciseMetric,
  newExerciseTargets,
  onNewExerciseTargetChange,
  newExerciseSetTargets,
  onNewExerciseSetTargetChange,
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
  editExerciseVideoUrl,
  onEditExerciseVideoUrlChange,
  onEditExerciseVideoFile,
  editExerciseDurationMin,
  onEditExerciseDurationMinChange,
  editExerciseDurationUnit,
  onEditExerciseDurationUnitChange,
  editExerciseSetCount,
  onEditExerciseSetCountChange,
  editExerciseMetrics,
  onToggleEditExerciseMetric,
  editExerciseTargets,
  onEditExerciseTargetChange,
  editExerciseSetTargets,
  onEditExerciseSetTargetChange,
  onUpdateExercise,
  onDeleteExercise,
  newExerciseError,
  editExerciseError,
}: ExercisesTabProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const drillActiveCount = countActiveDrillFilters(drillFilters);

  const exerciseFormSharedProps = {
    categories,
    subcategories,
    newExerciseName,
    onNewExerciseNameChange,
    newExerciseCategory,
    onNewExerciseCategoryChange,
    newExerciseSubcategory,
    onNewExerciseSubcategoryChange,
    newExerciseNotes,
    onNewExerciseNotesChange,
    newExerciseVideoUrl,
    onNewExerciseVideoUrlChange,
    onNewExerciseVideoFile,
    newExerciseDurationMin,
    onNewExerciseDurationMinChange,
    newExerciseDurationUnit,
    onNewExerciseDurationUnitChange,
    newExerciseSetCount,
    onNewExerciseSetCountChange,
    newExerciseMetrics,
    onToggleNewExerciseMetric,
    newExerciseTargets,
    onNewExerciseTargetChange,
    newExerciseSetTargets,
    onNewExerciseSetTargetChange,
    newExerciseError,
  };

  return (
    <section className="space-y-4">
      <CategorySubcategoryNav
        categories={categories}
        subcategories={subcategories}
        selectedCategory={selectedCategory}
        selectedSubcategory={selectedSubcategory}
        showSubcategories={selectionReady}
        onCategorySelect={onCategorySelect}
        onSubcategoryChange={onSubcategoryChange}
        onCreateSubcategory={onCreateSubcategory}
        onDeleteSubcategory={onDeleteSubcategory}
      />

      <section className="ui-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="ui-card__title">Katalog-Filter</h2>
            <p className="ui-card__subtitle">Video, Dauer und Ort — optional einklappbar.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <FilterClearButton onClick={onDrillFiltersReset} disabled={drillActiveCount === 0} />
            <button
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
              className="btn btn-ghost btn-sm shrink-0"
              aria-expanded={filtersOpen}
              aria-label={filtersOpen ? "Katalog-Filter schließen" : "Katalog-Filter öffnen"}
            >
              {filtersOpen ? "Schließen" : drillActiveCount > 0 ? `Filter (${drillActiveCount})` : "Filter"}
            </button>
          </div>
        </div>
        {!filtersOpen && drillActiveCount > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {drillFilters.video !== "all" ? (
              <span className="filter-chip filter-chip--active">
                Video: {drillFilters.video === "with" ? "Mit Video" : "Ohne Video"}
              </span>
            ) : null}
            {drillFilters.duration !== "all" ? (
              <span className="filter-chip filter-chip--active">
                Dauer: {drillFilters.duration === "under10" ? "Unter 10 Min" : "Unter 15 Min"}
              </span>
            ) : null}
            {drillFilters.equipment !== "all" ? (
              <span className="filter-chip filter-chip--active">
                Ort:{" "}
                {drillFilters.equipment === "gym"
                  ? "Gym"
                  : drillFilters.equipment === "home"
                    ? "Heim"
                    : "Outdoor (BB)"}
              </span>
            ) : null}
          </div>
        ) : null}
        {filtersOpen ? (
          <div className="mt-4">
            <DrillCatalogFilterFields filters={drillFilters} onChange={onDrillFilterChange} />
          </div>
        ) : null}
      </section>

      <section className="ui-card">
        <h2 className="ui-card__title">Exercises in Auswahl</h2>
        <p className="ui-card__subtitle">
          {selectionReady ? `${selectedCategory} • ${selectedSubcategory}` : "Kategorie und Unterkategorie wählen"}
        </p>

        <div className="mt-4 space-y-2">
          {!selectionReady ? (
            <EmptyState
              title="Kategorie wählen"
              description="Tippe zuerst auf Basketball, Gym, Home oder Regeneration — danach erscheinen die Unterkategorien."
            />
          ) : visibleExercises.length === 0 ? (
            <EmptyState
              title="Keine Exercises"
              description="Für diese Auswahl gibt es noch keine Exercises. Erstelle eine mit dem + Button."
            />
          ) : (
            <GradientFadeList
              items={visibleExercises}
              listClassName="space-y-2"
              getKey={(exercise) => exercise.id}
              renderItem={(exercise) => (
                <ExerciseCard
                  exercise={exercise}
                  href={`/exercises/${exercise.id}?returnTo=${buildReturnToQuery(buildReturnToTraining("Exercises"))}`}
                  onEdit={() => onStartEditExercise(exercise)}
                  onDelete={() => onDeleteExercise(exercise.id)}
                />
              )}
            />
          )}
        </div>
      </section>

      {editingExerciseId ? (
        <div className="modal-overlay">
          <section className="modal-panel">
            <h3 className="section-title">Exercise bearbeiten</h3>
            <form className="mt-3 space-y-3" onSubmit={onUpdateExercise}>
              <ExerciseFormFields
                {...exerciseFormSharedProps}
                mode="edit"
                editExerciseName={editExerciseName}
                onEditExerciseNameChange={onEditExerciseNameChange}
                editExerciseCategory={editExerciseCategory}
                onEditExerciseCategoryChange={onEditExerciseCategoryChange}
                editExerciseSubcategory={editExerciseSubcategory}
                onEditExerciseSubcategoryChange={onEditExerciseSubcategoryChange}
                editExerciseNotes={editExerciseNotes}
                onEditExerciseNotesChange={onEditExerciseNotesChange}
                editExerciseVideoUrl={editExerciseVideoUrl}
                onEditExerciseVideoUrlChange={onEditExerciseVideoUrlChange}
                onEditExerciseVideoFile={onEditExerciseVideoFile}
                editExerciseDurationMin={editExerciseDurationMin}
                onEditExerciseDurationMinChange={onEditExerciseDurationMinChange}
                editExerciseDurationUnit={editExerciseDurationUnit}
                onEditExerciseDurationUnitChange={onEditExerciseDurationUnitChange}
                editExerciseSetCount={editExerciseSetCount}
                onEditExerciseSetCountChange={onEditExerciseSetCountChange}
                editExerciseMetrics={editExerciseMetrics}
                onToggleEditExerciseMetric={onToggleEditExerciseMetric}
                editExerciseTargets={editExerciseTargets}
                onEditExerciseTargetChange={onEditExerciseTargetChange}
                editExerciseSetTargets={editExerciseSetTargets}
                onEditExerciseSetTargetChange={onEditExerciseSetTargetChange}
                editExerciseError={editExerciseError}
              />
              <div className="flex gap-2">
                <button type="submit" className="btn btn-primary flex-1">
                  Änderungen speichern
                </button>
                <button type="button" onClick={onCancelEditExercise} className="btn btn-ghost flex-1">
                  Abbrechen
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function ExerciseCard({
  exercise,
  href,
  onEdit,
  onDelete,
}: {
  exercise: Exercise;
  href?: string;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <article className="list-card">
      <p className="list-card__title">{exercise.name}</p>
      <p className="list-card__meta">
        {exercise.category} • {exercise.subcategory} •{" "}
        {exercise.metricKeys.map((metric) => METRIC_LABELS[metric]).join(", ")}
      </p>
      <p className="list-card__meta">
        Dauer: {exercise.durationMin} {exercise.timeUnit === "seconds" ? "Sek" : "Min"} · Sets: {exercise.setCount ?? 1}
      </p>
      <p className="list-card__meta">Ziele: {formatMetricTargets(exercise)}</p>
      {exercise.notes ? <p className="list-card__meta">{exercise.notes}</p> : null}

      <div className="list-card__actions">
        {href ? (
          <Link href={href} className="btn btn-primary btn-xs">
            Exercise starten
          </Link>
        ) : null}
        {onEdit ? (
          <button type="button" onClick={onEdit} className="btn btn-outline btn-xs">
            Bearbeiten
          </button>
        ) : null}
        {onDelete ? (
          <button type="button" onClick={onDelete} className="btn btn-danger-outline btn-xs">
            Löschen
          </button>
        ) : null}
      </div>
    </article>
  );
}

function DrillCatalogFilterFields({
  filters,
  onChange,
}: {
  filters: DrillCatalogFilters;
  onChange: (patch: Partial<DrillCatalogFilters>) => void;
  onReset?: () => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="input-label">Video</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["all", "Alle"],
              ["with", "Mit Video"],
              ["without", "Ohne Video"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ video: value })}
              className={`filter-chip ${filters.video === value ? "filter-chip--active" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="input-label">Dauer (planmäßig)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["all", "Alle"],
              ["under10", "Unter 10 Min"],
              ["under15", "Unter 15 Min"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ duration: value })}
              className={`filter-chip ${filters.duration === value ? "filter-chip--active" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="input-label">Ort / Equipment</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["all", "Alle"],
              ["gym", "Gym"],
              ["home", "Heim"],
              ["outdoor", "Outdoor (BB)"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ equipment: value })}
              className={`filter-chip ${filters.equipment === value ? "filter-chip--active" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

type CategorySubcategoryNavProps = {
  categories: Category[];
  subcategories: Record<Category, string[]>;
  selectedCategory: Category;
  selectedSubcategory: string;
  showSubcategories: boolean;
  onCategorySelect: (category: Category) => void;
  onSubcategoryChange: (subcategory: string) => void;
  onCreateSubcategory: (category: Category, name: string) => void;
  onDeleteSubcategory: (category: Category, subcategory: string) => void;
};

function CategorySubcategoryNav({
  categories,
  subcategories,
  selectedCategory,
  selectedSubcategory,
  showSubcategories,
  onCategorySelect,
  onSubcategoryChange,
  onCreateSubcategory,
  onDeleteSubcategory,
}: CategorySubcategoryNavProps) {
  const [draft, setDraft] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const handleAddSubcategory = () => {
    if (!showAdd) {
      setShowAdd(true);
      return;
    }
    if (!draft.trim()) return;
    onCreateSubcategory(selectedCategory, draft.trim());
    setDraft("");
    setShowAdd(false);
  };

  return (
    <section className="ui-card">
      <h2 className="ui-card__title">Kategorie</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => onCategorySelect(category)}
            className={`filter-chip ${selectedCategory === category && showSubcategories ? "filter-chip--active" : ""}`}
            aria-pressed={selectedCategory === category && showSubcategories}
          >
            {category}
          </button>
        ))}
      </div>

      {showSubcategories ? (
        <div className="mt-4 border-t border-[var(--surface-border)] pt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="ui-card__title text-base">Unterkategorie</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddSubcategory}
                className="btn btn-ghost btn-xs"
                aria-label="Unterkategorie hinzufügen"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => onDeleteSubcategory(selectedCategory, selectedSubcategory)}
                className="btn btn-danger-outline btn-xs"
                aria-label="Unterkategorie löschen"
              >
                Löschen
              </button>
            </div>
          </div>
          {showAdd ? (
            <div className="mt-3 app-card--flat">
              <p className="input-label">Neue Unterkategorie</p>
              <div className="mt-2 flex gap-2">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="input flex-1"
                  placeholder="Name"
                />
                <button type="button" onClick={handleAddSubcategory} className="btn btn-primary btn-sm">
                  Speichern
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdd(false);
                    setDraft("");
                  }}
                  className="btn btn-ghost btn-sm"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {subcategories[selectedCategory].map((subcategory) => (
              <button
                key={`${selectedCategory}-${subcategory}`}
                type="button"
                onClick={() => onSubcategoryChange(subcategory)}
                className={`filter-chip ${selectedSubcategory === subcategory ? "filter-chip--active" : ""}`}
                aria-pressed={selectedSubcategory === subcategory}
              >
                {subcategory}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="ui-card__subtitle mt-3">Wähle eine Kategorie — die Unterkategorien erscheinen danach.</p>
      )}
    </section>
  );
}

type FilterSectionProps<T extends string> = {
  title: string;
  options: T[];
  selectedValue: T;
  onSelect: (value: T) => void;
  category?: Category;
  onCreateOption?: (category: Category, value: string) => void;
  onDeleteOption?: (category: Category, value: string) => void;
};

function FilterSection<T extends string>({
  title,
  options,
  selectedValue,
  onSelect,
  category,
  onCreateOption,
  onDeleteOption,
}: FilterSectionProps<T>) {
  const canEdit = Boolean(category && onCreateOption && onDeleteOption && title.toLowerCase().includes("unterkategorie"));
  const [draft, setDraft] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const handleAdd = () => {
    if (!canEdit || !category || !onCreateOption) return;
    if (!showAdd) {
      setShowAdd(true);
      return;
    }
    if (!draft.trim()) return;
    onCreateOption(category, draft.trim());
    setDraft("");
    setShowAdd(false);
  };

  const handleDelete = () => {
    if (!canEdit || !category || !onDeleteOption) return;
    onDeleteOption(category, selectedValue);
  };

  return (
    <section className="ui-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="ui-card__title">{title}</h2>
        {canEdit ? (
          <div className="flex gap-2">
            <button type="button" onClick={handleAdd} className="btn btn-ghost btn-xs" aria-label="Unterkategorie hinzufügen">
              +
            </button>
            <button type="button" onClick={handleDelete} className="btn btn-danger-outline btn-xs" aria-label="Unterkategorie löschen">
              Löschen
            </button>
          </div>
        ) : null}
      </div>

      {showAdd ? (
        <div className="mt-3 app-card--flat">
          <p className="input-label">Neue Unterkategorie</p>
          <div className="mt-2 flex gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="input flex-1"
              placeholder="Name"
            />
            <button type="button" onClick={handleAdd} className="btn btn-primary btn-xs">
              Speichern
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setDraft("");
              }}
              className="btn btn-ghost btn-xs"
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSelect(option)}
            className={`filter-chip ${selectedValue === option ? "filter-chip--active" : ""}`}
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
    <div className="segmented-wrap">
    <div className="segmented">
      {(["Workouts", "Exercises"] as TrainingTab[]).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onTabChange(tab)}
          className={`segmented__btn flex-1 ${activeTab === tab ? "segmented__btn--active" : ""}`}
          aria-pressed={activeTab === tab}
        >
          {tab}
        </button>
      ))}
    </div>
    </div>
  );
}