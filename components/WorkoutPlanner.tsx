"use client";

import { supabase } from "@/lib/supabase";
import { useMemo, useState } from "react";

const PROFILE_ID = "11111111-1111-1111-1111-111111111111"; // Joshua Seed-ID

type WorkoutOption = {
  id: string;
  name: string;
  level: number;
};

type WorkoutGroup = {
  title: string;
  workouts: WorkoutOption[];
};

const workoutCatalog: Record<string, Record<string, WorkoutGroup>> = {
  basketball: {
    handles: { title: "Handles", workouts: [{ id: "handles-1", name: "Handles 1", level: 1 }] },
    finishing: { title: "Finishing", workouts: [{ id: "finishing-1", name: "Finishing 1", level: 2 }] },
    shooting: {
      title: "Shooting",
      workouts: [
        { id: "shooting-1", name: "Shooting 1", level: 1 },
        { id: "shooting-2", name: "Shooting 2", level: 2 },
        { id: "shooting-3", name: "Shooting 3", level: 3 },
        { id: "shooting-4", name: "Shooting 4", level: 4 },
        { id: "shooting-5", name: "Shooting 5", level: 5 },
      ],
    },
  },
  gym: {
    push: { title: "Push", workouts: [{ id: "push-1", name: "Push 1", level: 1 }] },
    pull: {
      title: "Pull",
      workouts: [
        { id: "pull-1", name: "Pull 1", level: 1 },
        { id: "pull-2", name: "Pull 2", level: 2 },
      ],
    },
  },
  home: {
    mobility: { title: "Mobility", workouts: [{ id: "mobility-1", name: "Mobility Flow", level: 1 }] },
    core: { title: "Core", workouts: [{ id: "core-1", name: "Core Stability", level: 2 }] },
  },
};

const baseExercises = [
  "Form Shooting",
  "Catch and Shoot",
  "Mikan Drill",
  "Cone Dribbling",
  "Bench Press",
  "Squat",
];

const dayKeys = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const dayLabels: Record<string, string> = {
  monday: "Mo",
  tuesday: "Di",
  wednesday: "Mi",
  thursday: "Do",
  friday: "Fr",
  saturday: "Sa",
  sunday: "So",
};

function getTodayDayKey() {
  const map = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
  return map[new Date().getDay()];
}

function getTargetScoreByLevel(level: number) {
  // Empfehlung: je höher das Level, desto höher der Zielwert
  // Diese Zahl nutzen wir bei Workout-Start als attempts-Ziel (made startet bei 0)
  const base = 30;
  return base + level * 10; // L1=40 ... L5=80
}

