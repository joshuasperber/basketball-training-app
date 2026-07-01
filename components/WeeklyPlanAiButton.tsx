"use client";

import { useState } from "react";
import type { DayKey } from "@/lib/planner";
import {
  applyWeeklyPlanAiPreview,
  fetchWeeklyPlanAiPreview,
  formatWeekConfigDaySummary,
  type WeeklyPlanAiPreview,
} from "@/lib/weekly-plan-ai-sync";

type Props = {
  className?: string;
  onSynced?: () => void;
};

export default function WeeklyPlanAiButton({ className = "", onSynced }: Props) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<WeeklyPlanAiPreview | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleLoadPreview = async () => {
    if (loading) return;
    setLoading(true);
    setFeedback(null);
    const result = await fetchWeeklyPlanAiPreview(true);
    setLoading(false);
    if (!result.ok || !result.preview) {
      setPreview(null);
      setFeedback(result.message);
      return;
    }
    setPreview(result.preview);
    setFeedback(null);
  };

  const handleApply = async () => {
    if (!preview || applying) return;
    setApplying(true);
    const result = await applyWeeklyPlanAiPreview(preview);
    setApplying(false);
    setFeedback(result.message);
    if (result.ok) {
      setPreview(null);
      onSynced?.();
    }
  };

  const dayLabels: Record<DayKey, string> = {
    monday: "Mo",
    tuesday: "Di",
    wednesday: "Mi",
    thursday: "Do",
    friday: "Fr",
    saturday: "Sa",
    sunday: "So",
  };

  return (
    <div className={className}>
      {!preview ? (
        <button
          type="button"
          onClick={() => void handleLoadPreview()}
          disabled={loading}
          className="btn btn-primary btn-sm whitespace-nowrap"
        >
          {loading ? "Vorschlag wird erstellt…" : "KI-Wochenplan vorschlagen"}
        </button>
      ) : (
        <div className="app-card mt-2 text-left">
          <p className="text-sm font-semibold text-strong">{preview.headline}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted">
            {preview.bullets.slice(0, 5).map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
          {preview.changedDays.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-semibold text-strong">Geänderte Tage ({preview.changedDays.length})</p>
              <ul className="mt-1 space-y-1 text-xs text-muted">
                {preview.changedDays.map((day) => (
                  <li key={day}>{formatWeekConfigDaySummary(day, preview.weekConfig[day])}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted">Keine Abweichung zu deinem aktuellen Wochenrhythmus.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-1">
            {(Object.keys(preview.weekConfig) as DayKey[]).map((day) => {
              const entry = preview.weekConfig[day];
              const changed = preview.changedDays.includes(day);
              return (
                <span key={day} className={`chip chip-sm text-xs ${changed ? "chip-active" : ""}`}>
                  {dayLabels[day]} {entry.mode} {entry.minutes > 0 ? `${entry.minutes}m` : ""}
                </span>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={applying}
              onClick={() => void handleApply()}
            >
              {applying ? "Wird übernommen…" : "Plan übernehmen"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview(null)}>
              Verwerfen
            </button>
          </div>
        </div>
      )}
      {feedback ? <p className="mt-2 text-xs text-muted">{feedback}</p> : null}
    </div>
  );
}
