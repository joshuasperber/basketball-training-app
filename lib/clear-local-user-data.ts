import {
  DAILY_PLAN_KEY,
  MANUAL_DAY_DISABLED_KEY,
  MANUAL_DAY_WORKOUTS_KEY,
  MANUAL_PLAN_OVERRIDES_KEY,
  WEEKLY_REGEN_SLOT_MAP_KEY,
} from "@/lib/activity-calendar";
import { PLAYER_INTAKE_STORAGE_KEY } from "@/lib/coach-intake";
import { GAME_STATS_KEY } from "@/lib/game-stats";
import { LEAGUE_STORAGE_KEY } from "@/lib/league";
import { TRAINING_GOALS_STORAGE_KEY } from "@/lib/training-goals";
import { TEAM_LIST_CACHE_KEY } from "@/lib/team-local-cache";
import { REMINDER_PREFS_KEY } from "@/lib/workout-reminders";
import { WORKOUT_OVERRIDE_PREFIX } from "@/lib/workout";

const EXERCISE_HISTORY_KEY = "bt.exercise-history.v1";
const WORKOUT_SESSIONS_KEY = "bt.workout-sessions.v1";
const PROFILE_LOCAL_CACHE_KEY = "profile_cache_v4";
const PROFILE_USERNAME_KEY = "profile_username";
const PROFILE_WEEK_CONFIG_KEY = "bt.profile-week-config.v1";
const XP_HISTORY_KEY = "bt.xp-history.v1";
const XP_PROGRESSION_KEY = "bt.progression.v1";
const HIDDEN_AUTO_WORKOUTS_KEY = "bt.hidden-auto-workouts.v1";
const PERFORMANCE_TIPS_KEY = "bt.performance-tips.v1";
const CUSTOM_SUBCATEGORY_KEY = "bt.custom-subcategories.v1";
const WORKOUT_HISTORY_KEY = "bt.workout-history.v1";
const LEGACY_REMINDER_PREFS_KEY = "bt.workout-reminders.v1";
const COACH_WEEKLY_NOTE_STORAGE_KEY = "bt.coach-weekly-context";
const TRAINING_EXERCISES_KEY = "training-exercises-v1";
const TRAINING_WORKOUTS_KEY = "training-workouts-v1";
const CLOUD_UPDATED_AT_KEY = "bt.cloud-updated-at.v1";
export const SYNC_USER_ID_KEY = "bt.sync-user-id.v1";

const STRING_KEYS = [
  MANUAL_PLAN_OVERRIDES_KEY,
  PROFILE_LOCAL_CACHE_KEY,
  PROFILE_USERNAME_KEY,
  PROFILE_WEEK_CONFIG_KEY,
  PLAYER_INTAKE_STORAGE_KEY,
  XP_HISTORY_KEY,
  XP_PROGRESSION_KEY,
  PERFORMANCE_TIPS_KEY,
  GAME_STATS_KEY,
  LEAGUE_STORAGE_KEY,
  TRAINING_GOALS_STORAGE_KEY,
  CUSTOM_SUBCATEGORY_KEY,
  WORKOUT_HISTORY_KEY,
  REMINDER_PREFS_KEY,
  LEGACY_REMINDER_PREFS_KEY,
  COACH_WEEKLY_NOTE_STORAGE_KEY,
  TRAINING_EXERCISES_KEY,
  TRAINING_WORKOUTS_KEY,
  CLOUD_UPDATED_AT_KEY,
  SYNC_USER_ID_KEY,
  EXERCISE_HISTORY_KEY,
  WORKOUT_SESSIONS_KEY,
  DAILY_PLAN_KEY,
  MANUAL_DAY_WORKOUTS_KEY,
  MANUAL_DAY_DISABLED_KEY,
  WEEKLY_REGEN_SLOT_MAP_KEY,
  HIDDEN_AUTO_WORKOUTS_KEY,
  TEAM_LIST_CACHE_KEY,
];

/** Entfernt nutzergebundene Trainings-/Profildaten — z. B. bei Account-Wechsel oder frischer Registrierung. */
export function clearLocalUserProgress() {
  if (typeof window === "undefined") return;

  for (const key of STRING_KEYS) {
    window.localStorage.removeItem(key);
  }

  const overrideKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(WORKOUT_OVERRIDE_PREFIX)) overrideKeys.push(key);
    if (key?.startsWith("bt.workout-progress.")) overrideKeys.push(key);
    if (key?.startsWith("bt.team-detail.v1:")) overrideKeys.push(key);
  }
  for (const key of overrideKeys) {
    window.localStorage.removeItem(key);
  }

  window.dispatchEvent(new Event("bt:plan-updated"));
  window.dispatchEvent(new Event("bt:player-intake-updated"));
}