export default function WorkoutPlanner() {
  const today = getTodayDayKey();

  // Step 1-3
  const [category, setCategory] = useState<keyof typeof workoutCatalog>("basketball");
  const [subCategory, setSubCategory] = useState<string>("shooting");
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string>("shooting-1");

  // Weekly plan target day (oben klickbar, heute blau)
  const [planDay, setPlanDay] = useState<string>(today);

  // Exercises
  const [exercisePool, setExercisePool] = useState<string[]>(baseExercises);
  const [selectedExercises, setSelectedExercises] = useState<string[]>([]);
  const [newExercise, setNewExercise] = useState("");

  // Start single exercise
  const [singleExerciseName, setSingleExerciseName] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const subCategories = workoutCatalog[category];

  const normalizedSubCategory = useMemo(() => {
    if (subCategories[subCategory]) return subCategory;
    return Object.keys(subCategories)[0];
  }, [subCategories, subCategory]);

  const activeGroup = subCategories[normalizedSubCategory];

  const selectedWorkout = useMemo(
    () => activeGroup.workouts.find((w) => w.id === selectedWorkoutId) ?? activeGroup.workouts[0],
    [activeGroup.workouts, selectedWorkoutId]
  );

  const targetScore = getTargetScoreByLevel(selectedWorkout.level);

  const onToggleExercise = (exercise: string) => {
    setSelectedExercises((prev) =>
      prev.includes(exercise) ? prev.filter((item) => item !== exercise) : [...prev, exercise]
    );
  };

  const onCreateExercise = async () => {
    const trimmed = newExercise.trim();
    if (!trimmed) return;

    if (exercisePool.some((e) => e.toLowerCase() === trimmed.toLowerCase())) {
      setMessage("Exercise existiert bereits.");
      setNewExercise("");
      return;
    }

    // lokal hinzufügen
    setExercisePool((prev) => [trimmed, ...prev]);
    setSelectedExercises((prev) => [trimmed, ...prev]);
    setSingleExerciseName(trimmed);
    setNewExercise("");

    // optional direkt in exercises speichern (wenn nicht vorhanden)
    const { data: existing } = await supabase
      .from("exercises")
      .select("id")
      .eq("name", trimmed)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (!existing?.id) {
      await supabase.from("exercises").insert({
        name: trimmed,
        category: category,
        tracking_type: "makes",
        description: "Custom exercise from planner",
        default_duration_min: 10,
      });
    }

    setMessage(`Exercise "${trimmed}" hinzugefügt.`);
  };

  const saveWeeklyPlan = async () => {
    setLoading(true);
    setMessage(null);

    // 1) planned_workout upsert pro Tag
    const { data: planned, error: plannedError } = await supabase
      .from("planned_workouts")
      .upsert(
        {
          profile_id: PROFILE_ID,
          day_key: planDay,
          category,
          sub_category: normalizedSubCategory,
          workout_name: selectedWorkout.name,
          level: selectedWorkout.level,
          focus: activeGroup.title,
          planned_duration_min: 45,
        },
        { onConflict: "profile_id,day_key" }
      )
      .select("id")
      .single();

    if (plannedError || !planned?.id) {
      setLoading(false);
      setMessage(`Plan speichern fehlgeschlagen: ${plannedError?.message ?? "Unknown error"}`);
      return;
    }

    // 2) alte exercises löschen
    const { error: deleteErr } = await supabase
      .from("planned_workout_exercises")
      .delete()
      .eq("planned_workout_id", planned.id);

    if (deleteErr) {
      setLoading(false);
      setMessage(`Plan-Exercises löschen fehlgeschlagen: ${deleteErr.message}`);
      return;
    }

    // 3) neue exercises speichern
    if (selectedExercises.length > 0) {
      const rows = selectedExercises.map((exercise_name, index) => ({
        planned_workout_id: planned.id,
        exercise_name,
        sort_order: index + 1,
      }));

      const { error: insertErr } = await supabase.from("planned_workout_exercises").insert(rows);

      if (insertErr) {
        setLoading(false);
        setMessage(`Plan-Exercises speichern fehlgeschlagen: ${insertErr.message}`);
        return;
      }
    }

    setLoading(false);
    setMessage(`Plan für ${dayLabels[planDay]} gespeichert ✅`);
  };

  const ensureExerciseInDb = async (exerciseName: string) => {
    const { data: existing, error } = await supabase
      .from("exercises")
      .select("id")
      .eq("name", exerciseName)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (error) throw new Error(error.message);
    if (existing?.id) return existing.id;

    const { data: inserted, error: insertErr } = await supabase
      .from("exercises")
      .insert({
        name: exerciseName,
        category: category,
        tracking_type: "makes",
        description: "Auto-created from planner",
        default_duration_min: 10,
      })
      .select("id")
      .single<{ id: string }>();

    if (insertErr || !inserted?.id) {
      throw new Error(insertErr?.message ?? "Exercise konnte nicht erstellt werden");
    }

    return inserted.id;
  };

  const startWorkout = async () => {
    if (!selectedExercises.length) {
      setMessage("Bitte wähle mindestens eine Exercise für das Workout.");
      return;
    }

    setLoading(true);
    setMessage(null);

    const { data: session, error: sessionErr } = await supabase
      .from("workout_sessions")
      .insert({
        profile_id: PROFILE_ID,
        session_date: new Date().toISOString().slice(0, 10),
        total_duration_min: 0,
        notes: `Workout started: ${selectedWorkout.name} (${activeGroup.title})`,
      })
      .select("id")
      .single<{ id: string }>();

    if (sessionErr || !session?.id) {
      setLoading(false);
      setMessage(`Workout-Session konnte nicht gestartet werden: ${sessionErr?.message ?? "Unknown error"}`);
      return;
    }

    try {
      for (let i = 0; i < selectedExercises.length; i += 1) {
        const exerciseName = selectedExercises[i];
        const exerciseId = await ensureExerciseInDb(exerciseName);

        // Target Score abhängig von Level + kleiner Progression pro Exercise
        const attemptsTarget = targetScore + i * 5;

        const { error: itemErr } = await supabase.from("workout_session_items").insert({
          workout_session_id: session.id,
          exercise_id: exerciseId,
          tracking_type: "makes",
          made: 0,
          attempts: attemptsTarget,
          sort_order: i + 1,
        });

        if (itemErr) {
          throw new Error(itemErr.message);
        }
      }

      setActiveSessionId(session.id);
      setLoading(false);
      setMessage(`Workout gestartet ✅ (Session ${session.id.slice(0, 8)}...)`);
    } catch (err) {
      setLoading(false);
      setMessage(err instanceof Error ? err.message : "Fehler beim Workout-Start");
    }
  };

  const startSingleExercise = async () => {
    const exerciseName = singleExerciseName.trim();
    if (!exerciseName) {
      setMessage("Bitte eine einzelne Exercise auswählen/eingeben.");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const exerciseId = await ensureExerciseInDb(exerciseName);

      const { data: session, error: sessionErr } = await supabase
        .from("workout_sessions")
        .insert({
          profile_id: PROFILE_ID,
          session_date: new Date().toISOString().slice(0, 10),
          total_duration_min: 0,
          notes: `Single exercise started: ${exerciseName} (no target score)`,
        })
        .select("id")
        .single<{ id: string }>();

      if (sessionErr || !session?.id) {
        throw new Error(sessionErr?.message ?? "Session konnte nicht erstellt werden");
      }

      // Single Exercise bewusst ohne Target-Score (attempts=0)
      const { error: itemErr } = await supabase.from("workout_session_items").insert({
        workout_session_id: session.id,
        exercise_id: exerciseId,
        tracking_type: "makes",
        made: 0,
        attempts: 0,
        sort_order: 1,
      });

      if (itemErr) throw new Error(itemErr.message);

      setActiveSessionId(session.id);
      setLoading(false);
      setMessage(`Single Exercise gestartet ✅ (${exerciseName})`);
    } catch (err) {
      setLoading(false);
      setMessage(err instanceof Error ? err.message : "Fehler beim Start");
    }
  };

  return (
    <div className="space-y-4">
      {/* Tag-Leiste (heute blau, alle klickbar) */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm font-medium text-zinc-200">Weekly Plan Tag wählen</p>
        <div className="mt-3 grid grid-cols-7 gap-2">
          {dayKeys.map((day) => {
            const isToday = day === today;
            const isSelected = day === planDay;

            return (
              <button
                key={day}
                type="button"
                onClick={() => setPlanDay(day)}
                className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-500/25 text-white"
                    : isToday
                    ? "border-blue-500 bg-blue-500/20 text-blue-100"
                    : "border-zinc-700 bg-zinc-950 text-zinc-300"
                }`}
                title={day}
              >
                {dayLabels[day]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 1) Kategorie */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm font-medium text-zinc-200">1) Kategorie</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(["basketball", "gym", "home"] as const).map((item) => (
            <button
              key={item}
              className={`rounded-xl border px-3 py-2 text-sm capitalize transition ${
                category === item
                  ? "border-indigo-500 bg-indigo-500/20 text-white"
                  : "border-zinc-700 bg-zinc-950 text-zinc-300"
              }`}
              onClick={() => {
                setCategory(item);
                const firstSub = Object.keys(workoutCatalog[item])[0];
                setSubCategory(firstSub);
                setSelectedWorkoutId(workoutCatalog[item][firstSub].workouts[0]?.id ?? "");
              }}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {/* 2) Unterkategorie */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm font-medium text-zinc-200">2) Unterkategorie</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(subCategories).map(([key, group]) => (
            <button
              key={key}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                normalizedSubCategory === key
                  ? "border-indigo-500 bg-indigo-500/20 text-white"
                  : "border-zinc-700 bg-zinc-950 text-zinc-300"
              }`}
              onClick={() => {
                setSubCategory(key);
                setSelectedWorkoutId(group.workouts[0]?.id ?? "");
              }}
              type="button"
            >
              {group.title}
            </button>
          ))}
        </div>
      </div>

      {/* 3) Workout wählen (ohne Tag-Auswahl) */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm font-medium text-zinc-200">3) Workout wählen</p>
        <p className="mt-1 text-xs text-zinc-400">
          Target-Score (pro Exercise) bei diesem Workout: <span className="text-white font-semibold">{targetScore}</span> +
          Progression je Exercise.
        </p>

        <div className="mt-3 space-y-2">
          {activeGroup.workouts.map((workout) => (
            <button
              key={workout.id}
              type="button"
              onClick={() => setSelectedWorkoutId(workout.id)}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left ${
                selectedWorkoutId === workout.id
                  ? "border-indigo-500 bg-indigo-500/15"
                  : "border-zinc-700 bg-zinc-950"
              }`}
            >
              <span className="font-medium">{workout.name}</span>
              <span className="text-xs text-zinc-400">Level {workout.level}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Exercises */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm font-medium text-zinc-200">4) Exercises für Workout</p>

        <div className="mt-3 flex gap-2">
          <input
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            placeholder="Neue Exercise hinzufügen"
            value={newExercise}
            onChange={(e) => setNewExercise(e.target.value)}
          />
          <button
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white"
            type="button"
            onClick={onCreateExercise}
          >
            Add
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {exercisePool.map((exercise) => {
            const active = selectedExercises.includes(exercise);
            return (
              <button
                key={exercise}
                type="button"
                onClick={() => onToggleExercise(exercise)}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${
                  active
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
                    : "border-zinc-700 bg-zinc-950 text-zinc-300"
                }`}
              >
                {exercise}
              </button>
            );
          })}
        </div>
      </div>

      {/* Start / Save Aktionen */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <p className="text-sm font-medium text-zinc-200">Aktionen</p>

        <button
          type="button"
          onClick={saveWeeklyPlan}
          disabled={loading}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Weekly Plan für {dayLabels[planDay]} speichern
        </button>

        <button
          type="button"
          onClick={startWorkout}
          disabled={loading}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Workout starten (mit Target-Scores)
        </button>

        <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 space-y-2">
          <p className="text-sm text-zinc-300 font-medium">Einzelne Exercise starten (ohne Target)</p>

          <select
            value={singleExerciseName}
            onChange={(e) => setSingleExerciseName(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          >
            <option value="">Exercise wählen</option>
            {exercisePool.map((exercise) => (
              <option key={exercise} value={exercise}>
                {exercise}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={startSingleExercise}
            disabled={loading}
            className="w-full rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Einzelne Exercise starten
          </button>
        </div>

        <p className="text-xs text-zinc-400">
          Aktive Session: {activeSessionId ? activeSessionId : "keine"}
        </p>
      </div>

      {message && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-200">
          {message}
        </div>
      )}
    </div>
  );
}