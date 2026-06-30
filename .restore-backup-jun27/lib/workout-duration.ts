/** Summe der Übungsminuten; optional +10 % Puffer wie im Weekly-Katalog. */
export function roundUpToNearestFive(value: number) {
  return Math.ceil(Math.max(0, value) / 5) * 5;
}

export function sumExerciseIdsDurationMin(
  exerciseIds: string[],
  exercisesById: Record<string, { durationMin?: number } | undefined>,
  options?: { buffer?: boolean },
): number {
  const raw = exerciseIds.reduce((sum, exerciseId) => sum + (exercisesById[exerciseId]?.durationMin ?? 10), 0);
  const withBuffer = options?.buffer === false ? raw : raw * 1.1;
  return roundUpToNearestFive(withBuffer);
}
