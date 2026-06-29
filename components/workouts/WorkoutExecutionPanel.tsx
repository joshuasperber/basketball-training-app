"use client";

import GradientFadeList from "@/components/GradientFadeList";
import type { Exercise, MetricKey } from "@/lib/training-data";
import { formatGymGoalSummary } from "@/lib/training-goals";
import type { SetLog, WorkoutExercise, WorkoutPlan, WorkoutProgress } from "@/lib/workout";

type GymGoalHint =
  | { kind: "injury" }
  | { kind: "goal"; goal: Parameters<typeof formatGymGoalSummary>[0] }
  | null;

type WorkoutExecutionPanelProps = {
  workout: WorkoutPlan;
  progress: WorkoutProgress;
  safeExerciseIndex: number;
  safeSetIndex: number;
  currentExercise: WorkoutExercise | undefined;
  currentExerciseMeta: Exercise | null | undefined;
  currentLog: SetLog;
  currentLogKey: string;
  currentMetricOptions: MetricKey[];
  currentTargetText: string;
  gymGoalHint: GymGoalHint;
  isGymWorkout: boolean;
  isRestDay: boolean;
  tracksRepsAndMakes: boolean;
  shootingRepsTotal: number;
  setValidationError: string | null;
  workoutFullyTracked: boolean;
  canEndWorkout: boolean;
  workoutPrimaryLabel: string;
  parseNonNegative: (value?: string) => number;
  getExerciseStatus: (exerciseIndex: number) => "not_started" | "in_progress" | "completed";
  onJumpToExercise: (exerciseIndex: number) => void;
  onJumpToSet: (setIndex: number) => void;
  onUpdateLog: (
    field: "weight" | "reps" | "tries" | "makes" | "misses" | "time" | "distance" | "distanceUnit" | "points" | "note",
    value: string,
  ) => void;
  onPatchLog: (patch: Partial<SetLog>) => void;
  onSetValidationError: (message: string) => void;
  onPersistProgress: (next: WorkoutProgress) => void;
  onWorkoutPrimaryAction: () => void;
  onEndWorkout: () => void;
  onFinishSet: () => void;
  onAddSet: () => void;
};

