import {
  markDateAsManualOverride,
  readDailyPlanMap,
  writeDailyPlanMap,
  type PlannedWorkoutTag,
} from "@/lib/activity-calendar";
import { gamePlanId, type GamePlanContext } from "@/lib/game-plan-ids";
import { getDateForWeekday, toLocalDateKey } from "@/lib/workout";

export type ManualGameKind = "game" | "game_training";

function mergeGameTags(existing: PlannedWorkoutTag[], kind: ManualGameKind): PlannedWorkoutTag[] {
  const next = [...existing];
  const gameTag: PlannedWorkoutTag = kind === "game" ? "Spieltag" : "Spieltraining";
  if (!next.includes(gameTag)) {
    next.push(gameTag);
  }
  if (!next.includes("Basketball:Warm-Up")) {
    next.push("Basketball:Warm-Up");
  }
  return next;
}

function gameTagForKind(kind: ManualGameKind): PlannedWorkoutTag {
  return kind === "game" ? "Spieltag" : "Spieltraining";
}

function stripWarmupIfNoGame(tags: PlannedWorkoutTag[]): PlannedWorkoutTag[] {
  const hasGame = tags.includes("Spieltag") || tags.includes("Spieltraining");
  if (hasGame) return tags;
  return tags.filter((tag) => tag !== "Basketball:Warm-Up");
}

export function addManualGameForDate(dateKey: string, kind: ManualGameKind) {
  if (typeof window === "undefined") return null;
  const map = readDailyPlanMap();
  const existing = map[dateKey] ?? [];
  const otherTag: PlannedWorkoutTag = kind === "game" ? "Spieltraining" : "Spieltag";
  const cleaned = existing.filter((tag) => tag !== otherTag);
  map[dateKey] = mergeGameTags(cleaned, kind);
  writeDailyPlanMap(map);
  markDateAsManualOverride(dateKey);
  window.dispatchEvent(new Event("bt:plan-updated"));
  return dateKey;
}

/** Spieltag oder Spieltraining für einen Wochentag (Kalenderwoche) eintragen — Tags werden ergänzt, nicht überschrieben. */
export function addManualGameToWeekday(dayIndex: number, kind: ManualGameKind) {
  if (typeof window === "undefined") return null;
  const dateKey = toLocalDateKey(getDateForWeekday(dayIndex));
  return addManualGameForDate(dateKey, kind);
}

/** Spieltag oder Spieltraining für einen Wochentag entfernen (auch Profil-Spieltage überschreiben). */
export function removeManualGameFromWeekday(dayIndex: number, kind: ManualGameKind) {
  if (typeof window === "undefined") return null;
  const dateKey = toLocalDateKey(getDateForWeekday(dayIndex));
  const map = readDailyPlanMap();
  const gameTag = gameTagForKind(kind);
  const existing = map[dateKey] ?? [];
  const nextTags = stripWarmupIfNoGame(existing.filter((tag) => tag !== gameTag));
  map[dateKey] = nextTags;
  writeDailyPlanMap(map);
  markDateAsManualOverride(dateKey);
  window.dispatchEvent(new Event("bt:plan-updated"));
  return dateKey;
}

export function removeManualGameForDate(dateKey: string, context: GamePlanContext) {
  if (typeof window === "undefined") return null;
  const kind: ManualGameKind = context === "game_training" ? "game_training" : "game";
  const map = readDailyPlanMap();
  const gameTag = gameTagForKind(kind);
  const existing = map[dateKey] ?? [];
  const nextTags = stripWarmupIfNoGame(existing.filter((tag) => tag !== gameTag));
  map[dateKey] = nextTags;
  writeDailyPlanMap(map);
  markDateAsManualOverride(dateKey);
  window.dispatchEvent(new Event("bt:plan-updated"));
  return gamePlanId(dateKey, context);
}

export function addManualGameToday(kind: ManualGameKind) {
  return addManualGameToWeekday(new Date().getDay(), kind);
}
