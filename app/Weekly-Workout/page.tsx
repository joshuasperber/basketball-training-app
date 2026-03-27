"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { type Category, type Exercise, type Workout } from "@/lib/training-data";
import { getWorkoutSessions } from "@/lib/session-storage";
import { loadExercises, loadWorkouts } from "@/lib/training-storage";
import { WEEKLY_WORKOUT_PLAN, getTodayWorkoutPlan } from "@/lib/workout";
import { buildWeeklyPlan, type DayKey, type WeekConfig } from "@/lib/planner";

const weekdayOrder = [1, 2, 3, 4, 5, 6, 0] as const;

const weekdayNames: Record<(typeof weekdayOrder)[number], string> = {
  0: "Sonntag",
  1: "Montag",
  2: "Dienstag",
  3: "Mittwoch",
  4: "Donnerstag",
  5: "Freitag",
  6: "Samstag",
};

const dayByIndex: Record<(typeof weekdayOrder)[number], DayKey> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

type ProfileLocalCache = {
  profile: {
    favorite_position: string | null;
  };
  playStyle: string;
  weekConfig: WeekConfig;
  weeklyGoalSessions: number;
};

type PlannedUiEntry = {
  day: DayKey;
  sessionType: string;
  intensity: string;
  minutes: number;
  reason: string;
};

type SuggestedWorkout = {
  workoutId?: string;
  title: string;
  durationMin: number;
  notes: string;
  sport: string;
  subcategory: string;
};

function roundUpToNearestFive(value: number) {
  return Math.ceil(value / 5) * 5;
}

function computeWorkoutDuration(workout: Workout, exercisesById: Record<string, Exercise>) {
  const rawDuration = workout.exerciseIds.reduce((sum, exerciseId) => {
    const exercise = exercisesById[exerciseId];
    return sum + (exercise?.durationMin ?? 10);
  }, 0);

  return roundUpToNearestFive(rawDuration * 1.1);
}

function buildFallbackSuggestion(mode: string, minutes: number): SuggestedWorkout | null {
  if (mode === "none" || mode === "recovery" || minutes <= 0) {
    return {
      title: "Kein Workout geplant",
      durationMin: 0,
      notes: "0 Minuten angesetzt.",
      sport: "-",
      subcategory: "-",
    };
  }

  if (mode === "game") {
    return {
      title: "Spieltag",
      durationMin: minutes,
      notes: "Nur Match-Fokus, kein zusätzliches Workout.",
      sport: "Basketball",
      subcategory: "Game",
    };
  }

  return null;
}

