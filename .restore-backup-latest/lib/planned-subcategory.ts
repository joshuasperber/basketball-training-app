import type { Category } from "@/lib/training-data";
import type { PlannedWorkoutTag } from "@/lib/activity-calendar";

const PREFIX_BY_CATEGORY: Partial<Record<Category, string>> = {
  Basketball: "Basketball:",
  Gym: "Gym:",
  Home: "Home:",
  Regeneration: "Recovery:",
};

export function getPlannedSubcategoryFromTags(tags: PlannedWorkoutTag[], category: Category): string | null {
  const prefix = PREFIX_BY_CATEGORY[category];
  if (!prefix) return null;
  const tag = tags.find((entry) => entry.startsWith(prefix));
  if (!tag) return null;
  return tag.slice(prefix.length) || null;
}
