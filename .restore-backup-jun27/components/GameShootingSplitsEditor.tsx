"use client";

import {
  GAME_TRACK_SHOOTING_ZONE_OPTIONS,
  type GameShootingSplit,
  normalizeGameShootingSplits,
} from "@/lib/game-shooting-splits";

export type GameShootingSplitDraft = {
  id: string;
  zone: GameShootingSplit["zone"];
  makes: string;
  attempts: string;
};

type Props = {
  rows: GameShootingSplitDraft[];
  onChange: (rows: GameShootingSplitDraft[]) => void;
};

function newDraftRow(): GameShootingSplitDraft {
  return {
    id: `gs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    zone: "at_rim",
    makes: "",
    attempts: "",
  };
}

export function gameShootingSplitsFromDrafts(rows: GameShootingSplitDraft[]): GameShootingSplit[] {
  return normalizeGameShootingSplits(
    rows.map((row) => ({
      zone: row.zone,
      makes: Number(row.makes) || 0,
      attempts: Number(row.attempts) || 0,
    })),
  );
}

export function gameShootingSplitDraftsFromSaved(splits: GameShootingSplit[] | undefined): GameShootingSplitDraft[] {
  if (!splits?.length) return [];
  return splits.map((split, index) => ({
    id: `saved-${index}-${split.zone}`,
    zone: split.zone,
    makes: String(split.makes),
    attempts: String(split.attempts),
  }));
}

export default function GameShootingSplitsEditor({ rows, onChange }: Props) {
  const updateRow = (id: string, patch: Partial<GameShootingSplitDraft>) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  return (
    <div className="mt-4 app-card--flat">
      <p className="section-eyebrow">Shooting Splits</p>
      <h3 className="section-title mt-1 text-base">Wurfzonen (optional)</h3>
      <p className="mt-1 text-xs text-muted">
        Makes/Attempts pro Zone — fließen in Stats → Basketball → Shooting Splits ein.
      </p>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-faint">Noch keine Zonen erfasst.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_5rem_5rem_auto] sm:items-end">
              <div>
                <label className="input-label">Zone</label>
                <select
                  value={row.zone}
                  onChange={(event) => updateRow(row.id, { zone: event.target.value as GameShootingSplit["zone"] })}
                  className="select mt-1 w-full"
                >
                  {GAME_TRACK_SHOOTING_ZONE_OPTIONS.map((option) => (
                    <option key={option.zone} value={option.zone}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="input-label">Makes</label>
                <input
                  value={row.makes}
                  onChange={(event) => updateRow(row.id, { makes: event.target.value.replace(/\D/g, "").slice(0, 3) })}
                  inputMode="numeric"
                  className="input mt-1 tabular-nums"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="input-label">Att.</label>
                <input
                  value={row.attempts}
                  onChange={(event) => updateRow(row.id, { attempts: event.target.value.replace(/\D/g, "").slice(0, 3) })}
                  inputMode="numeric"
                  className="input mt-1 tabular-nums"
                  placeholder="0"
                />
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs sm:mb-1"
                onClick={() => onChange(rows.filter((entry) => entry.id !== row.id))}
              >
                Entfernen
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => onChange([...rows, newDraftRow()])}>
        Zone hinzufügen
      </button>
    </div>
  );
}
