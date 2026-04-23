import { type Category, type Exercise } from "@/lib/training-data";
import { type DayKey } from "@/lib/planner";

export type PlayerPosition = "pg" | "sg" | "sf" | "pf" | "c";

export type PlayerArchetypeInput = {
  position: string;
  playStyle: string;
};

export type FocusProfile = {
  basketball: string[];
  gym: string[];
};

export type GeneratedWorkout = {
  id: string;
  name: string;
  category: Category;
  subcategory: string;
  exerciseIds: string[];
  exerciseNames: string[];
  durationMin: number;
  notes: string;
};

function getSeedIndex(seedSource: string, length: number) {
  if (length <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < seedSource.length; i += 1) {
    hash = (hash * 31 + seedSource.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

function rotateArray<T>(items: T[], start: number) {
  if (items.length <= 1) return items;
  const offset = ((start % items.length) + items.length) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function normalizeExerciseFamily(name: string) {
  return name
    .toLowerCase()
    .replace(/\s*-\s*(rechts|links|right|left)\b/g, "")
    .replace(/\s*[-–]?\s*\d+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const DEFAULT_FOCUS: FocusProfile = {
  basketball: ["Handles", "Finishing", "Shooting", "Conditioning", "Komplett"],
  gym: ["Legs", "Core", "Pull", "Push"],
};

const ARCHETYPE_MAP: Record<string, FocusProfile> = {
  "pg:athletisch": {
    basketball: ["Handles", "Finishing", "Shooting", "Conditioning"],
    gym: ["Legs", "Core", "Pull", "Push"],
  },
  "sg:shooter": {
    basketball: ["Shooting", "Handles", "Finishing", "Conditioning"],
    gym: ["Pull", "Core", "Push", "Legs"],
  },
  "sf:slasher": {
    basketball: ["Finishing", "Conditioning", "Handles", "Shooting"],
    gym: ["Legs", "Pull", "Core", "Push"],
  },
  "pf:post": {
    basketball: ["Finishing", "Conditioning", "Komplett", "Shooting"],
    gym: ["Legs", "Push", "Pull", "Core"],
  },
  "c:rim-protector": {
    basketball: ["Conditioning", "Finishing", "Komplett", "Shooting"],
    gym: ["Legs", "Pull", "Push", "Core"],
  },
};

function normalizePosition(position: string): PlayerPosition {
  const lower = position.trim().toLowerCase();
  if (lower === "pg" || lower === "sg" || lower === "sf" || lower === "pf" || lower === "c") {
    return lower;
  }

  return "sg";
}

function normalizeStyle(playStyle: string) {
  const lower = playStyle.trim().toLowerCase();
  if (lower.includes("handle")) return "ballhandling";
  if (lower.includes("finish")) return "finishing";
  if (lower.includes("condition")) return "conditioning";
  if (lower.includes("athlet")) return "athletisch";
  if (lower.includes("shoot")) return "shooter";
  if (lower.includes("slash")) return "slasher";
  if (lower.includes("post")) return "post";
  if (lower.includes("rim") || lower.includes("protector")) return "rim-protector";
  return "balanced";
}

export function getFocusProfile(input: PlayerArchetypeInput): FocusProfile {
  const position = normalizePosition(input.position);
  const style = normalizeStyle(input.playStyle);

  const exact = ARCHETYPE_MAP[`${position}:${style}`];
  if (exact) return exact;

  if (style === "ballhandling") {
    return { basketball: ["Handles", "Shooting", "Finishing", "Conditioning"], gym: DEFAULT_FOCUS.gym };
  }
  if (style === "finishing") {
    return { basketball: ["Finishing", "Handles", "Conditioning", "Shooting"], gym: DEFAULT_FOCUS.gym };
  }
  if (style === "conditioning") {
    return { basketball: ["Conditioning", "Finishing", "Handles", "Shooting"], gym: DEFAULT_FOCUS.gym };
  }

  const positionFallback = Object.entries(ARCHETYPE_MAP).find(([key]) => key.startsWith(`${position}:`))?.[1];
  return positionFallback ?? DEFAULT_FOCUS;
}

function pickByUsage(
  priorities: string[],
  usage: Record<string, number>,
  maxPerFocus: number,
  available: string[],
): string {
  const availableSet = new Set(available);

  const candidate = priorities.find((focus) => availableSet.has(focus) && (usage[focus] ?? 0) < maxPerFocus);
  if (candidate) return candidate;

  const fallback = available
    .slice()
    .sort((left, right) => (usage[left] ?? 0) - (usage[right] ?? 0))[0];

  return fallback ?? priorities[0] ?? "Komplett";
}

export function pickSubcategoryForDay(params: {
  category: Category;
  focusProfile: FocusProfile;
  usage: Record<string, number>;
  availableSubcategories: string[];
}): string {
  const priorities = params.category === "Gym" ? params.focusProfile.gym : params.focusProfile.basketball;
  const maxPerFocus = params.category === "Gym" ? 2 : 2;

  return pickByUsage(priorities, params.usage, maxPerFocus, params.availableSubcategories);
}

export function buildGeneratedWorkout(params: {
  day: DayKey;
  category: Category;
  subcategory: string;
  targetMinutes: number;
  exercisePool: Exercise[];
}): GeneratedWorkout {
  if (params.subcategory === "Komplett") {
    const fullCategoryPool = params.exercisePool
      .filter((exercise) => exercise.category === params.category)
      .sort((left, right) => left.name.localeCompare(right.name));

    if (fullCategoryPool.length === 0) {
      return {
        id: `auto-${params.day}-${params.category.toLowerCase()}`,
        name: `Auto ${params.subcategory}`,
        category: params.category,
        subcategory: params.subcategory,
        exerciseIds: [],
        exerciseNames: ["Keine passende Exercise gefunden"],
        durationMin: Math.max(20, params.targetMinutes),
        notes: "Keine Übungen in der Datenbank gefunden. Bitte Exercise-Pool erweitern.",
      };
    }

    const totalDuration = fullCategoryPool.reduce((sum, exercise) => sum + exercise.durationMin, 0);
    return {
      id: `auto-${params.day}-${params.category.toLowerCase()}-${params.subcategory.toLowerCase()}`,
      name: `Auto ${params.subcategory}`,
      category: params.category,
      subcategory: params.subcategory,
      exerciseIds: fullCategoryPool.map((exercise) => exercise.id),
      exerciseNames: fullCategoryPool.map((exercise) => exercise.name),
      durationMin: Math.max(totalDuration, Math.max(20, params.targetMinutes)),
      notes: "Komplett gewählt: enthält alle Exercises der Kategorie.",
    };
  }

  const relevantExercises = params.exercisePool
    .filter((exercise) => exercise.category === params.category && exercise.subcategory === params.subcategory)
    .sort((left, right) => left.durationMin - right.durationMin);

  const fallbackExercises = params.exercisePool.filter((exercise) => exercise.category === params.category);
  const source = relevantExercises.length > 0 ? relevantExercises : fallbackExercises;
  const groupedByFamily = source.reduce(
    (accumulator, exercise) => {
      const key = normalizeExerciseFamily(exercise.name);
      const current = accumulator.get(key) ?? [];
      current.push(exercise);
      accumulator.set(key, current);
      return accumulator;
    },
    new Map<string, Exercise[]>(),
  );
  const groupedFamilies = Array.from(groupedByFamily.values())
    .map((items) => items.sort((left, right) => left.name.localeCompare(right.name)));
  const rotatedSource = rotateArray(
    groupedFamilies,
    getSeedIndex(`${params.day}-${params.subcategory}-${params.category}`, groupedFamilies.length),
  );

  const picked: Exercise[] = [];
  let totalDuration = 0;

  for (const family of rotatedSource) {
    picked.push(...family);
    totalDuration += family.reduce((sum, exercise) => sum + exercise.durationMin, 0);

    if (totalDuration >= Math.max(20, params.targetMinutes - 5) && picked.length >= 2) {
      break;
    }
  }

  if (picked.length === 0) {
    return {
      id: `auto-${params.day}-${params.category.toLowerCase()}`,
      name: `Auto ${params.subcategory}`,
      category: params.category,
      subcategory: params.subcategory,
      exerciseIds: [],
      exerciseNames: ["Keine passende Exercise gefunden"],
      durationMin: Math.max(20, params.targetMinutes),
      notes: "Keine Übungen in der Datenbank gefunden. Bitte Exercise-Pool erweitern.",
    };
  }

  return {
    id: `auto-${params.day}-${params.category.toLowerCase()}-${params.subcategory.toLowerCase()}`,
    name: `Auto ${params.subcategory}`,
    category: params.category,
    subcategory: params.subcategory,
    exerciseIds: picked.map((exercise) => exercise.id),
    exerciseNames: picked.map((exercise) => exercise.name),
    durationMin: Math.max(totalDuration, Math.max(20, params.targetMinutes)),
    notes: "Automatisch generiert aus vorhandenem Exercise-Pool.",
  };
}