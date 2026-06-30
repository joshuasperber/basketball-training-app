"use client";

import { useEffect, useState } from "react";
import { findGameStatByDateAndContext } from "@/lib/game-stats";
import { saveGameStatAndSync } from "@/lib/services/game-stats-sync";
import {
  OPPONENT_STYLE_LABELS,
  OPPONENT_STYLE_TAGS,
  toggleOpponentStyle,
  type OpponentStyleTag,
} from "@/lib/opponent-styles";
import type { GamePlanContext } from "@/lib/game-plan-ids";
import { spieltagGameStatDefaults } from "@/lib/spieltag-defaults";

type Props = {
  dateKey: string;
  context: GamePlanContext;
  onSaved?: () => void;
};

export default function WeeklyGamePrepPanel({ dateKey, context, onSaved }: Props) {
  const [opponentLabel, setOpponentLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [styles, setStyles] = useState<OpponentStyleTag[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedHint, setSavedHint] = useState(false);

  useEffect(() => {
    const entry = findGameStatByDateAndContext(dateKey, context);
    setOpponentLabel(entry?.opponentLabel ?? "");
    setNotes(entry?.notes ?? "");
    setStyles(entry?.opponentStyles ?? []);
    setSavedHint(false);
  }, [dateKey, context]);

  const save = async () => {
    setSaving(true);
    try {
      const existing = findGameStatByDateAndContext(dateKey, context);
      await saveGameStatAndSync({
        id: existing?.id,
        date: dateKey,
        context,
        opponentLabel: opponentLabel.trim() || null,
        opponentStyles: styles,
        notes: notes.trim() || undefined,
        minutes: existing?.minutes ?? null,
        points: existing?.points ?? null,
        assists: existing?.assists ?? null,
        rebounds: existing?.rebounds ?? null,
        steals: existing?.steals ?? null,
        ...spieltagGameStatDefaults(context),
      });
      setSavedHint(true);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const contextLabel = context === "game" ? "Spieltag" : "Spieltraining";

  return (
    <div id={`weekly-game-prep-${dateKey}`} className="weekly-game-prep">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="section-eyebrow">{contextLabel} · Vorbereitung</p>
        {savedHint ? <span className="text-xs hint-success">Gespeichert</span> : null}
      </div>
      <label className="input-label mt-2 block">
        Gegner / Turnier
        <input
          value={opponentLabel}
          onChange={(event) => setOpponentLabel(event.target.value)}
          placeholder="z. B. Team XYZ, Hallenturnier …"
          className="input mt-1"
        />
      </label>
      <div className="mt-3">
        <p className="input-label">Gegner-Stärken</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {OPPONENT_STYLE_TAGS.map((tag) => {
            const active = styles.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setStyles((current) => toggleOpponentStyle(current, tag))}
                className={`chip ${active ? "chip-active" : ""}`}
              >
                {OPPONENT_STYLE_LABELS[tag]}
              </button>
            );
          })}
        </div>
      </div>
      <label className="input-label mt-3 block">
        Aufstellung &amp; Notizen
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          placeholder="Matchup, Start-Five, Fokus gegen Zone/Press …"
          className="textarea mt-1"
        />
      </label>
      <div className="mt-3">
        <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => void save()}>
          {saving ? "Speichern …" : "Spiel-Infos speichern"}
        </button>
      </div>
    </div>
  );
}
