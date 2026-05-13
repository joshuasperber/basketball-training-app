"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
      <li key={goal.id} className="rounded-xl border border-zinc-800 bg-black/40 px-3 py-2 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium text-zinc-100">{goal.exerciseNameSnapshot}</p>
            <p className="text-xs text-violet-300">{formatGymGoalSummary(goal)}</p>
            <p className="text-xs text-zinc-500">{progressionModalityHintDE(goal.modality)}</p>
            {pausedInjury ? <p className="text-xs text-amber-400">Übung pausiert (Verletzung)</p> : null}
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className="rounded border border-zinc-600 px-2 py-0.5 text-xs"
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
              className="rounded border border-rose-600 px-2 py-0.5 text-xs text-rose-300"
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
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <label className="mt-3 block text-xs font-medium text-zinc-400">
          Deine Notizen
          <textarea
            key={`${goal.id}-un-${goal.userNotes ?? ""}`}
            defaultValue={goal.userNotes ?? ""}
            rows={2}
            className="mt-1 w-full resize-y rounded-lg border border-zinc-700 bg-black/50 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600"
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
          <div className="mt-3 border-t border-zinc-800/80 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Verlauf (bearbeitbar)</p>
            <ul className="mt-1 space-y-2">
              {goal.history.slice(0, 12).map((row, index) => (
                <li key={`${goal.id}-h-${index}-${row.dateISO}`} className="text-xs text-zinc-500">
                  <span className="text-[10px] text-zinc-600">{new Date(row.dateISO).toLocaleString("de-DE")}</span>
                  <textarea
                    defaultValue={row.note}
                    rows={2}
                    className="mt-0.5 w-full resize-y rounded border border-zinc-800 bg-black/40 px-2 py-1 text-zinc-300"
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next === row.note.trim()) return;
                      updateGymGoalHistoryNote(goal.id, index, next);
                      refresh();
                      void syncCloud();
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <section
      id="gym-goals"
      className="mt-6 overflow-hidden rounded-2xl border border-violet-600/40 bg-gradient-to-br from-violet-950/50 via-zinc-950 to-zinc-950 p-5 shadow-lg shadow-violet-950/30"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight text-violet-100">Gym: adaptive Ziele</h2>
        <p className="text-xs text-violet-300/80">
          Nur Kraftübungen mit Gewicht-Basis. Nach starken Sessions steigt die Last mit realistischen Schritten (LH +5 kg,
          Kurzhantel +5 kg Gesamtlast ≈ je Hand +2,5 kg).
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(["base", "build", "peak", "deload"] as MesocyclePhase[]).map((phase) => (
          <button
            key={phase}
            type="button"
            onClick={() => void handleMesocycle(phase)}
            className={`rounded-lg px-3 py-1 text-xs font-semibold ${
              bundle.mesocyclePhase === phase ? "bg-violet-600 text-white" : "border border-zinc-600 text-zinc-300"
            }`}
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
      <p className="mt-2 text-xs text-zinc-500">
        Deload: nach geschaffter Phase reduziert die App Last oder Volumen statt zu steigern.
      </p>

      <div className="mt-4 rounded-xl border border-zinc-800/90 bg-zinc-900/50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Verletzung / Pause</p>
        <p className="mt-1 text-xs text-zinc-400">Übung ankreuzen — keine Progression wird für sie gezählt.</p>
        <div className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs">
          {exercises.slice(0, 24).map((exercise) => (
            <label key={exercise.id} className="flex cursor-pointer items-center gap-2">
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
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-800/90 bg-zinc-900/40 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Neues Ziel — Messzahlen (Gym)</p>
        <p className="mt-1 text-[11px] text-zinc-500">Arbeit kg, Wiederholungen, Sätze und Phasen — nur für Gewichtsübungen relevant.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block text-xs">
          Übung
          <select
            value={exerciseId}
            onChange={(event) => setExerciseId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-2 py-2 text-sm"
          >
            <option value="">— wählen —</option>
            {exercises.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.name}
              </option>
            ))}
          </select>
        </label>
        {selectedExercise ? (
          <p className="text-xs text-zinc-500 md:self-end">
            Modalität: <strong className="text-zinc-300">{inferProgressionModality(selectedExercise)}</strong>
          </p>
        ) : null}
        <label className="block text-xs">
          Arbeit kg
          <input
            value={weightKg}
            onChange={(event) => setWeightKg(event.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-2 py-2 text-sm"
          />
        </label>
        <label className="block text-xs">
          Start-Wdh.
          <input
            value={baselineReps}
            onChange={(event) => setBaselineReps(event.target.value)}
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-2 py-2 text-sm"
          />
        </label>
        <label className="block text-xs">
          Ziel-Wdh.
          <input
            value={targetReps}
            onChange={(event) => setTargetReps(event.target.value)}
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-2 py-2 text-sm"
          />
        </label>
        <label className="block text-xs">
          Arbeitssätze
          <input
            value={workingSets}
            onChange={(event) => setWorkingSets(event.target.value)}
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-2 py-2 text-sm"
          />
        </label>
        <label className="block text-xs">
          Phasen (Wochen)
          <input
            value={phaseWeeks}
            onChange={(event) => setPhaseWeeks(event.target.value)}
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-2 py-2 text-sm"
          />
        </label>
        <label className="block text-xs">
          Sessions / Woche (Ziel)
          <input
            value={sessionsPerWeek}
            onChange={(event) => setSessionsPerWeek(event.target.value)}
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-2 py-2 text-sm"
          />
        </label>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleCreateGoal()}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          disabled={!exerciseId}
        >
          Ziel anlegen
        </button>
        <button type="button" onClick={() => void handleSeed()} className="rounded-lg border border-zinc-600 px-4 py-2 text-sm">
          Standard-Ziele aus Katalog
        </button>
      </div>

      <div className="mt-6 border-t border-violet-800/40 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Aktive &amp; pausierte Ziele</p>
        <ul className="mt-2 space-y-2">{gymGoals.map(renderGoalRow)}</ul>
        {gymGoals.length === 0 ? <p className="mt-2 text-sm text-zinc-500">Noch keine Ziele — anlegen oder aus Katalog laden.</p> : null}
      </div>
    </section>
  );
}
