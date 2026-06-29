"use client";

import Link from "next/link";
import EmptyState from "@/components/ui/EmptyState";
import GradientFadeList from "@/components/GradientFadeList";
import { METRIC_LABELS } from "@/lib/workout-metrics";
import { buildReturnToQuery, buildReturnToTraining } from "@/lib/ui-navigation-state";
import type { Exercise, Workout } from "@/lib/training-data";

type CatalogSearchPanelProps = {
  query: string;
  exercises: Exercise[];
  workouts: Workout[];
  availableExercises: Exercise[];
  onEditExercise: (exercise: Exercise) => void;
  onEditWorkout: (workout: Workout) => void;
  onClose: () => void;
};

function isGameWorkout(workout: Workout) {
  return workout.category === "Basketball" && workout.subcategory === "Spiel";
}

function gameContextForWorkout(workout: Workout) {
  return workout.name.toLowerCase().includes("training") ? "game_training" : "game";
}

export default function CatalogSearchPanel({
  query,
  exercises,
  workouts,
  availableExercises,
  onEditExercise,
  onEditWorkout,
  onClose,
}: CatalogSearchPanelProps) {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const hasResults = exercises.length > 0 || workouts.length > 0;

  return (
    <section className="catalog-search-panel ui-card" aria-label="Suchergebnisse">
      <div className="catalog-search-panel__header">
        <div>
          <p className="section-eyebrow">Suche</p>
          <h2 className="ui-card__title">Ergebnisse für „{trimmed}"</h2>
        </div>
        <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>
          Schließen
        </button>
      </div>

      {!hasResults ? (
        <EmptyState title="Keine Treffer" />
      ) : (
        <div className="catalog-search-panel__sections">
          <div>
            <h3 className="catalog-search-panel__section-title">Exercises</h3>
            {exercises.length === 0 ? (
              <p className="text-sm text-muted">Keine Exercises gefunden.</p>
            ) : (
              <GradientFadeList
                items={exercises}
                listClassName="catalog-search-panel__list space-y-2"
                getKey={(exercise) => exercise.id}
                renderItem={(exercise) => (
                  <article className="list-card">
                    <p className="list-card__title">{exercise.name}</p>
                    <p className="list-card__meta">
                      {exercise.category} · {exercise.subcategory} ·{" "}
                      {exercise.metricKeys.map((metric) => METRIC_LABELS[metric]).join(", ")}
                    </p>
                    {exercise.notes ? <p className="list-card__meta">{exercise.notes}</p> : null}
                    <div className="list-card__actions">
                      <Link
                        href={`/exercises/${exercise.id}?returnTo=${buildReturnToQuery(buildReturnToTraining("Exercises"))}`}
                        className="btn btn-primary btn-xs"
                      >
                        Exercise starten
                      </Link>
                      <button type="button" onClick={() => onEditExercise(exercise)} className="btn btn-outline btn-xs">
                        Bearbeiten
                      </button>
                    </div>
                  </article>
                )}
              />
            )}
          </div>

          <div>
            <h3 className="catalog-search-panel__section-title">Workouts</h3>
            {workouts.length === 0 ? (
              <p className="text-sm text-muted">Keine Workouts gefunden.</p>
            ) : (
              <GradientFadeList
                items={workouts}
                listClassName="catalog-search-panel__list space-y-2"
                getKey={(workout) => workout.id}
                renderItem={(workout) => (
                  <article className="list-card">
                    <p className="list-card__title">{workout.name}</p>
                    <p className="list-card__meta">
                      {workout.category} · {workout.subcategory}
                    </p>
                    {workout.notes ? <p className="list-card__meta">{workout.notes}</p> : null}
                    <div className="list-card__actions">
                      <Link
                        href={
                          isGameWorkout(workout)
                            ? `/game-track?context=${gameContextForWorkout(workout)}`
                            : `/workouts?workoutId=${encodeURIComponent(workout.id)}&returnTo=${buildReturnToQuery(buildReturnToTraining("Workouts"))}`
                        }
                        className="btn btn-primary btn-xs"
                      >
                        {isGameWorkout(workout) ? "Spiel tracken" : "Workout starten"}
                      </Link>
                      <button type="button" onClick={() => onEditWorkout(workout)} className="btn btn-outline btn-xs">
                        Bearbeiten
                      </button>
                    </div>
                  </article>
                )}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
