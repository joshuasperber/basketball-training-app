import type { Exercise } from "@/lib/training-data";

export type ProgressionModality = "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight";

/** Klare Gym-Progression: keine 1,25 kg-Sprünge; Kurzhantel = +2,5 kg pro Hand (+5 kg Gesamtlast bilateral). */
export function inferProgressionModality(exercise: Exercise): ProgressionModality {
  if (exercise.progressionModality) return exercise.progressionModality;
  const name = exercise.name.toLowerCase();
  if (
    name.includes("kurzhantel") ||
    name.includes("dumbbell") ||
    name.includes("db ") ||
    name.startsWith("db ")
  ) {
    return "dumbbell";
  }
  if (name.includes("kettlebell")) return "dumbbell";
  if (name.includes("cable") || name.includes("seilzug") || name.includes("_lat")) return "cable";
  if (
    name.includes("machine") ||
    name.includes("leg press") ||
    name.includes("beinpresse") ||
    name.includes("smith")
  ) {
    return "machine";
  }
  if (
    name.includes("bodyweight") ||
    name.includes("eigengewicht") ||
    name.includes("push-up") ||
    name.includes("pull-up") ||
    name.includes("klimmzug") ||
    name.includes("dip ")
  ) {
    return "bodyweight";
  }
  if (exercise.category === "Gym" && exercise.metricKeys.includes("weight")) return "barbell";
  return "bodyweight";
}

/** Mindest-Sprung für nächste Laststeigerung (kg). Kurzhantel: Gesamtlast-Bench z. B. +5 (je Hand +2,5). */
export function minimumWeightIncrementKg(modality: ProgressionModality): number {
  switch (modality) {
    case "barbell":
    case "machine":
      return 5;
    case "dumbbell":
      return 5;
    case "cable":
      return 2.5;
    case "bodyweight":
      return 0;
    default:
      return 5;
  }
}

export function progressionModalityHintDE(modality: ProgressionModality): string {
  switch (modality) {
    case "dumbbell":
      return "Kurzhantel: Erhöhung als +5 kg Gesamtlast (typisch je Hand +2,5 kg).";
    case "barbell":
      return "Langhantel / große Scheiben: nächste Steigerung mindestens +5 kg.";
    case "machine":
      return "Maschine / gleiche Scheiben wie LH: mindestens +5 kg.";
    case "cable":
      return "Seilzug: nächste Steigerung typisch +2,5 kg.";
    case "bodyweight":
      return "Ohne zusätzliche Last: Progression über Wiederholungen oder Sätze.";
    default:
      return "";
  }
}

/** Nächste Arbeitshöhe mit gültigem Scheiben-Schritt (abrunden auf erreichbare Sprünge). */
export function nextWorkingWeightKg(currentKg: number, modality: ProgressionModality): number {
  const step = minimumWeightIncrementKg(modality);
  if (step <= 0) return Math.max(0, currentKg);
  return Math.round((currentKg + step) * 10) / 10;
}
