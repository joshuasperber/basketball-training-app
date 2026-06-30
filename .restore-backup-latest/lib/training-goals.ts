import type { Exercise } from "@/lib/training-data";
import type { WorkoutSessionEntry } from "@/lib/session-storage";
import {
  inferProgressionModality,
  minimumWeightIncrementKg,
  nextWorkingWeightKg,
  progressionModalityHintDE,
  type ProgressionModality,
} from "@/lib/weight-increments";

export const TRAINING_GOALS_STORAGE_KEY = "bt.training-goals-bundle.v1";

export type MesocyclePhase = "base" | "build" | "peak" | "deload";

export type GymProgressGoal = {
  id: string;
  exerciseId: string;
  exerciseNameSnapshot: string;
  modality: ProgressionModality;
  /** Aktuelle Arbeitshöhe */
  weightKg: number;
  /** Ausgangswiederholungen der aktuellen Phase */
  baselineRepsPhase: number;
  /** Ziel-Wiederholungen pro Arbeitssatz */
  targetReps: number;
  workingSets: number;
  phaseWeeks: number;
  sessionsPerWeek: number;
  /** Bereits für diese Phase gezählte Session-IDs */
  countedSessionIds: string[];
  successfulSessionsInPhase: number;
  status: "active" | "completed" | "paused";
  history: { dateISO: string; note: string }[];
  /** Freitext-Notizen (bearbeitbar); unabhängig vom automatischen Verlauf. */
  userNotes?: string;
  createdAtISO: string;
};

export type TrainingGoalsBundle = {
  gymGoals: GymProgressGoal[];
  injuryExerciseIds: string[];
  mesocyclePhase: MesocyclePhase;
  updatedAtISO: string;
};

function canUseStorage() {
  return typeof window !== "undefined";
}

export function getDefaultTrainingGoalsBundle(): TrainingGoalsBundle {
  return {
    gymGoals: [],
    injuryExerciseIds: [],
    mesocyclePhase: "build",
    updatedAtISO: new Date().toISOString(),
  };
}

export function loadTrainingGoalsBundle(): TrainingGoalsBundle {
  if (!canUseStorage()) return getDefaultTrainingGoalsBundle();
  const raw = window.localStorage.getItem(TRAINING_GOALS_STORAGE_KEY);
  if (!raw) return getDefaultTrainingGoalsBundle();
  try {
    const parsed = JSON.parse(raw) as TrainingGoalsBundle;
    if (!parsed || !Array.isArray(parsed.gymGoals)) return getDefaultTrainingGoalsBundle();
    return {
      ...getDefaultTrainingGoalsBundle(),
      ...parsed,
      gymGoals: parsed.gymGoals.map((goal) => ({
        ...goal,
        countedSessionIds: goal.countedSessionIds ?? [],
        history: goal.history ?? [],
        userNotes: goal.userNotes ?? "",
      })),
      injuryExerciseIds: parsed.injuryExerciseIds ?? [],
      mesocyclePhase: parsed.mesocyclePhase ?? "build",
    };
  } catch {
    return getDefaultTrainingGoalsBundle();
  }
}

export function saveTrainingGoalsBundle(bundle: TrainingGoalsBundle) {
  if (!canUseStorage()) return;
  bundle.updatedAtISO = new Date().toISOString();
  window.localStorage.setItem(TRAINING_GOALS_STORAGE_KEY, JSON.stringify(bundle));
  window.dispatchEvent(new Event("bt:training-goals-updated"));
}

export function setMesocyclePhase(phase: MesocyclePhase) {
  const bundle = loadTrainingGoalsBundle();
  bundle.mesocyclePhase = phase;
  saveTrainingGoalsBundle(bundle);
}

export function toggleExerciseInjuryPause(exerciseId: string, paused: boolean) {
  const bundle = loadTrainingGoalsBundle();
  const set = new Set(bundle.injuryExerciseIds);
  if (paused) set.add(exerciseId);
  else set.delete(exerciseId);
  bundle.injuryExerciseIds = Array.from(set);
  saveTrainingGoalsBundle(bundle);
}

function repsFromLog(log: { completedValue: number | null }): number {
  return Math.max(0, log.completedValue ?? 0);
}

