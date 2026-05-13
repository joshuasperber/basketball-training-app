"use client";

import { useEffect, useState } from "react";
import BasketballCoachingCard from "@/components/BasketballCoachingCard";
import { buildBasketballCoachingPlan } from "@/lib/basketball-coaching";
import { getProgressionState } from "@/lib/level-system";
import { getWorkoutSessions } from "@/lib/session-storage";

type Props = {
  refreshKey: number;
};

export default function WeeklyBasketballCoach({ refreshKey }: Props) {
  const [plan, setPlan] = useState<ReturnType<typeof buildBasketballCoachingPlan> | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem("profile_cache_v4");
        if (!raw) {
          setPlan(null);
          return;
        }
        const parsed = JSON.parse(raw) as {
          profile?: { favorite_position?: string | null };
          playStyle?: string;
        };
        const sessions = getWorkoutSessions();
        const level = getProgressionState().level;
        setPlan(
          buildBasketballCoachingPlan({
            sessions,
            position: parsed.profile?.favorite_position ?? "sg",
            playStyle: parsed.playStyle ?? "balanced",
            level,
          }),
        );
      } catch {
        setPlan(null);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshKey]);

  if (!plan?.recommendations.length) return null;

  return (
    <BasketballCoachingCard
      title="Basketball: nächste Schwerpunkte"
      recommendations={plan.recommendations}
      windowDays={plan.windowDays}
      compact
    />
  );
}
