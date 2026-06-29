"use client";

import Link from "next/link";
import GradientFadeList from "@/components/GradientFadeList";
import type { Exercise, Workout } from "@/lib/training-data";
import { DEFAULT_MANUAL_TITLE, type BasketballMode } from "@/lib/workout-page-utils";

type ManualWorkoutEditorProps = {
  isEditing: boolean;
  backHref: string;
  manualCategory: "Basketball" | "Gym" | "Home" | "Regeneration";
  manualBasketballMode: BasketballMode;
  manualSubcategory: string;
  manualTemplateWorkoutId: string;
  manualTitle: string;
  manualNotes: string;
  manualSearch: string;
  selectedManualExerciseIds: string[];
  exerciseMoveFlash: { id: string; direction: "up" | "down" } | null;
  manualSubcategoryOptions: string[];
  manualTemplateOptions: Workout[];
  manualExercisePool: Exercise[];
  trainingExercises: Exercise[];
  previewAutoTitle: string;
  onCategoryChange: (category: "Basketball" | "Gym" | "Home" | "Regeneration") => void;
  onBasketballModeChange: (mode: BasketballMode) => void;
  onSubcategoryChange: (subcategory: string) => void;
  onTemplateChange: (workoutId: string) => void;
  onTitleChange: (title: string) => void;
  onNotesChange: (notes: string) => void;
  onSearchChange: (search: string) => void;
  onToggleExercise: (exerciseId: string) => void;
  onRemoveExercise: (exerciseId: string) => void;
  onMoveExercise: (exerciseId: string, direction: "up" | "down") => void;
  onSave: (startImmediately: boolean) => void;
};

export default function ManualWorkoutEditor({
  isEditing,
  backHref,
  manualCategory,
  manualBasketballMode,
  manualSubcategory,
  manualTemplateWorkoutId,
  manualTitle,
  manualNotes,
  manualSearch,
  selectedManualExerciseIds,
  exerciseMoveFlash,
  manualSubcategoryOptions,
  manualTemplateOptions,
  manualExercisePool,
  trainingExercises,
  previewAutoTitle,
  onCategoryChange,
  onBasketballModeChange,
  onSubcategoryChange,
  onTemplateChange,
  onTitleChange,
  onNotesChange,
  onSearchChange,
  onToggleExercise,
  onRemoveExercise,
  onMoveExercise,
  onSave,
}: ManualWorkoutEditorProps) {
  const showStructuredBasketball = manualCategory === "Basketball" && manualBasketballMode !== "basketball_training";
  const showExercisePicker = !showStructuredBasketball;

  return (
    <section className="mt-4 app-card">
      <p className="section-eyebrow">{isEditing ? "Workout bearbeiten" : "Workout planen"}</p>
      <h2 className="section-title mt-1">{isEditing ? "Plan anpassen" : "Manuelles Workout"}</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select
          value={manualCategory}
          onChange={(event) => onCategoryChange(event.target.value as ManualWorkoutEditorProps["manualCategory"])}
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
            onChange={(event) => onBasketballModeChange(event.target.value as BasketballMode)}
            className="input w-full"
          >
            <option value="basketball_training">Basketball-Training</option>
            <option value="game_training">Spieltraining (30 Min Warmup)</option>
            <option value="game">Spiel (60 Min Warmup)</option>
          </select>
        ) : null}
        {showExercisePicker ? (
          <select value={manualSubcategory} onChange={(event) => onSubcategoryChange(event.target.value)} className="input w-full">
            <option value="">Kein fester Schwerpunkt</option>
            {manualSubcategoryOptions.map((subcategory) => (
              <option key={subcategory} value={subcategory}>
                {subcategory}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {showExercisePicker ? (
        <select
          value={manualTemplateWorkoutId}
          onChange={(event) => onTemplateChange(event.target.value)}
          className="input mt-2 w-full"
        >
          <option value="">Workout-Template optional wählen</option>
          {manualTemplateOptions.map((workout) => (
            <option key={workout.id} value={workout.id}>
              {workout.name}
            </option>
          ))}
        </select>
      ) : null}
      <input
        value={manualTitle}
        onChange={(event) => onTitleChange(event.target.value)}
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
        onChange={(event) => onNotesChange(event.target.value)}
        className="input mt-2 w-full"
        placeholder="Notizen"
        rows={2}
      />
      {showExercisePicker ? (
        <>
          <input
            value={manualSearch}
            onChange={(event) => onSearchChange(event.target.value)}
            className="input mt-3 w-full"
            placeholder="Exercise suchen..."
          />
          <GradientFadeList
            className="mt-3 app-card--flat"
            items={manualExercisePool}
            listClassName="space-y-2"
            getKey={(exercise) => exercise.id}
            renderItem={(exercise) => (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedManualExerciseIds.includes(exercise.id)}
                  onChange={() => onToggleExercise(exercise.id)}
                />
                <span>
                  {exercise.name} <span className="text-faint">({exercise.subcategory})</span>
                </span>
              </label>
            )}
          />
          {selectedManualExerciseIds.length > 0 ? (
            <div className="mt-2 app-card--flat">
              <p className="text-xs text-muted">Reihenfolge festlegen</p>
              <GradientFadeList
                items={selectedManualExerciseIds}
                listClassName="space-y-2"
                getKey={(exerciseId) => `order-${exerciseId}`}
                renderItem={(exerciseId, index) => {
                  const exercise = trainingExercises.find((entry) => entry.id === exerciseId);
                  if (!exercise) return null;
                  const isFirst = index === 0;
                  const isLast = index === selectedManualExerciseIds.length - 1;
                  return (
                    <div
                      className={`exercise-order-row flex items-center justify-between gap-2 text-sm ${
                        exerciseMoveFlash?.id === exerciseId
                          ? exerciseMoveFlash.direction === "up"
                            ? "exercise-order-row--shift-up"
                            : "exercise-order-row--shift-down"
                          : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {index + 1}. {exercise.name}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        {isFirst ? null : (
                          <button type="button" onClick={() => onMoveExercise(exerciseId, "up")} className="btn btn-ghost btn-xs">
                            ↑
                          </button>
                        )}
                        {isLast ? null : (
                          <button type="button" onClick={() => onMoveExercise(exerciseId, "down")} className="btn btn-ghost btn-xs">
                            ↓
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemoveExercise(exerciseId)}
                          className="rounded border border-rose-500/50 px-2 py-1 text-xs text-rose-200"
                          aria-label={`${exercise.name} entfernen`}
                          title="Übung löschen"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  );
                }}
                showMoreLabel={(hiddenCount) => `Mehr anzeigen (${hiddenCount})`}
              />
            </div>
          ) : null}
        </>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => onSave(false)} className="btn btn-ghost btn-sm flex-1">
          {isEditing ? "Änderungen speichern" : "Für diesen Tag speichern"}
        </button>
        <button type="button" onClick={() => onSave(true)} className="btn btn-primary btn-sm flex-1">
          Speichern & starten
        </button>
        <Link href={backHref} className="btn btn-ghost btn-sm flex-1 text-center">
          Abbrechen
        </Link>
      </div>
    </section>
  );
}