function sessionQualifiesGymGoal(goal: GymProgressGoal, session: WorkoutSessionEntry): boolean {
  const logs = session.logs.filter((log) => log.exerciseId === goal.exerciseId && log.completed !== false);
  if (logs.length < goal.workingSets) return false;

  const tol = 0.5;
  const goodSets = logs.filter((log) => {
    const w = log.weightKg ?? 0;
    const r = repsFromLog(log);
    return w >= goal.weightKg - tol && r >= goal.targetReps;
  });
  return goodSets.length >= goal.workingSets;
}

function advanceGoal(goal: GymProgressGoal, bundle: TrainingGoalsBundle) {
  const inc = minimumWeightIncrementKg(goal.modality);
  let note = "";

  if (bundle.mesocyclePhase === "deload") {
    if (goal.modality !== "bodyweight" && inc > 0) {
      const reduced = Math.max(0, Math.round((goal.weightKg * 0.9) / 2.5) * 2.5);
      note = `Deload: Arbeitshöhe auf ${reduced} kg (~−10 %).`;
      goal.weightKg = reduced;
    } else {
      note = "Deload: ein Satz weniger — Volumen etwas reduzieren.";
      goal.workingSets = Math.max(2, goal.workingSets - 1);
    }
    goal.successfulSessionsInPhase = 0;
    goal.countedSessionIds = [];
    goal.history.unshift({ dateISO: new Date().toISOString(), note });
    return;
  }

  if (goal.modality === "bodyweight" || inc <= 0) {
    const nextSets = Math.min(goal.workingSets + 1, 6);
    const nextReps = goal.targetReps + 1;
    note = `Phase geschafft: Körpergewicht — Ziel auf ${nextReps} Wdh., ${nextSets} Sätze.`;
    goal.workingSets = nextSets;
    goal.targetReps = Math.min(nextReps, 20);
    goal.baselineRepsPhase = Math.max(3, goal.targetReps - 2);
  } else {
    const nextW = nextWorkingWeightKg(goal.weightKg, goal.modality);
    note = `Phase geschafft: neue Arbeitshöhe ${nextW} kg (${progressionModalityHintDE(goal.modality)})`;
    goal.weightKg = nextW;
    const dropReps = bundle.mesocyclePhase === "peak" ? 0 : 1;
    goal.targetReps = Math.max(goal.baselineRepsPhase, goal.targetReps - dropReps);
  }

  goal.successfulSessionsInPhase = 0;
  goal.countedSessionIds = [];
  goal.history.unshift({ dateISO: new Date().toISOString(), note });
}

/** Nach abgeschlossenem Workout (Session bereits angehängt) aufrufen. */
export function applyGymGoalsAfterSession(completedSession: WorkoutSessionEntry) {
  const bundle = loadTrainingGoalsBundle();
  let changed = false;

  for (const goal of bundle.gymGoals) {
    if (goal.status !== "active") continue;
    if (bundle.injuryExerciseIds.includes(goal.exerciseId)) continue;
    if (!sessionQualifiesGymGoal(goal, completedSession)) continue;
    if (goal.countedSessionIds.includes(completedSession.id)) continue;

    goal.countedSessionIds.push(completedSession.id);
    goal.successfulSessionsInPhase += 1;
    changed = true;

    const required = Math.max(1, goal.phaseWeeks * goal.sessionsPerWeek);
    if (goal.successfulSessionsInPhase >= required) {
      advanceGoal(goal, bundle);
      changed = true;
    }
  }

  if (changed) saveTrainingGoalsBundle(bundle);
}

