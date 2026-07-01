import type { OpponentStyleTag } from "@/lib/opponent-styles";
import type { FormScoreResult } from "@/lib/form-score";
import type { ShootingZoneTotals } from "@/lib/shooting-zone-stats";

export type TeamRole = "owner" | "captain" | "player" | "coach";
export type TeamShareLevel = "summary" | "full";

export type TeamSummary = {
  id: string;
  name: string;
  season: string | null;
  clubName: string | null;
  memberCount: number;
  role: TeamRole;
};

export type TeamMemberView = {
  id: string;
  userId: string;
  role: TeamRole;
  displayName: string;
  position: string | null;
  playStyle: string | null;
  shareLevel: TeamShareLevel;
  form: FormScoreResult;
  recentGames: number;
  recentWorkouts: number;
  shootingZoneTotals?: ShootingZoneTotals | null;
  gameTrainingInsight?: string | null;
};

export type OpponentScoutingEntry = {
  id: string;
  opponentName: string;
  styles: OpponentStyleTag[];
  notes: string | null;
  updatedAt: string;
};

export type TeamMemberWeekPlan = {
  memberId: string;
  userId: string;
  displayName: string;
  days: Array<{ day: import("@/lib/planner").DayKey; mode: string; minutes: number; label: string }>;
};

export type TeamDetail = {
  team: {
    id: string;
    name: string;
    season: string | null;
    clubName: string | null;
  };
  members: TeamMemberView[];
  scouting: OpponentScoutingEntry[];
  inviteToken?: string | null;
  memberWeekPlans?: TeamMemberWeekPlan[];
  syncMeta?: {
    progressFound: boolean;
    workouts14d: number;
    membersWithProgress: number;
  };
};

export type TeamCoachRequest = {
  intent: "team_advice";
  teamId: string;
  opponentName?: string;
  opponentStyles?: OpponentStyleTag[];
};

export type TeamCoachResponse = {
  headline: string;
  bullets: string[];
  starters: string[];
  matchupHints: string[];
  source: "llm" | "heuristic";
};
