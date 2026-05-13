import { storedRegenerationSignals } from "@/lib/activity-calendar";

/** Liegt auf dem Weekly-Board eine sichtbare Regenerations-Zusatzkarte („recovery-…“)? */
export function weeklyRecoverySuggestionSlotVisible(params: {
  manualDateKey: string;
  dayManualEntries: { sport: string }[];
  isDayDisabled: boolean;
  /** Anzeige-/Ruhetag-Logik wie im Weekly-Header (Manual dominiert, sonst Auto). */
  headlineSuggestedWorkout: { sport?: string; durationMin?: number } | null;
  autoSuggestedWorkout: { sport?: string } | null;
  hiddenCardIds: Set<string>;
}): boolean {
  const hasManualWorkout = params.dayManualEntries.length > 0;
  const sw = params.headlineSuggestedWorkout;
  const isRestDisplay =
    !hasManualWorkout &&
    (params.isDayDisabled || (sw?.durationMin ?? 0) <= 0 || sw?.sport === "-");
  if (isRestDisplay) return false;
  if (params.autoSuggestedWorkout?.sport === "Regeneration") return false;
  if (storedRegenerationSignals(params.manualDateKey)) return false;
  if (params.dayManualEntries[0]?.sport === "Rest") return false;
  const recoveryCardId = `recovery-${params.manualDateKey}`;
  if (params.hiddenCardIds.has(recoveryCardId)) return false;
  return true;
}
