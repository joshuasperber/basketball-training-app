"use client";

import { useMemo, useState } from "react";

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
    handles: {
      title: "Handles",
      workouts: [{ id: "handles-1", name: "Handles 1", level: 1 }],
    },
    finishing: {
      title: "Finishing",
      workouts: [{ id: "finishing-1", name: "Finishing 1", level: 2 }],
    },
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
    push: {
      title: "Push",
      workouts: [{ id: "push-1", name: "Push 1", level: 1 }],
    },
    pull: {
      title: "Pull",
      workouts: [
        { id: "pull-1", name: "Pull 1", level: 1 },
        { id: "pull-2", name: "Pull 2", level: 2 },
      ],
    },
  },
  home: {
    mobility: {
      title: "Mobility",
      workouts: [{ id: "mobility-1", name: "Mobility Flow", level: 1 }],
    },
    core: {
      title: "Core",
      workouts: [{ id: "core-1", name: "Core Stability", level: 2 }],
    },
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

export default function WorkoutPlanner() {
  const [category, setCategory] = useState<keyof typeof workoutCatalog>("basketball");
  const [subCategory, setSubCategory] = useState<string>("shooting");
  const [selectedWorkout, setSelectedWorkout] = useState<string>("shooting-1");
  const [exercisePool, setExercisePool] = useState<string[]>(baseExercises);
  const [selectedExercises, setSelectedExercises] = useState<string[]>([]);
  const [newExercise, setNewExercise] = useState("");

  const subCategories = workoutCatalog[category];

  const normalizedSubCategory = useMemo(() => {
    if (subCategories[subCategory]) return subCategory;
    return Object.keys(subCategories)[0];
  }, [subCategories, subCategory]);

  const activeGroup = subCategories[normalizedSubCategory];

  const onToggleExercise = (exercise: string) => {
    setSelectedExercises((prev) =>
      prev.includes(exercise) ? prev.filter((item) => item !== exercise) : [...prev, exercise]
    );
  };

  const onCreateExercise = () => {
    const trimmed = newExercise.trim();
    if (!trimmed) return;
    if (exercisePool.some((exercise) => exercise.toLowerCase() === trimmed.toLowerCase())) {
      setNewExercise("");
      return;
    }

    setExercisePool((prev) => [trimmed, ...prev]);
    setSelectedExercises((prev) => [trimmed, ...prev]);
    setNewExercise("");
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
        <p className="text-sm font-medium text-zinc-200">3) Workout auswählen</p>
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
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm font-medium text-zinc-200">4) Exercises auswählen / erstellen</p>

        <div className="mt-3 flex gap-2">
          <input
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-indigo-500 placeholder:text-zinc-500 focus:ring-2"
            placeholder="Neue Exercise (z. B. Floaters Advanced)"
            value={newExercise}
            onChange={(event) => setNewExercise(event.target.value)}
          />
          <button
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
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
        <p className="text-sm text-zinc-400">Ausgewählt</p>
        <p className="mt-1 font-medium text-white">
          {category.toUpperCase()} / {activeGroup.title} / {selectedWorkout || "—"}
        </p>
        <p className="mt-2 text-sm text-zinc-300">
          Exercises: {selectedExercises.length > 0 ? selectedExercises.join(", ") : "Noch keine"}
        </p>
      </div>
    </div>
  );
}