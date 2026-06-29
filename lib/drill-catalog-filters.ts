import type { Exercise } from "@/lib/training-data";

export type DrillVideoFilter = "all" | "with" | "without";
export type DrillDurationFilter = "all" | "under10" | "under15";
/** Gym = Kategorie Gym, Heim = Home, Outdoor = Basketball (Feld/Halle) */
export type DrillEquipmentFilter = "all" | "gym" | "home" | "outdoor";

export type DrillCatalogFilters = {
  video: DrillVideoFilter;
  duration: DrillDurationFilter;
  equipment: DrillEquipmentFilter;
};

export const DEFAULT_DRILL_FILTERS: DrillCatalogFilters = {
  video: "all",
  duration: "all",
  equipment: "all",
};

export function countActiveDrillFilters(filters: DrillCatalogFilters): number {
  let count = 0;
  if (filters.video !== "all") count += 1;
  if (filters.duration !== "all") count += 1;
  if (filters.equipment !== "all") count += 1;
  return count;
}

export function exerciseDurationMinutes(exercise: Exercise): number {
  const raw = Math.max(0, exercise.durationMin ?? 0);
  if (exercise.timeUnit === "seconds") return raw / 60;
  return raw;
}

export function matchesDrillCatalogFilters(exercise: Exercise, filters: DrillCatalogFilters): boolean {
  const url = exercise.videoUrl?.trim();
  if (filters.video === "with" && !url) return false;
  if (filters.video === "without" && url) return false;

  const minutes = exerciseDurationMinutes(exercise);
  if (filters.duration === "under10" && minutes >= 10) return false;
  if (filters.duration === "under15" && minutes >= 15) return false;

  if (filters.equipment === "gym" && exercise.category !== "Gym") return false;
  if (filters.equipment === "home" && exercise.category !== "Home") return false;
  if (filters.equipment === "outdoor" && exercise.category !== "Basketball") return false;

  return true;
}