function selectBestWorkout(
  mode: string,
  targetMinutes: number,
  workouts: Workout[],
  exercisesById: Record<string, Exercise>,
  freshnessMapByCategory: Record<Category, Record<string, number>>,
  usedWorkoutIds: Set<string>,
  weeklySubcategoryUsage: Record<Category, Record<string, number>>,
): SuggestedWorkout {
  const targetWithExtra = mode === "game-training" ? targetMinutes + 30 : targetMinutes;
  const fallback = buildFallbackSuggestion(mode, targetWithExtra);
  if (fallback) return fallback;

  const desiredCategory: Category =
    mode === "gym" ? "Gym" : "Basketball";

  const categoryFreshness = freshnessMapByCategory[desiredCategory] ?? {};
  const subcategoryRank = (subcategory: string) => categoryFreshness[subcategory] ?? 0;
  const weeklyUsage = weeklySubcategoryUsage[desiredCategory] ?? {};
  const subcategoryWeeklyCount = (subcategory: string) => weeklyUsage[subcategory] ?? 0;

  const filteredByCategory = workouts.filter((workout) => workout.category === desiredCategory);
  if (filteredByCategory.length === 0) {
    return {
      title: "Kein passendes Workout gefunden",
      durationMin: roundUpToNearestFive(targetWithExtra),
      notes: "Bitte Workout für diese Kategorie erstellen.",
      sport: desiredCategory,
      subcategory: desiredCategory,
    };
  }

  const filtered = filteredByCategory
    .map((workout) => ({
      workout,
      duration: computeWorkoutDuration(workout, exercisesById),
    }));
  const unusedPool = filtered.filter((entry) => !usedWorkoutIds.has(entry.workout.id));
  const pool = unusedPool.length > 0 ? unusedPool : filtered;

  const sortedPool = [...pool].sort((a, b) => {
    const weeklyDiff = subcategoryWeeklyCount(a.workout.subcategory) - subcategoryWeeklyCount(b.workout.subcategory);
    if (weeklyDiff !== 0) return weeklyDiff;

    const freshnessDiff = subcategoryRank(a.workout.subcategory) - subcategoryRank(b.workout.subcategory);
    if (freshnessDiff !== 0) return freshnessDiff;

    return Math.abs(a.duration - targetWithExtra) - Math.abs(b.duration - targetWithExtra);
  });
  const best = sortedPool[0];
  const modeLabel = mode === "game-training" ? "Trainingsspiel + 30 Min Zusatztraining" : "Direktes Training";

  usedWorkoutIds.add(best.workout.id);
  weeklySubcategoryUsage[desiredCategory] = {
    ...weeklySubcategoryUsage[desiredCategory],
    [best.workout.subcategory]: subcategoryWeeklyCount(best.workout.subcategory) + 1,
  };

  return {
    workoutId: best.workout.id,
    title: best.workout.name,
    durationMin: best.duration,
    notes: `${modeLabel}: Match zu ${targetWithExtra} Min (${best.workout.category} • ${best.workout.subcategory})`,
    sport: best.workout.category,
    subcategory: best.workout.subcategory,
  };
}