export default function WorkoutExecutionPanel({
  workout,
  progress,
  safeExerciseIndex,
  safeSetIndex,
  currentExercise,
  currentExerciseMeta,
  currentLog,
  currentLogKey,
  currentMetricOptions,
  currentTargetText,
  gymGoalHint,
  isGymWorkout,
  isRestDay,
  tracksRepsAndMakes,
  shootingRepsTotal,
  setValidationError,
  workoutFullyTracked,
  canEndWorkout,
  workoutPrimaryLabel,
  parseNonNegative,
  getExerciseStatus,
  onJumpToExercise,
  onJumpToSet,
  onUpdateLog,
  onPatchLog,
  onSetValidationError,
  onPersistProgress,
  onWorkoutPrimaryAction,
  onEndWorkout,
  onFinishSet,
  onAddSet,
}: WorkoutExecutionPanelProps) {
  return (
    <section className="mt-4 ui-card">
      <div className="mb-3">
        <p className="text-xs uppercase tracking-wide text-muted">Workout-Fortschritt</p>
        <GradientFadeList
          items={workout.exercises}
          listClassName="grid grid-cols-2 gap-2 sm:grid-cols-4"
          getKey={(exercise, index) => `${workout.id}-progress-${exercise.name}-${index}`}
          renderItem={(exercise, index) => {
            const status = getExerciseStatus(index);
            const isActive = index === safeExerciseIndex;
            const badgeClass =
              status === "completed"
                ? "progress-exercise-btn progress-exercise-btn--completed"
                : status === "in_progress"
                  ? "progress-exercise-btn progress-exercise-btn--in-progress"
                  : "progress-exercise-btn";

            return (
              <button
                type="button"
                onClick={() => onJumpToExercise(index)}
                className={`${badgeClass} ${isActive ? "progress-exercise-btn--active" : ""}`}
              >
                <p className="font-semibold">{exercise.name}</p>
                <p>
                  {status === "completed"
                    ? "Abgeschlossen"
                    : status === "in_progress"
                      ? "In Arbeit"
                      : "Nicht gestartet"}
                </p>
              </button>
            );
          }}
        />
      </div>

      {currentExercise ? (
        <article className="list-card">
          <p className="text-xs uppercase tracking-wide text-muted">
            Exercise {safeExerciseIndex + 1}/{workout.exercises.length}
          </p>
          <h3 className="mt-1 text-xl font-semibold">{currentExercise.name}</h3>
          {currentExerciseMeta?.videoUrl ? (
            currentExerciseMeta.videoUrl.startsWith("data:video") ? (
              <video
                controls
                className="mt-2 max-h-48 w-full max-w-md rounded-lg border border-[var(--surface-border)]"
                src={currentExerciseMeta.videoUrl}
              />
            ) : (
              <a href={currentExerciseMeta.videoUrl} target="_blank" rel="noreferrer" className="video-link-chip mt-2">
                ▶ Drill-Video ansehen
              </a>
            )
          ) : null}
          {gymGoalHint?.kind === "injury" ? (
            <p className="hint-warning mt-2">
              Übung für automatische Progression pausiert — weiter trainieren, aber keine Ziel-Zählung.
            </p>
          ) : null}
          {gymGoalHint?.kind === "goal" ? (
            <p className="hint-violet mt-2">Aktives Ziel: {formatGymGoalSummary(gymGoalHint.goal)}</p>
          ) : null}
          {currentExerciseMeta?.notes ? <p className="mt-1 text-xs text-faint">{currentExerciseMeta.notes}</p> : null}
          <p className="text-sm text-muted">
            Satz {safeSetIndex + 1}/{currentExercise.sets.length}
          </p>
          {currentExercise.sets.length > 1 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {currentExercise.sets.map((_, setIdx) => (
                <button
                  key={`${safeExerciseIndex}-set-tab-${setIdx}`}
                  type="button"
                  onClick={() => onJumpToSet(setIdx)}
                  className={`set-tab ${safeSetIndex === setIdx ? "set-tab--active" : ""}`}
                >
                  Satz {setIdx + 1}
                </button>
              ))}
            </div>
          ) : null}

          <div className="target-banner mt-4">
            <span className="font-semibold">Ziel:</span> {currentTargetText}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {currentMetricOptions.includes("weight") ? (
              <label className="text-sm text-muted">
                Gewicht (kg)
                <input
                  value={currentLog.weight}
                  onChange={(event) => onUpdateLog("weight", event.target.value)}
                  className="input mt-1"
                  inputMode="decimal"
                />
              </label>
            ) : null}

            {tracksRepsAndMakes ? (
              <>
                <label className="text-sm text-muted">
                  Reps
                  <input
                    value={currentLog.reps || currentLog.tries || ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      const reps = parseNonNegative(value);
                      const makes = parseNonNegative(currentLog.makes);
                      const misses = reps > 0 && makes > 0 ? String(Math.max(0, reps - makes)) : currentLog.misses;
                      onPatchLog({ reps: value, tries: "", misses });
                    }}
                    className="input mt-1"
                    inputMode="numeric"
                    placeholder="z. B. 40"
                  />
                </label>
                <label className="text-sm text-muted">
                  Makes
                  <input
                    value={currentLog.makes ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      const total = shootingRepsTotal;
                      const makes = parseNonNegative(value);
                      const misses = total > 0 ? String(Math.max(0, total - makes)) : currentLog.misses;
                      onPatchLog({ makes: value, misses });
                    }}
                    className="input mt-1"
                    inputMode="numeric"
                    placeholder="z. B. 36"
                  />
                </label>
                <label className="text-sm text-muted">
                  Misses
                  <div className="mt-1 flex gap-2">
                    <input
                      value={currentLog.misses ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        const reps = shootingRepsTotal;
                        const misses = parseNonNegative(value);
                        if (reps > 0 && misses > reps) {
                          onSetValidationError("Misses dürfen nicht größer als Reps sein.");
                        }
                        onPatchLog({
                          misses: value,
                          makes: reps > 0 ? String(Math.max(0, reps - misses)) : currentLog.makes,
                        });
                      }}
                      className="input"
                      inputMode="numeric"
                      placeholder={`Auto: ${Math.max(0, shootingRepsTotal - parseNonNegative(currentLog.makes))}`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const total = shootingRepsTotal;
                        const makes = parseNonNegative(currentLog.makes);
                        const auto = Math.max(0, total - makes);
                        onPatchLog({ misses: String(auto), makes: String(Math.max(0, total - auto)) });
                      }}
                      className="btn btn-outline btn-xs shrink-0"
                      aria-label="Misses automatisch aus Reps minus Makes setzen"
                    >
                      = Reps − Makes
                    </button>
                  </div>
                </label>
              </>
            ) : currentMetricOptions.includes("reps") ? (
              <label className="text-sm text-muted">
                Reps
                <input
                  value={currentLog.reps}
                  onChange={(event) => onUpdateLog("reps", event.target.value)}
                  className="input mt-1"
                  inputMode="numeric"
                />
              </label>
            ) : null}

            {currentMetricOptions.includes("time") ? (
              <label className="text-sm text-muted">
                Zeit ({currentExerciseMeta?.timeUnit === "seconds" ? "Sek." : "Min."})
                <input
                  value={currentLog.time ?? ""}
                  onChange={(event) => onUpdateLog("time", event.target.value)}
                  className="input mt-1"
                  inputMode="decimal"
                />
              </label>
            ) : null}

            {currentMetricOptions.includes("distance") ? (
              <label className="text-sm text-muted">
                Distanz
                <div className="mt-1 flex gap-2">
                  <input
                    value={currentLog.distance ?? ""}
                    onChange={(event) => onUpdateLog("distance", event.target.value)}
                    className="input"
                    inputMode="decimal"
                  />
                  <select
                    value={currentLog.distanceUnit ?? "m"}
                    onChange={(event) => onUpdateLog("distanceUnit", event.target.value)}
                    className="input"
                  >
                    <option value="m">m</option>
                    <option value="km">km</option>
                  </select>
                </div>
              </label>
            ) : null}

            {currentMetricOptions.includes("points") ? (
              <label className="text-sm text-muted">
                Punkte (optional, zählt nicht als Reps)
                <input
                  value={currentLog.points ?? ""}
                  onChange={(event) => onUpdateLog("points", event.target.value)}
                  className="input mt-1"
                  inputMode="numeric"
                />
              </label>
            ) : null}
          </div>

          {!isRestDay ? (
            <div className="mt-3">
              <label className="text-sm text-muted">Satz-Notiz (optional)</label>
              <input
                type="text"
                value={currentLog.note ?? ""}
                onChange={(event) => onUpdateLog("note", event.target.value)}
                className="textarea mt-1"
                placeholder="z. B. Technik, Ballgefühl …"
              />
            </div>
          ) : null}

          {!isRestDay ? (
            <div className="mt-3 app-card--flat">
              <div className="flex items-baseline justify-between">
                <p className="text-xs uppercase tracking-wide text-muted">Anstrengung (RPE)</p>
                <p className="text-sm font-semibold text-strong tabular-nums">
                  {currentLog.rpe ? `${currentLog.rpe}/10` : "—"}
                </p>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={currentLog.rpe ? Number(currentLog.rpe) : 0}
                onChange={(event) =>
                  onPersistProgress({
                    ...progress,
                    logs: {
                      ...progress.logs,
                      [currentLogKey]: {
                        ...currentLog,
                        rpe: event.target.value === "0" ? "" : event.target.value,
                      },
                    },
                  })
                }
                className="mt-2 w-full accent-cyan-400"
              />
              <div className="mt-1 flex justify-between text-[10px] text-faint">
                <span>locker</span>
                <span>moderat</span>
                <span>schwer</span>
                <span>maximal</span>
              </div>
            </div>
          ) : null}

          <div className="mt-3 text-sm text-muted">
            <p>Ziel: {currentTargetText}</p>
            <p className="mt-1">
              Aktuell:{" "}
              {isGymWorkout
                ? `${currentLog.weight || 0} kg × ${currentLog.reps || 0}`
                : tracksRepsAndMakes
                  ? `${shootingRepsTotal} Reps • ${currentLog.makes || 0} Makes • ${parseNonNegative(currentLog.misses) || Math.max(0, shootingRepsTotal - parseNonNegative(currentLog.makes))} Misses`
                  : `${currentLog.reps || 0} Reps${currentLog.time ? ` • ${currentLog.time} ${currentExerciseMeta?.timeUnit === "seconds" ? "Sek." : "Min."}` : ""}${currentLog.distance ? ` • ${currentLog.distance} ${currentLog.distanceUnit ?? "m"}` : ""}`}
            </p>
          </div>
          {setValidationError ? <p className="mt-2 text-sm text-rose-300">{setValidationError}</p> : null}

          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onWorkoutPrimaryAction}
                disabled={progress.status === "completed" && workoutFullyTracked}
                className="btn btn-primary btn-sm disabled:opacity-50"
              >
                {workoutPrimaryLabel}
              </button>
              {canEndWorkout ? (
                <button type="button" onClick={onEndWorkout} className="btn btn-outline btn-sm">
                  Workout beenden
                </button>
              ) : null}
              <button type="button" onClick={onFinishSet} className="btn btn-emerald btn-sm">
                Satz abschließen
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onJumpToSet(Math.max(0, safeSetIndex - 1))}
                disabled={safeSetIndex <= 0}
                className="btn btn-outline btn-xs disabled:opacity-40"
              >
                ← Satz zurück
              </button>
              <button type="button" onClick={onAddSet} className="btn btn-cyan btn-sm">
                Satz hinzufügen
              </button>
              <button
                type="button"
                onClick={() => onJumpToSet(Math.min(currentExercise.sets.length - 1, safeSetIndex + 1))}
                disabled={safeSetIndex >= currentExercise.sets.length - 1}
                className="btn btn-outline btn-xs disabled:opacity-40"
              >
                Satz vor →
              </button>
            </div>
          </div>
        </article>
      ) : (
        <p className="text-sm text-faint">
          {isRestDay ? "Keine Zeit aktiv – heute ist kein Training geplant." : "Keine Exercise im Workout gefunden."}
        </p>
      )}
    </section>
  );
}
