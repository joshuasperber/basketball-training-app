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

function getTodayDayKey() {
  const map = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
  return map[new Date().getDay()];
}

export default function WorkoutPlanner() {
  const [category, setCategory] = useState<keyof typeof workoutCatalog>("basketball");
  const [subCategory, setSubCategory] = useState<string>("shooting");
  const [selectedWorkout, setSelectedWorkout] = useState<string>("shooting-1");
  const [exercisePool, setExercisePool] = useState<string[]>(baseExercises);
  const [selectedExercises, setSelectedExercises] = useState<string[]>([]);
  const [newExercise, setNewExercise] = useState("");
  const [dayKey, setDayKey] = useState<string>(getTodayDayKey());
  const [durationMin, setDurationMin] = useState<number>(45);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [exerciseToLog, setExerciseToLog] = useState<string>("");
  const [made, setMade] = useState<number>(0);
  const [attempts, setAttempts] = useState<number>(0);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const subCategories = workoutCatalog[category];

  const normalizedSubCategory = useMemo(() => {
    if (subCategories[subCategory]) return subCategory;
    return Object.keys(subCategories)[0];
  }, [subCategories, subCategory]);

  const activeGroup = subCategories[normalizedSubCategory];
  const selectedWorkoutMeta = activeGroup.workouts.find((w) => w.id === selectedWorkout);

  const onToggleExercise = (exercise: string) => {
    setSelectedExercises((prev) =>
      prev.includes(exercise) ? prev.filter((item) => item !== exercise) : [...prev, exercise]
    );
  };

  const onCreateExercise = () => {
    const trimmed = newExercise.trim();
    if (!trimmed) return;
    if (exercisePool.some((e) => e.toLowerCase() === trimmed.toLowerCase())) {
      setNewExercise("");
      return;
    }

    setExercisePool((prev) => [trimmed, ...prev]);
    setSelectedExercises((prev) => [trimmed, ...prev]);
    setNewExercise("");
  };

  const savePlan = async () => {
    if (!selectedWorkoutMeta) return;
    setSaving(true);
    setMessage(null);

    // upsert geplantes Workout pro Tag
    const { data: planned, error: plannedError } = await supabase
      .from("planned_workouts")
      .upsert(
        {
          profile_id: PROFILE_ID,
          day_key: dayKey,
          category,
          sub_category: normalizedSubCategory,
          workout_name: selectedWorkoutMeta.name,
          level: selectedWorkoutMeta.level,
          focus: activeGroup.title,
          planned_duration_min: durationMin,
        },
        { onConflict: "profile_id,day_key" }
      )
      .select("id")
      .single();

    if (plannedError || !planned?.id) {
      setSaving(false);
      setMessage(`Plan speichern fehlgeschlagen: ${plannedError?.message ?? "Unknown error"}`);
      return;
    }

    // alte Exercises für diesen Plan löschen und neue schreiben
    const { error: deleteError } = await supabase
      .from("planned_workout_exercises")
      .delete()
      .eq("planned_workout_id", planned.id);

    if (deleteError) {
      setSaving(false);
      setMessage(`Exercises reset fehlgeschlagen: ${deleteError.message}`);
      return;
    }

    if (selectedExercises.length > 0) {
      const rows = selectedExercises.map((exercise_name, index) => ({
        planned_workout_id: planned.id,
        exercise_name,
        sort_order: index + 1,
      }));

      const { error: insertError } = await supabase
        .from("planned_workout_exercises")
        .insert(rows);

      if (insertError) {
        setSaving(false);
        setMessage(`Exercises speichern fehlgeschlagen: ${insertError.message}`);
        return;
      }
    }

    setSaving(false);
    setMessage("Weekly-Plan erfolgreich gespeichert ✅");
  };

  const startSession = async () => {
    setMessage(null);

    const { data, error } = await supabase
      .from("workout_sessions")
      .insert({
        profile_id: PROFILE_ID,
        session_date: new Date().toISOString().slice(0, 10),
        total_duration_min: 0,
        notes: `Started from planner: ${selectedWorkoutMeta?.name ?? "Custom"}`,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      setMessage(`Session konnte nicht gestartet werden: ${error?.message ?? "Unknown error"}`);
      return;
    }

    setActiveSessionId(data.id);
    setMessage("Session gestartet ✅");
  };

  const logExerciseToSession = async () => {
    if (!activeSessionId) {
      setMessage("Bitte zuerst Session starten.");
      return;
    }
    if (!exerciseToLog) {
      setMessage("Bitte eine Exercise auswählen.");
      return;
    }

    // exercise_id aus exercises anhand name holen
    const { data: exercise, error: exerciseError } = await supabase
      .from("exercises")
      .select("id")
      .eq("name", exerciseToLog)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (exerciseError || !exercise?.id) {
      setMessage(`Exercise nicht gefunden in DB: ${exerciseError?.message ?? exerciseToLog}`);
      return;
    }

    const { error: insertError } = await supabase.from("workout_session_items").insert({
      workout_session_id: activeSessionId,
      exercise_id: exercise.id,
      tracking_type: "makes",
      made,
      attempts,
      sort_order: 1,
    });

    if (insertError) {
      setMessage(`Exercise konnte nicht gespeichert werden: ${insertError.message}`);
      return;
    }

    setMessage("Exercise zur Session hinzugefügt ✅");
    setMade(0);
    setAttempts(0);
  };

  return (
    <div className="space-y-4">
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
                setSelectedWorkout(workoutCatalog[item][firstSub].workouts[0]?.id ?? "");
              }}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </div>

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
                setSelectedWorkout(group.workouts[0]?.id ?? "");
              }}
              type="button"
            >
              {group.title}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm font-medium text-zinc-200">3) Workout wählen + Tag</p>

        <div className="mt-3 space-y-2">
          {activeGroup.workouts.map((workout) => (
            <button
              key={workout.id}
              type="button"
              onClick={() => setSelectedWorkout(workout.id)}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left ${
                selectedWorkout === workout.id
                  ? "border-indigo-500 bg-indigo-500/15"
                  : "border-zinc-700 bg-zinc-950"
              }`}
            >
              <span className="font-medium">{workout.name}</span>
              <span className="text-xs text-zinc-400">Level {workout.level}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <select
            value={dayKey}
            onChange={(e) => setDayKey(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          >
            {dayKeys.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <input
            type="number"
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            placeholder="Dauer min"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm font-medium text-zinc-200">4) Exercises auswählen / erstellen</p>

        <div className="mt-3 flex gap-2">
          <input
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            placeholder="Neue Exercise"
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

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={savePlan}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Speichert..." : "Weekly Plan speichern"}
          </button>

          <button
            type="button"
            onClick={startSession}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
          >
            Session starten
          </button>
        </div>

        <p className="mt-3 text-sm text-zinc-300">
          Aktive Session: {activeSessionId ?? "keine"}
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm font-medium text-zinc-200">Exercise starten / loggen</p>

        <div className="mt-3 grid grid-cols-1 gap-2">
          <select
            value={exerciseToLog}
            onChange={(e) => setExerciseToLog(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value="">Exercise wählen</option>
            {selectedExercises.map((exercise) => (
              <option key={exercise} value={exercise}>
                {exercise}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={made}
              onChange={(e) => setMade(Number(e.target.value))}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              placeholder="made"
            />
            <input
              type="number"
              value={attempts}
              onChange={(e) => setAttempts(Number(e.target.value))}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              placeholder="attempts"
            />
          </div>

          <button
            type="button"
            onClick={logExerciseToSession}
            className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white"
          >
            Exercise speichern
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-200">
          {message}
        </div>
      )}
    </div>
  );
}