export function createGymGoalFromExercise(input: {
  exercise: Exercise;
  weightKg: number;
  baselineReps: number;
  targetReps: number;
  workingSets?: number;
  phaseWeeks?: number;
  sessionsPerWeek?: number;
  modalityOverride?: ProgressionModality;
}): GymProgressGoal {
  const modality = input.modalityOverride ?? inferProgressionModality(input.exercise);
  const id = `gg-${input.exercise.id}-${Date.now()}`;
  return {
    id,
    exerciseId: input.exercise.id,
    exerciseNameSnapshot: input.exercise.name,
    modality,
    weightKg: Math.round(input.weightKg * 10) / 10,
    baselineRepsPhase: input.baselineReps,
    targetReps: input.targetReps,
    workingSets: input.workingSets ?? 3,
    phaseWeeks: input.phaseWeeks ?? 2,
    sessionsPerWeek: input.sessionsPerWeek ?? 2,
    countedSessionIds: [],
    successfulSessionsInPhase: 0,
    status: "active",
    history: [
      {
        dateISO: new Date().toISOString(),
        note: `Start: ${input.weightKg} kg × ${input.baselineReps} → Ziel ${input.targetReps} Wdh., ${input.workingSets ?? 3} Sätze; ${progressionModalityHintDE(modality)}`,
      },
    ],
    createdAtISO: new Date().toISOString(),
  };
}

export function upsertGymGoal(goal: GymProgressGoal) {
  const bundle = loadTrainingGoalsBundle();
  bundle.gymGoals = [goal, ...bundle.gymGoals.filter((item) => item.id !== goal.id)].slice(0, 40);
  saveTrainingGoalsBundle(bundle);
}

export function seedGymGoalsFromCatalog(exercises: Exercise[]) {
  const bundle = loadTrainingGoalsBundle();
  const existing = new Set(bundle.gymGoals.filter((g) => g.status === "active").map((g) => g.exerciseId));
  const gym = exercises.filter((ex) => ex.category === "Gym" && ex.metricKeys.includes("weight"));
  let added = 0;
  for (const exercise of gym.slice(0, 12)) {
    if (existing.has(exercise.id)) continue;
    const w = exercise.targetByMetric?.weight;
    const r = exercise.targetByMetric?.reps;
    if (w == null || r == null) continue;
    const goal = createGymGoalFromExercise({
      exercise,
      weightKg: w,
      baselineReps: Math.max(3, r - 2),
      targetReps: Math.max(r, 5),
      workingSets: exercise.setCount ?? 3,
      phaseWeeks: 2,
      sessionsPerWeek: 2,
    });
    bundle.gymGoals.unshift(goal);
    existing.add(exercise.id);
    added += 1;
  }
  if (added > 0) saveTrainingGoalsBundle(bundle);
  return added;
}

export function pauseGymGoal(goalId: string, paused: boolean) {
  const bundle = loadTrainingGoalsBundle();
  const goal = bundle.gymGoals.find((item) => item.id === goalId);
  if (!goal) return;
  goal.status = paused ? "paused" : "active";
  saveTrainingGoalsBundle(bundle);
}

export function deleteGymGoal(goalId: string) {
  const bundle = loadTrainingGoalsBundle();
  bundle.gymGoals = bundle.gymGoals.filter((item) => item.id !== goalId);
  saveTrainingGoalsBundle(bundle);
}

export function setGymGoalUserNotes(goalId: string, userNotes: string) {
  const bundle = loadTrainingGoalsBundle();
  const goal = bundle.gymGoals.find((item) => item.id === goalId);
  if (!goal) return;
  goal.userNotes = userNotes.trim();
  saveTrainingGoalsBundle(bundle);
}

export function updateGymGoalHistoryNote(goalId: string, historyIndex: number, note: string) {
  const bundle = loadTrainingGoalsBundle();
  const goal = bundle.gymGoals.find((item) => item.id === goalId);
  if (!goal) return;
  const row = goal.history[historyIndex];
  if (!row) return;
  row.note = note.trim();
  saveTrainingGoalsBundle(bundle);
}

export function getActiveGymGoalForExercise(exerciseId: string): GymProgressGoal | null {
  const bundle = loadTrainingGoalsBundle();
  return bundle.gymGoals.find((g) => g.exerciseId === exerciseId && g.status === "active") ?? null;
}

export function formatGymGoalSummary(goal: GymProgressGoal): string {
  const req = Math.max(1, goal.phaseWeeks * goal.sessionsPerWeek);
  return `${goal.weightKg} kg × ${goal.targetReps}+ ${goal.workingSets} Sätze — ${goal.successfulSessionsInPhase}/${req} starke Sessions`;
}
