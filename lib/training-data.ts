export type Category = "Basketball" | "Gym" | "Home";

export type Exercise = {
  id: string;
  name: string;
  category: Category;
  subcategory: string;
  trackingType: "reps" | "weight";
  targetValue?: number;
};

export type Workout = {
  id: string;
  name: string;
  category: Category;
  subcategory: string;
  level: number;
  exerciseIds: string[];
};

export const categories: Category[] = ["Basketball", "Gym", "Home"];

export const subcategoriesByCategory: Record<Category, string[]> = {
  Basketball: ["Handles", "Finishing", "Shooting", "Defense"],
  Gym: ["Upper Body", "Lower Body", "Core"],
  Home: ["Mobility", "Conditioning", "Recovery"],
};

export const defaultExercises: Exercise[] = [
  { id: "ex-1", name: "Cone Handles", category: "Basketball", subcategory: "Handles", trackingType: "reps", targetValue: 80 },
  { id: "ex-2", name: "Mikan Finishes", category: "Basketball", subcategory: "Finishing", trackingType: "reps", targetValue: 60 },
  { id: "ex-3", name: "Shooting 1", category: "Basketball", subcategory: "Shooting", trackingType: "reps", targetValue: 80 },
  { id: "ex-4", name: "Shooting 2", category: "Basketball", subcategory: "Shooting", trackingType: "reps", targetValue: 90 },
  { id: "ex-5", name: "Bench Press", category: "Gym", subcategory: "Upper Body", trackingType: "weight", targetValue: 70 },
  { id: "ex-6", name: "Goblet Squat", category: "Gym", subcategory: "Lower Body", trackingType: "weight", targetValue: 30 },
  { id: "ex-7", name: "Plank Hold", category: "Home", subcategory: "Conditioning", trackingType: "reps", targetValue: 3 },
];

export const defaultWorkouts: Workout[] = [
  { id: "wo-1", name: "Shooting 1", category: "Basketball", subcategory: "Shooting", level: 1, exerciseIds: ["ex-3"] },
  { id: "wo-2", name: "Shooting 2", category: "Basketball", subcategory: "Shooting", level: 2, exerciseIds: ["ex-3", "ex-4"] },
  { id: "wo-3", name: "Shooting 3", category: "Basketball", subcategory: "Shooting", level: 3, exerciseIds: ["ex-4"] },
];