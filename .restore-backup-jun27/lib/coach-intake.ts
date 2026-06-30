export const PLAYER_INTAKE_STORAGE_KEY = "bt.player-intake.v1";
export const PLAYER_INTAKE_UPDATED_EVENT = "bt:player-intake-updated";

export type PlayerIntakeV1 = {
  version: 1;
  completedAt: string;
  /** Wenn true: Dialog nicht erneut zeigen, aber keine Antworten an den Coach. */
  skipped?: boolean;
  strengths: string;
  weaknesses: string;
  focusAttention: string;
  ageYears: number | null;
  teamRole: string;
  anythingElse: string;
};

export function loadPlayerIntake(): PlayerIntakeV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PLAYER_INTAKE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlayerIntakeV1>;
    if (parsed?.version !== 1 || typeof parsed.completedAt !== "string") return null;
    return {
      version: 1,
      completedAt: parsed.completedAt,
      skipped: Boolean(parsed.skipped),
      strengths: typeof parsed.strengths === "string" ? parsed.strengths : "",
      weaknesses: typeof parsed.weaknesses === "string" ? parsed.weaknesses : "",
      focusAttention: typeof parsed.focusAttention === "string" ? parsed.focusAttention : "",
      ageYears: typeof parsed.ageYears === "number" && Number.isFinite(parsed.ageYears) ? parsed.ageYears : null,
      teamRole: typeof parsed.teamRole === "string" ? parsed.teamRole : "",
      anythingElse: typeof parsed.anythingElse === "string" ? parsed.anythingElse : "",
    };
  } catch {
    return null;
  }
}

export function savePlayerIntake(data: PlayerIntakeV1) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLAYER_INTAKE_STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new Event(PLAYER_INTAKE_UPDATED_EVENT));
}

export function clearPlayerIntake() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PLAYER_INTAKE_STORAGE_KEY);
  window.dispatchEvent(new Event(PLAYER_INTAKE_UPDATED_EVENT));
}

export function isPlayerIntakeComplete(): boolean {
  return loadPlayerIntake() != null;
}

/** Prüft rohen JSON-String aus Cloud-Sync (user_progress.player_intake). */
export function isPlayerIntakePayloadComplete(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  try {
    const parsed = JSON.parse(raw) as Partial<PlayerIntakeV1>;
    return parsed?.version === 1 && typeof parsed.completedAt === "string" && parsed.completedAt.length > 0;
  } catch {
    return false;
  }
}

export function isPlayerIntakeDoneLocallyOrRemote(remoteRaw: string | null | undefined): boolean {
  return isPlayerIntakeComplete() || isPlayerIntakePayloadComplete(remoteRaw);
}

/** Kompakter Textblock für LLM-Prompts (nur wenn nicht übersprungen und Inhalt vorhanden). */
export function formatPlayerIntakeForPrompt(intake: PlayerIntakeV1 | null): string {
  if (!intake || intake.skipped) return "";
  const parts: string[] = [];
  if (intake.strengths.trim()) parts.push(`Stärken: ${intake.strengths.trim()}`);
  if (intake.weaknesses.trim()) parts.push(`Schwächen: ${intake.weaknesses.trim()}`);
  if (intake.focusAttention.trim()) parts.push(`Worauf achten: ${intake.focusAttention.trim()}`);
  if (intake.ageYears != null && intake.ageYears > 0) parts.push(`Alter: ${intake.ageYears} Jahre`);
  if (intake.teamRole.trim()) parts.push(`Rolle im Team: ${intake.teamRole.trim()}`);
  if (intake.anythingElse.trim()) parts.push(`Sonstiges: ${intake.anythingElse.trim()}`);
  if (parts.length === 0) return "";
  return parts.join("\n");
}

export function intakeToCoachPayload(intake: PlayerIntakeV1 | null) {
  if (!intake || intake.skipped) return undefined;
  return {
    strengths: intake.strengths.trim() || undefined,
    weaknesses: intake.weaknesses.trim() || undefined,
    focusAttention: intake.focusAttention.trim() || undefined,
    ageYears: intake.ageYears != null && intake.ageYears > 0 ? intake.ageYears : undefined,
    teamRole: intake.teamRole.trim() || undefined,
    anythingElse: intake.anythingElse.trim() || undefined,
  };
}
