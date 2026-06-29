"use client";

import { useState } from "react";
import { syncWeeklyPlanFromAi } from "@/lib/weekly-plan-ai-sync";

type Props = {
  className?: string;
  onSynced?: () => void;
};

export default function WeeklyPlanAiButton({ className = "", onSynced }: Props) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    setFeedback(null);
    const result = await syncWeeklyPlanFromAi(true);
    setFeedback(result.message);
    setLoading(false);
    if (result.ok) onSynced?.();
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={loading}
        className="btn btn-primary btn-sm whitespace-nowrap"
      >
        {loading ? "Plan wird erstellt…" : "KI-Wochenplan"}
      </button>
      {feedback ? <p className="mt-2 text-xs text-muted">{feedback}</p> : null}
    </div>
  );
}
