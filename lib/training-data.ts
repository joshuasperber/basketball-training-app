export type Category = "Basketball" | "Gym" | "Home";

export type Exercise = {
  id: string;
  name: string;
  durationMin: number;
  category: Category;
  subcategory: string;
  notes?: string;
  metricKeys: MetricKey[];
  targetByMetric?: Partial<Record<MetricKey, number>>;
  trackingType: "reps" | "weight";
  targetValue?: number;
};

export type MetricKey =
  | "reps"
  | "weight"
  | "time"
  | "distance"
  | "makes"
  | "misses"
  | "tries"
  | "intensity";

export type Workout = {
  id: string;
  name: string;
  category: Category;
  subcategory: string;
  notes?: string;
  level: number;
  exerciseIds: string[];
};

export type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export const categories: Category[] = ["Basketball", "Gym", "Home"];

export const workoutSubcategoriesByCategory: Record<Category, string[]> = {
  Basketball: ["Handles", "Finishing", "Shooting", "Defense", "Komplett"],
  Gym: ["Push", "Pull", "Legs", "Core"],
  Home: ["Mobility", "Conditioning", "Recovery"],
};

export const exerciseSubcategoriesByCategory: Record<Category, string[]> = {
  Basketball: ["Handles", "Finishing", "Shooting", "Defense"],
  Gym: ["Push", "Pull", "Legs", "Core"],
  Home: ["Mobility", "Conditioning", "Recovery"],
};

export const defaultExercises: Exercise[] = [
  { id: "ex-0", name: "Pound Dribbles", durationMin: 10, category: "Basketball", subcategory: "Handles", notes: "Ball tief und schnell", metricKeys: ["reps", "time"], targetByMetric: { reps: 80, time: 60 }, trackingType: "reps", targetValue: 80 },
  { id: "ex-1", name: "Cone Handles", durationMin: 12, category: "Basketball", subcategory: "Handles", notes: "Low and fast", metricKeys: ["reps", "time"], targetByMetric: { reps: 80, time: 60 }, trackingType: "reps", targetValue: 80 },
  { id: "ex-10", name: "Cone Drills", durationMin: 10, category: "Basketball", subcategory: "Handles", notes: "Richtungswechsel", metricKeys: ["reps", "time"], targetByMetric: { reps: 40, time: 60 }, trackingType: "reps", targetValue: 40 },
  { id: "ex-2", name: "Mikan Finishes", durationMin: 12, category: "Basketball", subcategory: "Finishing", notes: "Beidseitig abschließen", metricKeys: ["tries", "makes"], targetByMetric: { tries: 80, makes: 60 }, trackingType: "reps", targetValue: 60 },
  { id: "ex-3", name: "Shooting 1", durationMin: 18, category: "Basketball", subcategory: "Shooting", notes: "Nur swishes zhlen", metricKeys: ["tries", "makes"], targetByMetric: { tries: 100, makes: 80 }, trackingType: "reps", targetValue: 80 },
  { id: "ex-4", name: "Shooting 2", durationMin: 20, category: "Basketball", subcategory: "Shooting", notes: "Spot-up 5 Spots", metricKeys: ["tries", "makes"], targetByMetric: { tries: 120, makes: 90 }, trackingType: "reps", targetValue: 90 },
  { id: "ex-5", name: "Bench Press", durationMin: 15, category: "Gym", subcategory: "Push", notes: "Kontrollierte Exzentrik", metricKeys: ["weight", "reps"], targetByMetric: { weight: 70, reps: 8 }, trackingType: "weight", targetValue: 70 },
  { id: "ex-6", name: "Barbell Row", durationMin: 15, category: "Gym", subcategory: "Pull", notes: "Schulterblätter aktiv", metricKeys: ["weight", "reps"], targetByMetric: { weight: 60, reps: 10 }, trackingType: "weight", targetValue: 60 },
  { id: "ex-7", name: "Back Squat", durationMin: 18, category: "Gym", subcategory: "Legs", notes: "Tiefe sauber halten", metricKeys: ["weight", "reps"], targetByMetric: { weight: 90, reps: 6 }, trackingType: "weight", targetValue: 90 },
  { id: "ex-8", name: "Cable Crunch", durationMin: 10, category: "Gym", subcategory: "Core", notes: "Rumpfspannung", metricKeys: ["weight", "reps"], targetByMetric: { weight: 35, reps: 15 }, trackingType: "weight", targetValue: 35 },
  { id: "ex-9", name: "Dead Bug", durationMin: 10, category: "Home", subcategory: "Recovery", notes: "Langsam und kontrolliert", metricKeys: ["reps", "time"], targetByMetric: { reps: 20, time: 45 }, trackingType: "reps", targetValue: 20 },
];

export const defaultWorkouts: Workout[] = [
  { id: "wo-0", name: "Ballhandling Flow", category: "Basketball", subcategory: "Handles", notes: "Handle-Fokus vor Teamtraining", level: 1, exerciseIds: ["ex-0", "ex-10"] },
  { id: "wo-1", name: "Shooting 1", category: "Basketball", subcategory: "Shooting", notes: "Fokus Catch&Shoot", level: 1, exerciseIds: ["ex-3"] },
  { id: "wo-2", name: "Shooting 2", category: "Basketball", subcategory: "Shooting", notes: "Mehr Volumen", level: 2, exerciseIds: ["ex-3", "ex-4"] },
  { id: "wo-3", name: "Shooting 3", category: "Basketball", subcategory: "Shooting", notes: "Game-Speed", level: 3, exerciseIds: ["ex-4"] },
  { id: "wo-4", name: "Gym Push 1", category: "Gym", subcategory: "Push", notes: "Saubere Technik", level: 1, exerciseIds: ["ex-5"] },
  { id: "wo-5", name: "Gym Pull 1", category: "Gym", subcategory: "Pull", notes: "Rücken aktiv", level: 1, exerciseIds: ["ex-6"] },
  { id: "wo-6", name: "Gym Legs 1", category: "Gym", subcategory: "Legs", notes: "Tiefe priorisieren", level: 1, exerciseIds: ["ex-7"] },
  { id: "wo-7", name: "Gym Core 1", category: "Gym", subcategory: "Core", notes: "Rumpfspannung", level: 1, exerciseIds: ["ex-8"] },
];

export const weeklyWorkoutPlan: { day: WeekdayKey; label: string; workoutId: string }[] = [
  { day: "monday", label: "Montag", workoutId: "wo-4" },
  { day: "tuesday", label: "Dienstag", workoutId: "wo-2" },
  { day: "wednesday", label: "Mittwoch", workoutId: "wo-6" },
  { day: "thursday", label: "Donnerstag", workoutId: "wo-3" },
  { day: "friday", label: "Freitag", workoutId: "wo-5" },
  { day: "saturday", label: "Samstag", workoutId: "wo-3" },
  { day: "sunday", label: "Sonntag", workoutId: "wo-7" },
];

export function getWorkoutById(workoutId: string) {
  return defaultWorkouts.find((workout) => workout.id === workoutId);
}

export function getTodayWeekdayKey(date = new Date()): WeekdayKey {
  const day = date.getDay();
  const map: Record<number, WeekdayKey> = {
    0: "sunday",
    1: "monday",
    2: "tuesday",
    3: "wednesday",
    4: "thursday",
    5: "friday",
    6: "saturday",
  };

  return map[day];
}