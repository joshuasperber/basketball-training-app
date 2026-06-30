import { getWorkoutSessions } from "@/lib/session-storage";
import { loadGameStats } from "@/lib/game-stats";
import { loadExercises, loadWorkouts } from "@/lib/training-storage";
import { loadTrainingGoalsBundle } from "@/lib/training-goals";
import { getProgressionState } from "@/lib/level-system";
import {
  buildRecentTrainingLog14d,
  buildWorkoutCatalogForCoach,
  countSubcategories14d,
} from "@/lib/coach-training-context";
import { formatPlayerIntakeForPrompt, loadPlayerIntake } from "@/lib/coach-intake";

export const COACH_WEEKLY_NOTE_STORAGE_KEY = "bt.coach-weekly-context";

export function buildCoachRequestPayload() {
  const allSessions = getWorkoutSessions();
  const ms14 = 14 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - ms14;
  const sessionsInWindow = allSessions.filter((s) => new Date(s.dateISO).getTime() >= cutoff);
  const games = loadGameStats().slice(0, 5);
  const exerciseLookup = new Map(loadExercises().map((exercise) => [exercise.id, exercise]));
  const workoutLookup = new Map(loadWorkouts().map((workout) => [workout.id, workout]));
  const goals = loadTrainingGoalsBundle();
  const profileCache = (() => {
    try {
      const raw = window.localStorage.getItem("profile_cache_v4");
      return raw
        ? (JSON.parse(raw) as {
            profile?: {
              favorite_position?: string | null;
              height_cm?: number | null;
              weight_kg?: number | null;
              full_name?: string | null;
            };
            playStyle?: string;
            weekConfig?: Record<string, { mode: string; minutes: number }>;
            bodyMetrics?: {
              wingspan_cm?: number | null;
              standing_reach_cm?: number | null;
              body_fat_pct?: number | null;
            };
          })
        : null;
    } catch {
      return null;
    }
  })();

  const recentSessions = sessionsInWindow.slice(0, 16).map((session) => {
    const exercise = session.logs.map((log) => exerciseLookup.get(log.exerciseId)).find(Boolean);
    const totalMakes = session.logs.reduce((sum, log) => sum + (log.made ?? 0), 0);
    const totalAttempts = session.logs.reduce((sum, log) => sum + (log.attempts ?? 0), 0);
    const totalReps = session.logs.reduce((sum, log) => sum + (log.completedValue ?? 0), 0);
    const maxWeight = session.logs.reduce((max, log) => Math.max(max, log.weightKg ?? 0), 0);
    const fromLogs = session.logs.map((l) => l.rpe).filter((v): v is number => typeof v === "number");
    const avgLogRpe =
      fromLogs.length > 0 ? Math.round((fromLogs.reduce((a, b) => a + b, 0) / fromLogs.length) * 10) / 10 : null;
    const rpe = typeof session.avgRpe === "number" && Number.isFinite(session.avgRpe) ? session.avgRpe : avgLogRpe;
    return {
      date: session.dateISO.slice(0, 10),
      category: (exercise?.category as string) ?? session.workoutCategory ?? "Basketball",
      subcategory: exercise?.subcategory ?? session.workoutSubcategory ?? "",
      setCount: session.logs.length,
      rpe,
      makes: totalMakes,
      attempts: totalAttempts,
      weightKg: maxWeight,
      reps: totalReps,
    };
  });

  const recentTraining14d = buildRecentTrainingLog14d(allSessions, exerciseLookup, workoutLookup);
  const subcategoryCounts14d = countSubcategories14d(recentTraining14d);
  const workoutCatalog = buildWorkoutCatalogForCoach(loadWorkouts(), 40);

  const activeGoals = (goals.gymGoals ?? []).map((goal) => {
    const exerciseName = exerciseLookup.get(goal.exerciseId)?.name ?? goal.exerciseId;
    return `${exerciseName}: ${goal.weightKg} kg × ${goal.targetReps} Reps`;
  });

  const injuryExerciseNames = (goals.injuryExerciseIds ?? [])
    .map((id) => exerciseLookup.get(id)?.name)
    .filter((name): name is string => Boolean(name));

  let coachNote: string | undefined;
  try {
    const t = window.localStorage.getItem(COACH_WEEKLY_NOTE_STORAGE_KEY)?.trim();
    coachNote = t ? t.slice(0, 400) : undefined;
  } catch {
    coachNote = undefined;
  }

  const intake = loadPlayerIntake();
  const playerIntakeSummaryRaw = formatPlayerIntakeForPrompt(intake);
  const playerIntakeSummary = playerIntakeSummaryRaw ? playerIntakeSummaryRaw.slice(0, 900) : undefined;

  return {
    position: profileCache?.profile?.favorite_position ?? "sg",
    playStyle: profileCache?.playStyle ?? "",
    level: getProgressionState().level,
    mesocyclePhase: goals.mesocyclePhase,
    profile: {
      heightCm: profileCache?.profile?.height_cm ?? null,
      weightKg: profileCache?.profile?.weight_kg ?? null,
      bodyFatPct: profileCache?.bodyMetrics?.body_fat_pct ?? null,
      wingspanCm: profileCache?.bodyMetrics?.wingspan_cm ?? null,
      standingReachCm: profileCache?.bodyMetrics?.standing_reach_cm ?? null,
    },
    weekAvailability: profileCache?.weekConfig ?? undefined,
    activeGoals,
    injuryExerciseNames,
    recentSessions,
    recentTraining14d,
    subcategoryCounts14d,
    workoutCatalog,
    recentGames: games.map((g) => ({
      date: g.date,
      context: g.context,
      points: g.points,
      assists: g.assists,
      rebounds: g.rebounds,
      steals: g.steals,
    })),
    coachNote,
    playerIntakeSummary,
  };
}
