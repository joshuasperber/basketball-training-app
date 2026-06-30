"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildGameTrainingCorrelation,
  describeCorrelationStrength,
  type GameTrainingCorrelation,
} from "@/lib/game-training-insights";
import { loadGameStats } from "@/lib/game-stats";
import { getWorkoutSessions } from "@/lib/session-storage";

function StatCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[10px] uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-strong">{value}</p>
      {hint ? <p className="mt-1 text-[10px] text-muted">{hint}</p> : null}
    </div>
  );
}

export default function GameTrainingInsights() {
  const [data, setData] = useState<GameTrainingCorrelation | null>(null);

  useEffect(() => {
    const refresh = () => {
      const games = loadGameStats();
      const sessions = getWorkoutSessions();
      setData(buildGameTrainingCorrelation(games, sessions));
    };
    refresh();
    window.addEventListener("bt:game-stats-updated", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("bt:game-stats-updated", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const correlationLabel = useMemo(() => {
    if (!data) return "Lade…";
    return describeCorrelationStrength(data.correlationPointsVsPrep);
  }, [data]);

  if (!data) return null;

  const totalGames = data.withTraining.count + data.withoutTraining.count;
  if (totalGames === 0) {
    return (
      <section className="app-card">
        <p className="section-eyebrow">Game ↔ Training</p>
        <h3 className="section-title mt-1">Spiel vs. Vorbereitung</h3>
        <p className="mt-2 text-sm text-muted">
          Trag Spiele unter „Spiel tracken“ ein, um zu sehen wie sich Training auf deine Leistung auswirkt.
        </p>
      </section>
    );
  }

  const deltaPoints = data.withTraining.avgPoints - data.withoutTraining.avgPoints;

  return (
    <section className="app-card--accent-violet">
      <p className="section-eyebrow">Game ↔ Training</p>
      <h3 className="section-title mt-1">Spiel vs. Vorbereitung</h3>
      <p className="mt-1 text-xs text-muted">
        Vergleicht Spiel-Stats nach Vorbereitungsgrad (Trainings in den 3 Tagen davor).
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <StatCell
          label="Mit Vorbereitung"
          value={`${data.withTraining.avgPoints.toFixed(1)} Pkt`}
          hint={`${data.withTraining.count} Spiele · ${data.withTraining.avgAssists.toFixed(1)} A · ${data.withTraining.avgRebounds.toFixed(1)} R`}
        />
        <StatCell
          label="Ohne Vorbereitung"
          value={`${data.withoutTraining.avgPoints.toFixed(1)} Pkt`}
          hint={`${data.withoutTraining.count} Spiele · ${data.withoutTraining.avgAssists.toFixed(1)} A · ${data.withoutTraining.avgRebounds.toFixed(1)} R`}
        />
        <StatCell
          label="Δ Punkte"
          value={`${deltaPoints >= 0 ? "+" : ""}${deltaPoints.toFixed(1)}`}
          hint={correlationLabel}
        />
      </div>

      {data.recentGames.length > 0 ? (
        <div className="mt-4">
          <p className="section-eyebrow">Letzte Spiele</p>
          <ul className="mt-2 space-y-2">
            {data.recentGames.map((entry) => {
              if (!entry.game) return null;
              const prep = entry.trainingsLast3Days;
              const indicator =
                prep >= 2 ? "🔥" : prep === 1 ? "✓" : "·";
              return (
                <li
                  key={entry.game.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-strong">
                      {entry.game.opponentLabel || (entry.game.context === "game_training" ? "Spieltraining" : "Spiel")}
                    </p>
                    <p className="text-xs text-muted">{entry.dateKey}</p>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] tabular-nums text-muted">
                      {indicator} {prep} Trainings/3T
                    </span>
                    <span className="rounded-full bg-violet-500/15 px-2 py-1 text-xs tabular-nums text-violet-200">
                      {entry.game.points ?? 0} Pkt
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