export default function WeeklyWorkoutPage() {
  const todayIndex = new Date().getDay() as (typeof weekdayOrder)[number];
  const todayWorkout = getTodayWorkoutPlan();
  const [plannedEntries, setPlannedEntries] = useState<PlannedUiEntry[] | null>(null);
  const [suggestionsByDay, setSuggestionsByDay] = useState<Record<DayKey, SuggestedWorkout> | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const raw = window.localStorage.getItem("profile_cache_v4");
      if (!raw) return;

      try {
        const parsed = JSON.parse(raw) as ProfileLocalCache;
        const computed = buildWeeklyPlan({
          position: parsed.profile.favorite_position ?? "sg",
          playStyle: parsed.playStyle,
          weekConfig: parsed.weekConfig,
          weeklyGoalSessions: parsed.weeklyGoalSessions,
        });

        setPlannedEntries(computed);

        const exercises = loadExercises();
        const workouts = loadWorkouts();
        const exercisesById = Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise]));
        const sessions = getWorkoutSessions();
        const workoutLookup = new Map(workouts.map((workout) => [workout.id, workout]));
        const freshnessMapByCategory = sessions.reduce(
          (accumulator, session, index) => {
            const workout = workoutLookup.get(session.workoutId);
            const category = (workout?.category ?? session.workoutCategory) as Category | undefined;
            const subcategory = workout?.subcategory ?? session.workoutSubcategory;
            if (!category || !subcategory) return accumulator;
            const next = accumulator[category] ?? {};
            if (next[subcategory] === undefined) {
              next[subcategory] = index + 1;
            }
            accumulator[category] = next;
            return accumulator;
          },
          {} as Record<Category, Record<string, number>>,
        );
        const usedWorkoutIds = new Set<string>();
        const weeklySubcategoryUsage: Record<Category, Record<string, number>> = {
          Basketball: {},
          Gym: {},
          Home: {},
        };
        const suggested = Object.fromEntries(
          computed.map((entry) => [
            entry.day,
            selectBestWorkout(
              entry.sessionType,
              entry.minutes,
              workouts,
              exercisesById,
              freshnessMapByCategory,
              usedWorkoutIds,
              weeklySubcategoryUsage,
            ),
          ]),
        ) as Record<DayKey, SuggestedWorkout>;

        setSuggestionsByDay(suggested);
      } catch {
        setPlannedEntries(null);
        setSuggestionsByDay(null);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const plannedToday = useMemo(() => {
    if (!plannedEntries) return null;
    return plannedEntries.find((entry) => entry.day === dayByIndex[todayIndex]) ?? null;
  }, [plannedEntries, todayIndex]);

  return (
    <main className="min-h-screen bg-black p-6 pb-24 text-white">
      <h1 className="text-2xl font-bold">Weekly Workout Plan</h1>
      <p className="mt-2 text-zinc-400">Wochenübersicht mit heutigem Fokus</p>

      <section className="mt-6 rounded-2xl border border-green-800 bg-green-950/50 p-4">
        <p className="text-xs uppercase tracking-wide text-green-300">Heute</p>
        <h2 className="mt-2 text-xl font-semibold">
          {suggestionsByDay?.[dayByIndex[todayIndex]]?.title ?? todayWorkout.title}
        </h2>
        <p className="mt-1 text-sm text-green-200">
          Sport: {suggestionsByDay?.[dayByIndex[todayIndex]]?.sport ?? todayWorkout.sport}
        </p>
        <p className="text-sm text-green-200">
          Unterkategorie: {suggestionsByDay?.[dayByIndex[todayIndex]]?.subcategory ?? todayWorkout.subcategory}
        </p>
        {plannedToday ? (
          <p className="mt-2 text-sm text-green-100">
            Profil-Plan: {plannedToday.sessionType} • {plannedToday.intensity} • {plannedToday.minutes} Min
          </p>
        ) : null}
        <Link
          href={`/workouts?day=${todayIndex}`}
          className="mt-4 inline-block rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"
        >
          Zum heutigen Workout
        </Link>
      </section>

      <div className="mt-6 space-y-3">
        {weekdayOrder.map((day) => {
          const workout = WEEKLY_WORKOUT_PLAN[day];
          const isToday = day === todayIndex;
          const profilePlan = plannedEntries?.find((entry) => entry.day === dayByIndex[day]) ?? null;
          const suggestedWorkout = suggestionsByDay?.[dayByIndex[day]] ?? null;

          return (
            <article
              key={day}
              className={
                isToday
                  ? "rounded-2xl border border-green-700 bg-zinc-900 p-4"
                  : "rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
              }
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{weekdayNames[day]}</h3>
                {isToday ? (
                  <span className="rounded-full bg-green-600 px-2 py-1 text-xs font-semibold text-white">
                    Heute
                  </span>
                ) : null}
              </div>

              <p className="mt-2 text-lg font-medium">{suggestedWorkout?.title ?? workout.title}</p>
              <p className="text-sm text-zinc-400">Sport: {suggestedWorkout?.sport ?? workout.sport}</p>
              <p className="text-sm text-zinc-400">
                Unterkategorie: {suggestedWorkout?.subcategory ?? workout.subcategory}
              </p>
              {profilePlan ? (
                <p className="mt-2 text-sm text-emerald-300">
                  Profil-Plan: {profilePlan.sessionType} • {profilePlan.intensity} • {profilePlan.minutes} Min
                </p>
              ) : null}
              {suggestedWorkout ? (
                <p className="mt-1 text-sm text-sky-300">
                  Passendes Workout: {suggestedWorkout.title} • {suggestedWorkout.durationMin} Min
                </p>
              ) : null}
              <Link
                href={`/workouts?day=${day}`}
                className="mt-3 inline-block rounded-lg border border-indigo-500 px-3 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-950"
              >
                Workout ausführen
              </Link>

              {suggestedWorkout ? (
                <p className="mt-2 text-xs text-zinc-500">{suggestedWorkout.notes}</p>
              ) : (
                <ul className="mt-3 list-inside list-disc text-sm text-zinc-300">
                  {workout.exercises.map((exercise) => (
                    <li key={`${workout.id}-${exercise.name}`}>{exercise.name}</li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}