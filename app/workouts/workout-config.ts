export type MetricKey =
  | "tries"
  | "makes"
  | "misses"
  | "weight"
  | "reps"
  | "time"
  | "distance"
  | "intensity";

export type Category = {
  id: string;
  title: string;
  description: string;
  defaultMetrics: MetricKey[];
};

export const METRIC_LABELS: Record<MetricKey, string> = {
  tries: "Trys",
  makes: "Makes",
  misses: "Misses",
  weight: "Gewicht",
  reps: "Reps",
  time: "Zeit",
  distance: "Distanz",
  intensity: "Intensität",
};

export const ALL_METRICS: MetricKey[] = [
  "tries",
  "makes",
  "misses",
  "weight",
  "reps",
  "time",
  "distance",
  "intensity",
];

export const SHOT_RESULT_CATEGORIES = ["handles", "finishes", "shooting"] as const;

export const CATEGORIES: Category[] = [
  {
    id: "handles",
    title: "Handles",
    description: "Trys + Makes als getrennte Eingaben (Misses werden automatisch berechnet).",
    defaultMetrics: ["tries", "makes"],
  },
  {
    id: "finishes",
    title: "Finishes",
    description: "Trys + Makes als getrennte Eingaben (Misses werden automatisch berechnet).",
    defaultMetrics: ["tries", "makes"],
  },
  {
    id: "shooting",
    title: "Shooting",
    description: "Trys + Makes als getrennte Eingaben (Misses werden automatisch berechnet).",
    defaultMetrics: ["tries", "makes"],
  },
  {
    id: "gym-push",
    title: "Gym – Push",
    description: "Krafttraining mit Gewicht + Reps.",
    defaultMetrics: ["weight", "reps"],
  },
  {
    id: "gym-pull",
    title: "Gym – Pull",
    description: "Ziehende Kraftübungen mit Gewicht + Reps.",
    defaultMetrics: ["weight", "reps"],
  },
  {
    id: "gym-legs",
    title: "Gym – Legs",
    description: "Beintraining mit Gewicht + Reps.",
    defaultMetrics: ["weight", "reps"],
  },
  {
    id: "gym-core",
    title: "Gym – Core",
    description: "Core-Training mit Gewicht + Reps.",
    defaultMetrics: ["weight", "reps"],
  },
  {
    id: "defensive",
    title: "Defensive",
    description: "Defensive Drills mit Zeit und/oder Reps.",
    defaultMetrics: ["time", "reps"],
  },
  {
    id: "home",
    title: "Home / Custom",
    description: "Eigene Exercises frei definieren. Metriken komplett frei auswählbar.",
    defaultMetrics: ["tries", "makes", "weight", "reps", "time"],
  },
];

export const DEFAULT_SELECTED_METRICS = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, category.defaultMetrics]),
) as Record<string, MetricKey[]>;

export const DEFAULT_SHOOTING_MODE = Object.fromEntries(
  SHOT_RESULT_CATEGORIES.map((id) => [id, "makes"]),
) as Record<string, "makes" | "misses">;

export function isShotResultCategory(
  categoryId: string,
): categoryId is (typeof SHOT_RESULT_CATEGORIES)[number] {
  return SHOT_RESULT_CATEGORIES.includes(categoryId as (typeof SHOT_RESULT_CATEGORIES)[number]);
}

export function getCategoryById(categoryId: string) {
  return CATEGORIES.find((category) => category.id === categoryId) ?? null;
}