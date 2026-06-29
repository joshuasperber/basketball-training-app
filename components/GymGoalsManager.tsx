"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GradientFadeList from "@/components/GradientFadeList";
import { pushProgressToCloud } from "@/lib/progress-sync";
import { loadExercises } from "@/lib/training-storage";
import {
  createGymGoalFromExercise,
  deleteGymGoal,
  formatGymGoalSummary,
  loadTrainingGoalsBundle,
  pauseGymGoal,
  seedGymGoalsFromCatalog,
  setGymGoalUserNotes,
  setMesocyclePhase,
  toggleExerciseInjuryPause,
  updateGymGoalHistoryNote,
  upsertGymGoal,
  type GymProgressGoal,
  type MesocyclePhase,
  type TrainingGoalsBundle,
} from "@/lib/training-goals";
import { inferProgressionModality, progressionModalityHintDE } from "@/lib/weight-increments";

async function syncCloud() {
  await pushProgressToCloud();
}

export default function GymGoalsManager() {
  const [bundle, setBundle] = useState<TrainingGoalsBundle | null>(null);
  const exercises = useMemo(() => loadExercises().filter((exercise) => exercise.category === "Gym"), []);

  const refresh = useCallback(() => setBundle(loadTrainingGoalsBundle()), []);

  useEffect(() => {
    const timer = window.setTimeout(() => refresh(), 0);
    const onUpdate = () => refresh();
    window.addEventListener("bt:training-goals-updated", onUpdate);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("bt:training-goals-updated", onUpdate);
    };
  }, [refresh]);

  const [exerciseId, setExerciseId] = useState("");
  const [weightKg, setWeightKg] = useState("80");
  const [baselineReps, setBaselineReps] = useState("3");
  const [targetReps, setTargetReps] = useState("5");
  const [workingSets, setWorkingSets] = useState("3");
  const [phaseWeeks, setPhaseWeeks] = useState("2");
  const [sessionsPerWeek, setSessionsPerWeek] = useState("2");

  const selectedExercise = exercises.find((exercise) => exercise.id === exerciseId);

  if (!bundle) return null;

  const gymGoals = bundle.gymGoals;

  const handleMesocycle = async (phase: MesocyclePhase) => {
    setMesocyclePhase(phase);
    refresh();
    await syncCloud();
  };

  const handleCreateGoal = async () => {
    const exercise = exercises.find((exercise) => exercise.id === exerciseId);
    if (!exercise) return;
    const w = Number(weightKg);
    const br = Number(baselineReps);
    const tr = Number(targetReps);
    const ws = Number(workingSets);
    const pw = Number(phaseWeeks);
    const spw = Number(sessionsPerWeek);
    if (!Number.isFinite(w) || w <= 0) return;
    if (!Number.isFinite(br) || !Number.isFinite(tr) || tr < br) return;
    const goal = createGymGoalFromExercise({
      exercise,
      weightKg: w,
      baselineReps: br,
      targetReps: tr,
      workingSets: Number.isFinite(ws) ? ws : 3,
      phaseWeeks: Number.isFinite(pw) ? pw : 2,
      sessionsPerWeek: Number.isFinite(spw) ? spw : 2,
    });
    upsertGymGoal(goal);
    refresh();
    await syncCloud();
  };

  const handleSeed = async () => {
    seedGymGoalsFromCatalog(loadExercises());
    refresh();
    await syncCloud();
  };

  const renderGoalRow = (goal: GymProgressGoal) => {
    const required = Math.max(1, goal.phaseWeeks * goal.sessionsPerWeek);
    const pct = Math.min(100, Math.round((goal.successfulSessionsInPhase / required) * 100));
    const pausedInjury = bundle.injuryExerciseIds.includes(goal.exerciseId);
    return (
      <div className="list-card text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="list-card__title">{goal.exerciseNameSnapshot}</p>
            <p className="list-card__meta text-brand">{formatGymGoalSummary(goal)}</p>
            <p className="list-card__meta">{progressionModalityHintDE(goal.modality)}</p>
            {pausedInjury ? <p className="hint-warning mt-1">Übung pausiert (Verletzung)</p> : null}
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className="btn btn-outline btn-xs"
              onClick={async () => {
                pauseGymGoal(goal.id, goal.status === "active");
                refresh();
                await syncCloud();
              }}
            >
              {goal.status === "active" ? "Pausieren" : "Aktivieren"}
            </button>
            <button
              type="button"
              className="btn btn-danger-outline btn-xs"
              onClick={async () => {
                deleteGymGoal(goal.id);
                refresh();
                await syncCloud();
              }}
            >
              Löschen
            </button>
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-muted)]">
          <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <label className="input-label mt-3 block">
          Deine Notizen
          <textarea
            key={`${goal.id}-un-${goal.userNotes ?? ""}`}
            defaultValue={goal.userNotes ?? ""}
            rows={2}
            className="textarea mt-1"
            placeholder="z. B. RPE, Technik-Fokus, nächste Session …"
            onBlur={(event) => {
              const next = event.target.value.trim();
              if (next === (goal.userNotes ?? "").trim()) return;
              setGymGoalUserNotes(goal.id, next);
              refresh();
              void syncCloud();
            }}
          />
        </label>
        {goal.history.length ? (
          <div className="mt-3 border-t border-[var(--surface-border)] pt-2">
            <p className="section-eyebrow">Verlauf (bearbeitbar)</p>
            <GradientFadeList
              className="mt-1"
              items={goal.history}
              listClassName="space-y-2"
              getKey={(row, index) => `${goal.id}-h-${index}-${row.dateISO}`}
              renderItem={(row, index) => (
                <div className="text-xs text-muted">
                  <span className="text-[10px] text-faint">{new Date(row.dateISO).toLocaleString("de-DE")}</span>
                  <textarea
                    defaultValue={row.note}
                    rows={2}
                    className="textarea mt-0.5 text-sm"
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next === row.note.trim()) return;
                      updateGymGoalHistoryNote(goal.id, index, next);
                      refresh();
                      void syncCloud();
                    }}
                  />
                </div>
              )}
            />
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section id="gym-goals" className="mt-6 app-card--accent-violet">
      <div className="flex flex-col gap-1">
        <h2 className="section-title">Gym: adaptive Ziele</h2>
        <p className="text-xs text-muted">
          Nur Kraftübungen mit Gewicht-Basis. Nach starken Sessions steigt die Last mit realistischen Schritten (LH +5 kg,
          Kurzhantel +5 kg Gesamtlast ≈ je Hand +2,5 kg).
        </p>
      </div>

      <div className="segmented-wrap mt-4">
      <div className="segmented">
        {(["base", "build", "peak", "deload"] as MesocyclePhase[]).map((phase) => (
          <button
            key={phase}
            type="button"
            onClick={() => void handleMesocycle(phase)}
            className="segmented__btn"
            aria-pressed={bundle.mesocyclePhase === phase}
          >
            {phase === "base"
              ? "Basis"
              : phase === "build"
                ? "Aufbau"
                : phase === "peak"
                  ? "Peak"
                  : "Deload"}
          </button>
        ))}
      </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        Deload: nach geschaffter Phase reduziert die App Last oder Volumen statt zu steigern.
      </p>

      <div className="mt-4 app-card--flat">
        <p className="section-eyebrow">Verletzung / Pause</p>
        <p className="mt-1 text-xs text-muted">Übung ankreuzen — keine Progression wird für sie gezählt.</p>
        <GradientFadeList
          className="mt-2"
          items={exercises}
          listClassName="space-y-1 text-xs"
          getKey={(exercise) => exercise.id}
          renderItem={(exercise) => (
            <label className="flex cursor-pointer items-center gap-2 text-strong">
              <input
                type="checkbox"
                checked={bundle.injuryExerciseIds.includes(exercise.id)}
                onChange={(event) => {
                  toggleExerciseInjuryPause(exercise.id, event.target.checked);
                  refresh();
                  void syncCloud();
                }}
              />
              <span>{exercise.name}</span>
            </label>
          )}
        />
      </div>

      <div className="mt-4 app-card--flat">
        <p className="section-eyebrow">Neues Ziel — Messzahlen (Gym)</p>
        <p className="mt-1 text-xs text-muted">Arbeit kg, Wiederholungen, Sätze und Phasen — nur für Gewichtsübungen relevant.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="input-label">Übung</span>
            <select value={exerciseId} onChange={(event) => setExerciseId(event.target.value)} className="select mt-1">
              <option value="">— wählen —</option>
              {exercises.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </option>
              ))}
            </select>
          </label>
          {selectedExercise ? (
            <p className="text-xs text-muted md:self-end">
              Modalität: <strong className="text-strong">{inferProgressionModality(selectedExercise)}</strong>
            </p>
          ) : null}
          <label className="block">
            <span className="input-label">Arbeit kg</span>
            <input value={weightKg} onChange={(event) => setWeightKg(event.target.value)} inputMode="decimal" className="input mt-1" />
          </label>
          <label className="block">
            <span className="input-label">Start-Wdh.</span>
            <input value={baselineReps} onChange={(event) => setBaselineReps(event.target.value)} inputMode="numeric" className="input mt-1" />
          </label>
          <label className="block">
            <span className="input-label">Ziel-Wdh.</span>
            <input value={targetReps} onChange={(event) => setTargetReps(event.target.value)} inputMode="numeric" className="input mt-1" />
          </label>
          <label className="block">
            <span className="input-label">Arbeitssätze</span>
            <input value={workingSets} onChange={(event) => setWorkingSets(event.target.value)} inputMode="numeric" className="input mt-1" />
          </label>
          <label className="block">
            <span className="input-label">Phasen (Wochen)</span>
            <input value={phaseWeeks} onChange={(event) => setPhaseWeeks(event.target.value)} inputMode="numeric" className="input mt-1" />
          </label>
          <label className="block">
            <span className="input-label">Sessions / Woche (Ziel)</span>
            <input value={sessionsPerWeek} onChange={(event) => setSessionsPerWeek(event.target.value)} inputMode="numeric" className="input mt-1" />
          </label>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void handleCreateGoal()} className="btn btn-violet btn-sm" disabled={!exerciseId}>
          Ziel anlegen
        </button>
        <button type="button" onClick={() => void handleSeed()} className="btn btn-outline btn-sm">
          Standard-Ziele aus Katalog
        </button>
      </div>

      <div className="mt-6 border-t border-[var(--surface-border)] pt-4">
        <p className="section-eyebrow">Aktive &amp; pausierte Ziele</p>
        <GradientFadeList
          className="mt-2"
          items={gymGoals}
          listClassName="space-y-2"
          getKey={(goal) => goal.id}
          renderItem={(goal) => renderGoalRow(goal)}
        />
        {gymGoals.length === 0 ? <p className="mt-2 text-sm text-muted">Noch keine Ziele — anlegen oder aus Katalog laden.</p> : null}
      </div>
    </section>
  );
}
